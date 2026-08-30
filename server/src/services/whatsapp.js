const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { isEligible } = require('../middleware/premium');
const { withStoreLock } = require('../utils/bookingLock');
const { registrarCliente } = require('../utils/clients');
const {
  getAvailableSlots,
  getAvailableDates,
  buildScheduledAt,
  formatDateBR,
  getDayLabelBR,
  parseConfig,
  timeToMinutes,
  DAYS,
} = require('../utils/availability');

// Suppress Baileys verbose logging
const pino = require('pino');
const logger = pino({ level: 'silent' });

// Store active sessions: { storeId: { socket, qr, status, retries } }
const sessions = new Map();
const sessionsDir = path.join(__dirname, '..', '..', 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

function getSessionPath(storeId) {
  return path.join(sessionsDir, `store_${storeId}`);
}

async function startSession(storeId) {
  // Defesa em profundidade: nunca conectar o bot para loja sem assinatura/trial válido
  // (a rota /connect já valida via requirePremium; isto cobre restoreSessions e reconexões)
  const storeCheck = await prisma.store.findUnique({ where: { id: storeId } });
  if (!storeCheck || !isEligible(storeCheck)) {
    const err = new Error('Assinatura necessária para conectar o bot');
    err.code = 'SUBSCRIPTION_REQUIRED';
    throw err;
  }

  // If session already active, return current state
  if (sessions.has(storeId)) {
    const existing = sessions.get(storeId);
    if (existing.status === 'connected') {
      return { status: 'connected', phone: existing.phone };
    }
    if (existing.status === 'qr' && existing.qrBase64) {
      return { status: 'qr', qr: existing.qrBase64 };
    }
    // If already connecting, don't start another
    if (existing.status === 'connecting') {
      return { status: 'connecting' };
    }
  }

  const sessionPath = getSessionPath(storeId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sessionData = {
    socket: null,
    qr: null,
    qrBase64: null,
    status: 'connecting',
    phone: null,
    retries: sessions.has(storeId) ? (sessions.get(storeId).retries || 0) : 0,
    error: null,
  };
  sessions.set(storeId, sessionData);

  try {
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      version: [2, 3000, 1035920091],
      browser: ['AGTgestor', 'Chrome', '22.0'],
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: false,
    });

    sessionData.socket = socket;

    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generate QR code as base64 image
        try {
          const qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          sessionData.qr = qr;
          sessionData.qrBase64 = qrBase64;
          sessionData.status = 'qr';
          sessionData.retries = 0; // Reset retries on successful QR
          console.log(`📱 QR Code gerado para loja #${storeId}`);
        } catch (err) {
          console.error('Error generating QR:', err);
        }
      }

      if (connection === 'open') {
        sessionData.status = 'connected';
        sessionData.qr = null;
        sessionData.qrBase64 = null;
        sessionData.retries = 0;

        // Get connected phone number
        const phoneNumber = socket.user?.id?.split(':')[0] || socket.user?.id?.split('@')[0] || '';
        sessionData.phone = phoneNumber;

        console.log(`✅ WhatsApp conectado para loja #${storeId} (${phoneNumber})`);

        // Só habilita o bot se a loja continua elegível (pode ter cancelado entre o QR e a conexão)
        const storeNow = await prisma.store.findUnique({ where: { id: storeId } });
        if (storeNow && isEligible(storeNow)) {
          await prisma.store.update({
            where: { id: storeId },
            data: { botEnabled: true },
          });
        } else {
          console.log(`🚫 Loja #${storeId} sem assinatura elegível — encerrando sessão recém-conectada`);
          stopSession(storeId).catch((err) => console.error('Erro ao encerrar sessão inelegível:', err.message));
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorCode = lastDisconnect?.error?.code;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`❌ WhatsApp desconectado loja #${storeId} (code: ${statusCode}, error: ${errorCode})`);

        // Check for network errors - don't retry
        if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ENETUNREACH') {
          console.log(`🚫 Erro de rede para loja #${storeId} - rede bloqueando WhatsApp`);
          sessionData.status = 'error';
          sessionData.error = 'Não foi possível conectar ao WhatsApp. Verifique se sua rede permite conexões ao WhatsApp (porta 443). Em redes corporativas ou restritas, o WhatsApp pode estar bloqueado.';
          // Clean session files
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          return;
        }

        if (shouldReconnect && sessionData.retries < 3) {
          sessionData.retries++;
          sessionData.status = 'reconnecting';
          console.log(`🔄 Reconectando loja #${storeId} (tentativa ${sessionData.retries})`);
          setTimeout(() => {
            startSession(storeId).catch(err => {
              console.error(`Reconnect failed for store #${storeId}:`, err.message);
              // Marca a sessão como erro para o frontend parar o polling de "reconnecting"
              const s = sessions.get(storeId);
              if (s) {
                s.status = 'error';
                s.error = 'Não foi possível reconectar. Conecte novamente pelo painel.';
              }
            });
          }, 5000);
        } else {
          sessionData.status = 'error';
          sessionData.error = statusCode === DisconnectReason.loggedOut
            ? 'WhatsApp foi deslogado. Escaneie o QR Code novamente.'
            : 'Não foi possível conectar. Tente novamente.';
          
          if (statusCode === DisconnectReason.loggedOut) {
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
            }
          }

          // Update store in database
          await prisma.store.update({
            where: { id: storeId },
            data: { botEnabled: false },
          });
        }
      }
    });

    // Save credentials when updated
    socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue; // Ignore own messages
        if (!msg.message) continue;

        const from = msg.key.remoteJid;
        if (!from || from.endsWith('@g.us')) continue; // Skip group messages

        const text = msg.message.conversation
          || msg.message.extendedTextMessage?.text
          || msg.message.buttonsResponseMessage?.selectedDisplayText
          || msg.message.listResponseMessage?.title
          || '';

        if (!text.trim()) continue;

        await handleIncomingMessage(storeId, socket, from, text.trim(), msg);
      }
    });

    return { status: 'connecting' };
  } catch (error) {
    console.error(`Error starting session for store #${storeId}:`, error);
    sessions.delete(storeId);
    throw error;
  }
}

async function stopSession(storeId) {
  const session = sessions.get(storeId);
  if (session?.socket) {
    try {
      await session.socket.logout();
    } catch (err) {
      console.error('Logout error ignored:', err);
    }
    session.socket = null;
  }
  sessions.delete(storeId);

  // Clear session files
  const sessionPath = getSessionPath(storeId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  // Update store
  await prisma.store.update({
    where: { id: storeId },
    data: { botEnabled: false },
  });
}

function getSessionStatus(storeId) {
  const session = sessions.get(storeId);
  if (!session) return { status: 'disconnected' };

  return {
    status: session.status,
    qr: session.qrBase64 || null,
    phone: session.phone || null,
    error: session.error || null,
  };
}

// ===== MESSAGE HANDLING =====

// Conversation state for order flow
const conversations = new Map();

async function handleIncomingMessage(storeId, socket, from, text, msg) {
  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        categories: { orderBy: { order: 'asc' } },
        products: {
          where: { active: true },
          orderBy: [{ order: 'asc' }],
          include: { category: true },
        },
      },
    });

    if (!store) return;

    const msgLower = text.toLowerCase();
    const convoKey = `${storeId}:${from}`;
    const convo = conversations.get(convoKey);

    // B18 — primeira mensagem de uma conversa fora do horário de funcionamento:
    // apenas AVISA (a loja pode receber agendamento para os próximos dias)
    if (!convo) {
      await maybeSendAwayMessage(store, socket, from, convoKey);
    }

    // Cancel / menu
    if (['cancelar', 'voltar', 'menu', 'inicio', 'início', 'oi', 'olá', 'ola', 'hi', 'hello'].includes(msgLower)) {
      conversations.delete(convoKey);
      await sendText(socket, from, buildGreeting(store));
      return;
    }

    // In a conversation flow
    if (convo) {
      await handleOrderFlow(store, socket, from, convoKey, convo, text, msg);
      return;
    }

    // Menu navigation by number or keyword
    if (msgLower === '1' || msgLower === 'catalogo' || msgLower === 'catálogo' || msgLower === 'produtos') {
      await sendCatalog(store, socket, from);
    } else if (msgLower === '2' || msgLower === 'pedido' || msgLower === 'pedir') {
      await sendOrderMenu(store, socket, from);
    } else if (msgLower === '3' || msgLower === 'meus pedidos') {
      await sendMyOrders(store, socket, from);
    } else {
      // Default greeting
      await sendText(socket, from, buildGreeting(store));
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

function buildGreeting(store) {
  const greeting = store.botGreeting || `Olá! 👋 Bem-vindo(a) à *${store.name}*!`;
  let msg = `${greeting}\n\n`;
  msg += `Como posso te ajudar?\n\n`;
  msg += `*1️⃣* 📋 Ver Catálogo\n`;
  msg += `*2️⃣* 🛒 Fazer Pedido\n`;
  msg += `*3️⃣* 📄 Meus Pedidos\n\n`;
  msg += `_Envie o número da opção desejada_`;
  return msg;
}

async function sendCatalog(store, socket, from) {
  const categories = store.categories;
  const convoKey = `${store.id}:${from}`;

  if (categories.length === 0) {
    await sendAllProducts(store, socket, from);
    return;
  }

  let msg = `📋 *Catálogo - ${store.name}*\n\n`;
  msg += `Escolha uma categoria:\n\n`;
  const categoryMap = [];
  categories.forEach((cat, idx) => {
    const num = (idx + 1).toString();
    categoryMap.push({ num, id: cat.id });
    const count = store.products.filter(p => p.categoryId === cat.id).length;
    msg += `➡️ *${num}.* ${cat.name} (${count} itens)\n`;
  });
  msg += `\n_Envie o número da categoria_`;

  conversations.set(convoKey, { step: 'choose_category', categoryMap });
  await sendText(socket, from, msg);
}

async function sendCategoryProducts(store, socket, from, categoryId) {
  const products = store.products.filter(p => p.categoryId === categoryId);
  const category = store.categories.find(c => c.id === categoryId);
  const catName = category?.name || 'Categoria';
  const convoKey = `${store.id}:${from}`;

  if (products.length === 0) {
    await sendText(socket, from, `Nenhum produto disponível em *${catName}* no momento.`);
    return;
  }

  let msg = `📦 *${catName}*\n\n`;
  const productMap = [];
  products.forEach((p, idx) => {
    const num = (idx + 1).toString();
    productMap.push({ num, id: p.id });
    msg += `🔹 *${num}.* ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
    if (p.description) msg += `   _${p.description}_\n`;
  });
  msg += `\n_Para pedir, envie o número do produto. Ou envie "menu" para voltar._`;

  conversations.set(convoKey, { step: 'choose_product', productMap });
  await sendText(socket, from, msg);
}

async function sendAllProducts(store, socket, from) {
  const products = store.products;
  const convoKey = `${store.id}:${from}`;

  if (products.length === 0) {
    await sendText(socket, from, 'Nenhum produto disponível no momento. 😕');
    return;
  }

  let msg = `📦 *Todos os Produtos - ${store.name}*\n\n`;
  const grouped = {};
  products.forEach(p => {
    const catName = p.category?.name || 'Sem categoria';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(p);
  });

  let productCounter = 1;
  const productMap = [];

  Object.entries(grouped).forEach(([catName, prods]) => {
    msg += `*${catName}*\n`;
    prods.forEach(p => {
      const num = productCounter.toString();
      productMap.push({ num, id: p.id });
      productCounter++;
      msg += `  🔹 *${num}.* ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
    });
    msg += '\n';
  });
  msg += `_Envie o número do produto para fazer pedido_`;

  conversations.set(convoKey, { step: 'choose_product', productMap });
  await sendText(socket, from, msg);
}

async function sendOrderMenu(store, socket, from) {
  const products = store.products;
  const convoKey = `${store.id}:${from}`;

  if (products.length === 0) {
    await sendText(socket, from, 'Nenhum produto disponível para pedido no momento.');
    return;
  }

  let msg = `🛒 *Fazer Pedido*\n\nEscolha o produto ou serviço:\n\n`;
  const productMap = [];
  products.forEach((p, idx) => {
    const num = (idx + 1).toString();
    productMap.push({ num, id: p.id });
    msg += `🔹 *${num}.* ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
  });
  msg += `\n_Envie o número do produto desejado_`;

  conversations.set(convoKey, { step: 'choose_product', productMap });
  await sendText(socket, from, msg);
}

// ===== ORDER FLOW =====

async function startOrderFlow(store, socket, from, convoKey, productId) {
  const product = store.products.find(p => p.id === productId);
  if (!product) {
    await sendText(socket, from, 'Produto não encontrado. Envie *menu* para ver as opções.');
    return;
  }

  conversations.set(convoKey, {
    step: 'ask_name',
    productId: product.id,
    productName: product.name,
    productPrice: product.price,
    data: {},
  });

  let msg = `✅ Ótimo! Você escolheu:\n\n`;
  msg += `📦 *${product.name}*\n`;
  msg += `💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n\n`;
  msg += `Para prosseguir, me diga:\n\n👤 *Qual é o seu nome?*`;

  await sendText(socket, from, msg);
}

// ===== AGENDAMENTO GUIADO (disponibilidade real) =====

const SLOTS_PER_PAGE = 12;
const NUM_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const AWAY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Avisos de "fora do horário" já enviados: convoKey -> timestamp
const awayNotified = new Map();

function numLabel(n) {
  return NUM_EMOJI[n] ? `*${NUM_EMOJI[n]}*` : `*${n}*`;
}

function storeContactLine(store) {
  return store.phone
    ? `📞 Fale direto com a gente: *${store.phone}*`
    : '📞 Fale direto com a loja para combinar um horário.';
}

// A loja está aberta AGORA? Convenção de fuso "fake UTC = BRT (UTC-3)", igual a utils/availability
function isStoreOpenNow(store) {
  const config = parseConfig(store.schedulingConfig);
  const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const day = config.hours[DAYS[nowBRT.getUTCDay()]];
  if (!day?.active) return false;

  const nowMin = nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes();
  const open = timeToMinutes(day.open);
  const close = timeToMinutes(day.close);
  if (open === null || close === null) return false;

  return nowMin >= open && nowMin < close;
}

// Só informa — NUNCA bloqueia o agendamento
async function maybeSendAwayMessage(store, socket, from, convoKey) {
  try {
    const away = (store.botAwayMessage || '').trim();
    if (!away || isStoreOpenNow(store)) return;

    const last = awayNotified.get(convoKey) || 0;
    if (Date.now() - last < AWAY_COOLDOWN_MS) return;

    if (awayNotified.size > 2000) {
      for (const [key, ts] of awayNotified) {
        if (Date.now() - ts > AWAY_COOLDOWN_MS) awayNotified.delete(key);
      }
    }
    awayNotified.set(convoKey, Date.now());

    await sendText(socket, from, `🌙 ${away}\n\n_Você pode deixar seu agendamento por aqui mesmo. É só escolher um dos horários da lista._`);
  } catch (error) {
    console.error('Erro ao enviar mensagem de fora do horário:', error.message);
  }
}

// Falha de consulta à agenda: pede desculpas e limpa a conversa
async function failScheduling(store, socket, from, convoKey, error) {
  console.error('Erro ao consultar disponibilidade:', error?.message || error);
  conversations.delete(convoKey);
  await sendText(socket, from, `😥 *Ops!* Tive um problema para consultar a agenda agora.\n\n${storeContactLine(store)}\n\n_Envie "menu" para tentar de novo_`);
}

function buildProfessionalsMessage(professionalMap, prefix = '') {
  let msg = `${prefix}👤 *Com quem você quer ser atendido(a)?*\n\n`;
  professionalMap.forEach(p => {
    msg += `${numLabel(Number(p.num))} ${p.id === null ? '✨ ' : ''}${p.name}\n`;
  });
  msg += `\n_Envie o número da opção desejada_`;
  return msg;
}

function buildDatesMessage(convo, prefix = '') {
  let msg = `${prefix}📅 *Para qual dia?*\n\n`;
  convo.dateMap.forEach(d => {
    const label = `${getDayLabelBR(d.date)} ${formatDateBR(d.date)}`;
    msg += `${numLabel(Number(d.num))} ${label}: ${d.count} ${d.count === 1 ? 'horário' : 'horários'}\n`;
  });
  msg += `\n_Envie o número do dia desejado_`;
  return msg;
}

function buildSlotsMessage(convo, prefix = '') {
  const total = convo.slots.length;
  const pages = Math.max(Math.ceil(total / SLOTS_PER_PAGE), 1);
  const page = convo.slotPage || 0;
  const start = page * SLOTS_PER_PAGE;
  const visible = convo.slots.slice(start, start + SLOTS_PER_PAGE);

  let msg = `${prefix}🕐 *Horários livres para ${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)}*\n\n`;
  visible.forEach((slot, idx) => {
    msg += `${numLabel(start + idx + 1)} ${slot}\n`;
  });
  if (pages > 1) {
    msg += `\n${numLabel(0)} Ver mais horários _(página ${page + 1} de ${pages})_\n`;
  }
  msg += `\n_Envie o número do horário desejado_`;
  return msg;
}

// Passo 1 — profissional (pulado quando a loja não tem equipe cadastrada)
async function startScheduleFlow(store, socket, from, convoKey, convo) {
  let professionals = [];
  try {
    professionals = await prisma.professional.findMany({
      where: { storeId: store.id, active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
  } catch (error) {
    return failScheduling(store, socket, from, convoKey, error);
  }

  if (professionals.length === 0) {
    convo.data.professionalId = null;
    convo.data.professionalName = null;
    conversations.set(convoKey, convo);
    return sendDateOptions(store, socket, from, convoKey, convo);
  }

  const professionalMap = professionals.slice(0, 20).map((p, idx) => ({
    num: String(idx + 1),
    id: p.id,
    name: p.name,
  }));
  professionalMap.push({ num: String(professionalMap.length + 1), id: null, name: 'Qualquer profissional' });

  convo.professionalMap = professionalMap;
  convo.step = 'choose_professional';
  conversations.set(convoKey, convo);

  await sendText(socket, from, buildProfessionalsMessage(professionalMap));
}

// Passo 2 — dias com pelo menos um horário livre (próximos 7 dias úteis da agenda)
async function sendDateOptions(store, socket, from, convoKey, convo, prefix = '') {
  let dates;
  try {
    dates = await getAvailableDates(prisma, store.id, convo.productId, convo.data.professionalId ?? null, 7);
  } catch (error) {
    return failScheduling(store, socket, from, convoKey, error);
  }

  if (!dates || dates.length === 0) {
    conversations.delete(convoKey);
    await sendText(socket, from, `${prefix}😕 *Não encontrei horários livres nos próximos dias.*\n\n${storeContactLine(store)}\n\n_Envie "menu" para voltar ao início_`);
    return;
  }

  convo.dateMap = dates.map((d, idx) => ({ num: String(idx + 1), date: d.date, count: d.slots.length }));
  convo.step = 'choose_date';
  conversations.set(convoKey, convo);

  await sendText(socket, from, buildDatesMessage(convo, prefix));
}

// Passo 3 — horários reais da data escolhida (paginados)
async function sendTimeOptions(store, socket, from, convoKey, convo, options = {}) {
  const { refresh = true, page = 0, prefix = '' } = options;

  if (refresh) {
    let slots;
    try {
      slots = await getAvailableSlots(prisma, store.id, convo.data.date, convo.productId, convo.data.professionalId ?? null);
    } catch (error) {
      return failScheduling(store, socket, from, convoKey, error);
    }
    if (!slots || slots.length === 0) {
      // Alguém pegou o último horário: volta para a escolha de data
      return sendDateOptions(store, socket, from, convoKey, convo, '😕 *Os horários desse dia acabaram de ser preenchidos.*\n\n');
    }
    convo.slots = slots;
  }

  const pages = Math.max(Math.ceil(convo.slots.length / SLOTS_PER_PAGE), 1);
  convo.slotPage = ((page % pages) + pages) % pages;
  convo.step = 'choose_time';
  conversations.set(convoKey, convo);

  await sendText(socket, from, buildSlotsMessage(convo, prefix));
}

async function handleOrderFlow(store, socket, from, convoKey, convo, text, msg) {
  switch (convo.step) {
    case 'choose_category': {
      const match = convo.categoryMap?.find(c => c.num === text.trim());
      if (match) {
        await sendCategoryProducts(store, socket, from, match.id);
      } else {
        await sendText(socket, from, '❌ Opção inválida. Por favor, envie o número da categoria.');
      }
      break;
    }

    case 'choose_product': {
      const match = convo.productMap?.find(p => p.num === text.trim());
      if (match) {
        await startOrderFlow(store, socket, from, convoKey, match.id);
      } else {
        await sendText(socket, from, '❌ Opção inválida. Por favor, envie o número do produto.');
      }
      break;
    }

    case 'ask_name': {
      convo.data.name = text;
      convo.step = 'ask_type';
      conversations.set(convoKey, convo);

      let msg = `Obrigado, *${text}*! 👋\n\n`;
      msg += `Esse pedido é para:\n\n`;
      msg += `*1️⃣* 🕐 Agendar um horário (serviço)\n`;
      msg += `*2️⃣* 📍 Entrega em endereço (produto)\n\n`;
      msg += `_Envie 1 ou 2_`;

      await sendText(socket, from, msg);
      break;
    }

    case 'ask_type': {
      if (text === '1' || text.toLowerCase().includes('hor') || text.toLowerCase().includes('agend')) {
        convo.data.type = 'schedule';
        conversations.set(convoKey, convo);
        await startScheduleFlow(store, socket, from, convoKey, convo);
      } else {
        convo.step = 'ask_address';
        convo.data.type = 'delivery';
        conversations.set(convoKey, convo);
        await sendText(socket, from, `📍 *Qual é o endereço de entrega?*\n\nEnvie o endereço completo (rua, número, bairro).`);
      }
      break;
    }

    case 'choose_professional': {
      if (!convo.professionalMap?.length) {
        await startScheduleFlow(store, socket, from, convoKey, convo);
        break;
      }
      const match = convo.professionalMap.find(p => p.num === text.trim());
      if (!match) {
        await sendText(socket, from, buildProfessionalsMessage(convo.professionalMap, '❌ *Não entendi.* Escolha uma das opções abaixo 👇\n\n'));
        break;
      }
      convo.data.professionalId = match.id;
      convo.data.professionalName = match.id === null ? null : match.name;
      conversations.set(convoKey, convo);
      await sendDateOptions(store, socket, from, convoKey, convo);
      break;
    }

    case 'choose_date': {
      if (!convo.dateMap?.length) {
        await sendDateOptions(store, socket, from, convoKey, convo);
        break;
      }
      const match = convo.dateMap.find(d => d.num === text.trim());
      if (!match) {
        await sendText(socket, from, buildDatesMessage(convo, '❌ *Não entendi.* Escolha um dos dias abaixo 👇\n\n'));
        break;
      }
      convo.data.date = match.date;
      conversations.set(convoKey, convo);
      await sendTimeOptions(store, socket, from, convoKey, convo, { refresh: true, page: 0 });
      break;
    }

    case 'choose_time': {
      const answer = text.trim();

      if (!convo.slots?.length || !convo.data.date) {
        await sendTimeOptions(store, socket, from, convoKey, convo, { refresh: true, page: 0 });
        break;
      }

      // Paginação: "0" mostra o próximo bloco de horários
      if (answer === '0') {
        await sendTimeOptions(store, socket, from, convoKey, convo, { refresh: false, page: (convo.slotPage || 0) + 1 });
        break;
      }

      const index = /^\d+$/.test(answer) ? parseInt(answer, 10) : 0;
      const chosen = (index >= 1 && index <= convo.slots.length) ? convo.slots[index - 1] : null;
      if (!chosen) {
        await sendText(socket, from, buildSlotsMessage(convo, '❌ *Não entendi.* Envie o *número* do horário 👇\n\n'));
        break;
      }

      convo.data.time = chosen;
      conversations.set(convoKey, convo);

      // Se as observações já foram coletadas (retorno após horário perdido), salva direto
      if (convo.data.notesDone) {
        await saveOrder(store, socket, from, convoKey, convo, msg);
        break;
      }

      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);

      let resumo = `✅ *${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)} às ${chosen}*\n`;
      if (convo.data.professionalName) resumo += `👤 Com *${convo.data.professionalName}*\n`;
      resumo += `\n💬 Deseja adicionar alguma observação?\n\n*1️⃣* Sem observação\n*2️⃣* Sim, quero adicionar\n\n_Envie 1 ou 2, ou escreva sua observação direto_`;

      await sendText(socket, from, resumo);
      break;
    }

    case 'ask_address': {
      convo.data.address = text;
      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);
      await sendText(socket, from, `📍 Endereço: *${text}*\n\n💬 Deseja adicionar alguma observação?\n\n*1️⃣* Sem observação\n*2️⃣* Sim, quero adicionar\n\n_Envie 1 ou 2, ou escreva sua observação direto_`);
      break;
    }

    case 'ask_notes': {
      if (text === '1' || text.toLowerCase() === 'sem' || text.toLowerCase() === 'não' || text.toLowerCase() === 'nao') {
        convo.data.notes = null;
        convo.data.notesDone = true;
        await saveOrder(store, socket, from, convoKey, convo, msg);
      } else if (text === '2') {
        convo.step = 'typing_notes';
        conversations.set(convoKey, convo);
        await sendText(socket, from, '✏️ Escreva sua observação:');
      } else {
        convo.data.notes = text;
        convo.data.notesDone = true;
        await saveOrder(store, socket, from, convoKey, convo, msg);
      }
      break;
    }

    case 'typing_notes': {
      convo.data.notes = text;
      convo.data.notesDone = true;
      await saveOrder(store, socket, from, convoKey, convo, msg);
      break;
    }

    default:
      conversations.delete(convoKey);
      await sendText(socket, from, buildGreeting(store));
  }
}

async function saveOrder(store, socket, from, convoKey, convo, msg) {
  const isSchedule = convo.data.type === 'schedule' && !!convo.data.date && !!convo.data.time;

  // Revalida a disponibilidade ANTES de gravar — entre a escolha e a confirmação
  // (o cliente digita as observações) outra pessoa pode ter pego o horário
  try {
    let customerPhone = from.split('@')[0];

    // Fallback pra pegar o número real caso seja um @lid (ocorre quando a pessoa testa o bot mandando mensagem para si mesma)
    if (msg?.key?.participant) {
      customerPhone = msg.key.participant.split('@')[0];
    } else if (from.includes('@lid') && socket.user?.id) {
      customerPhone = socket.user.id.split(':')[0].split('@')[0];
    }

    const scheduledLabel = isSchedule ? `${formatDateBR(convo.data.date)} ${convo.data.time}` : null;

    // Revalidar + gravar sob o mesmo lock da loja: entre a escolha do horário e
    // a confirmação o cliente digita as observações, e nesse intervalo outra
    // pessoa (ou o painel) pode ter pegado o slot.
    const order = await withStoreLock(store.id, async () => {
      if (isSchedule) {
        const slots = await getAvailableSlots(
          prisma, store.id, convo.data.date, convo.productId, convo.data.professionalId ?? null,
        );
        if (!slots.includes(convo.data.time)) return null;
      }

      return prisma.order.create({
        data: {
          storeId: store.id,
          productId: convo.productId,
          professionalId: isSchedule ? (convo.data.professionalId ?? null) : null,
          customerName: convo.data.name,
          customerPhone: customerPhone,
          customerAddress: convo.data.address || null,
          scheduledAt: isSchedule ? buildScheduledAt(convo.data.date, convo.data.time) : null,
          // scheduledTime legível: a Agenda do painel usa como fallback de exibição
          scheduledTime: scheduledLabel,
          notes: convo.data.notes || null,
          status: 'pending',
          totalPrice: convo.productPrice,
        },
      });
    });

    if (!order) {
      convo.data.time = null;
      conversations.set(convoKey, convo);
      await sendText(socket, from, `😔 *Poxa, esse horário acabou de ser reservado por outra pessoa.*\n\nSem problema. Escolha outro logo abaixo 👇`);
      await sendTimeOptions(store, socket, from, convoKey, convo, { refresh: true, page: 0 });
      return;
    }

    // Alimenta a tela "Clientes" do painel
    await registrarCliente(prisma, store.id, convo.data.name, customerPhone);

    conversations.delete(convoKey);

    let resposta = `🎉 *Pedido #${order.id} registrado com sucesso!*\n\n`;
    resposta += `📦 *Produto:* ${convo.productName}\n`;
    resposta += `💰 *Valor:* R$ ${convo.productPrice.toFixed(2).replace('.', ',')}\n`;
    resposta += `👤 *Nome:* ${convo.data.name}\n`;
    if (isSchedule) {
      resposta += `📅 *Data:* ${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)}\n`;
      resposta += `🕐 *Horário:* ${convo.data.time}\n`;
      resposta += `👥 *Profissional:* ${convo.data.professionalName || 'A definir pela loja'}\n`;
    }
    if (convo.data.address) resposta += `📍 *Endereço:* ${convo.data.address}\n`;
    if (convo.data.notes) resposta += `💬 *Obs:* ${convo.data.notes}\n`;
    resposta += `\n✅ Status: *Aguardando confirmação*\n`;
    resposta += `\nO lojista verá seu pedido e entrará em contato. Obrigado! 😊\n\n`;
    resposta += `_Envie "menu" para voltar ao início_`;

    await sendText(socket, from, resposta);
  } catch (error) {
    console.error('Erro ao salvar pedido:', error);
    require('fs').writeFileSync('erro_pedido.log', error.stack || error.message);
    conversations.delete(convoKey);
    await sendText(socket, from, 'Desculpe, houve um erro ao registrar seu pedido. Envie *menu* para tentar novamente.');
  }
}

async function sendMyOrders(store, socket, from) {
  try {
    const customerPhone = from.replace('@s.whatsapp.net', '');

    const orders = await prisma.order.findMany({
      where: { storeId: store.id, customerPhone },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (orders.length === 0) {
      await sendText(socket, from, 'Você não tem pedidos recentes. 📋\n\n_Envie "menu" para ver as opções_');
      return;
    }

    const statusEmoji = { pending: '⏳', confirmed: '✅', completed: '🎉', cancelled: '❌' };
    const statusLabel = { pending: 'Aguardando', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };

    let msg = `📄 *Seus Pedidos Recentes*\n\n`;
    orders.forEach(o => {
      msg += `*Pedido #${o.id}:* ${o.product?.name || 'Produto'}\n`;
      msg += `  💰 R$ ${(o.totalPrice || 0).toFixed(2).replace('.', ',')}\n`;
      msg += `  ${statusEmoji[o.status] || '❓'} ${statusLabel[o.status] || o.status}\n\n`;
    });
    msg += `_Envie "menu" para voltar ao início_`;

    await sendText(socket, from, msg);
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
}

async function sendText(socket, to, text) {
  try {
    await socket.sendMessage(to, { text });
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

// Restore sessions on server startup (only restore fully authenticated sessions)
async function restoreSessions() {
  if (!fs.existsSync(sessionsDir)) return;
  const dirs = fs.readdirSync(sessionsDir).filter(d => d.startsWith('store_'));
  for (const dir of dirs) {
    const storeId = parseInt(dir.replace('store_', ''));
    if (isNaN(storeId)) continue;

    // Only restore if creds.json exists (means QR was scanned before)
    const credsPath = path.join(sessionsDir, dir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
      console.log(`⏭️ Ignorando sessão incompleta para loja #${storeId}`);
      // Clean up incomplete session
      fs.rmSync(path.join(sessionsDir, dir), { recursive: true, force: true });
      continue;
    }

    // Check if creds have a registered flag (user completed pairing)
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      if (!creds.me?.id) {
        console.log(`⏭️ Sessão sem autenticação completa para loja #${storeId}`);
        fs.rmSync(path.join(sessionsDir, dir), { recursive: true, force: true });
        continue;
      }
    } catch(e) {
      fs.rmSync(path.join(sessionsDir, dir), { recursive: true, force: true });
      continue;
    }

    // Não restaurar sessões de lojas sem assinatura/trial válido
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !isEligible(store)) {
      console.log(`⏭️ Loja #${storeId} sem assinatura elegível — sessão não restaurada`);
      continue;
    }

    console.log(`🔄 Restaurando sessão WhatsApp para loja #${storeId}`);
    try {
      await startSession(storeId);
    } catch (err) {
      console.error(`Failed to restore session for store #${storeId}:`, err.message);
    }
  }
}

async function sendMessageToCustomer(storeId, phone, text) {
  try {
    const session = sessions.get(storeId);
    if (!session || session.status !== 'connected' || !session.socket) {
      console.log(`[Whatsapp] Não foi possível enviar mensagem para ${phone}: loja #${storeId} não conectada.`);
      return false;
    }
    const to = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
    await sendText(session.socket, to, text);
    return true;
  } catch (error) {
    console.error(`[Whatsapp] Erro ao enviar mensagem para ${phone} (loja ${storeId}):`, error.message);
    return false;
  }
}

module.exports = {
  startSession,
  stopSession,
  getSessionStatus,
  restoreSessions,
  sendMessageToCustomer,
  // Ponto de teste: permite exercitar o fluxo de conversa sem abrir uma sessão
  // real do WhatsApp. Não altera o comportamento em produção.
  __test: { handleIncomingMessage, conversations },
};
