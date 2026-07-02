const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');

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

        // Update store in database
        await prisma.store.update({
          where: { id: storeId },
          data: { botEnabled: true },
        });
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
    msg += `➡️ *${num}* — ${cat.name} (${count} itens)\n`;
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
    msg += `🔹 *${num}* — ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
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
      msg += `  🔹 *${num}* — ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
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
    msg += `🔹 *${num}* — ${p.name} (R$ ${p.price.toFixed(2).replace('.', ',')})\n`;
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
        convo.step = 'ask_time';
        convo.data.type = 'schedule';
        conversations.set(convoKey, convo);
        await sendText(socket, from, `🕐 *Qual horário e dia você prefere?*\n\nExemplos:\n• "Amanhã às 14h"\n• "Sábado de manhã"\n• "26/03 às 10:00"`);
      } else {
        convo.step = 'ask_address';
        convo.data.type = 'delivery';
        conversations.set(convoKey, convo);
        await sendText(socket, from, `📍 *Qual é o endereço de entrega?*\n\nEnvie o endereço completo (rua, número, bairro).`);
      }
      break;
    }

    case 'ask_time': {
      convo.data.scheduledTime = text;
      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);
      await sendText(socket, from, `⏰ Horário: *${text}*\n\n💬 Deseja adicionar alguma observação?\n\n*1️⃣* Sem observação\n*2️⃣* Sim, quero adicionar\n\n_Envie 1 ou 2, ou escreva sua observação direto_`);
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
        await saveOrder(store, socket, from, convoKey, convo, msg);
      } else if (text === '2') {
        convo.step = 'typing_notes';
        conversations.set(convoKey, convo);
        await sendText(socket, from, '✏️ Escreva sua observação:');
      } else {
        convo.data.notes = text;
        await saveOrder(store, socket, from, convoKey, convo, msg);
      }
      break;
    }

    case 'typing_notes': {
      convo.data.notes = text;
      await saveOrder(store, socket, from, convoKey, convo, msg);
      break;
    }

    default:
      conversations.delete(convoKey);
      await sendText(socket, from, buildGreeting(store));
  }
}

async function saveOrder(store, socket, from, convoKey, convo, msg) {
  try {
    let customerPhone = from.split('@')[0];
    
    // Fallback pra pegar o número real caso seja um @lid (ocorre quando a pessoa testa o bot mandando mensagem para si mesma)
    if (msg?.key?.participant) {
      customerPhone = msg.key.participant.split('@')[0];
    } else if (from.includes('@lid') && socket.user?.id) {
      customerPhone = socket.user.id.split(':')[0].split('@')[0];
    }

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        productId: convo.productId,
        customerName: convo.data.name,
        customerPhone: customerPhone,
        customerAddress: convo.data.address || null,
        scheduledTime: convo.data.scheduledTime || null,
        notes: convo.data.notes || null,
        status: 'pending',
        totalPrice: convo.productPrice,
      },
    });

    conversations.delete(convoKey);

    let resposta = `🎉 *Pedido #${order.id} registrado com sucesso!*\n\n`;
    resposta += `📦 *Produto:* ${convo.productName}\n`;
    resposta += `💰 *Valor:* R$ ${convo.productPrice.toFixed(2).replace('.', ',')}\n`;
    resposta += `👤 *Nome:* ${convo.data.name}\n`;
    if (convo.data.scheduledTime) resposta += `🕐 *Horário:* ${convo.data.scheduledTime}\n`;
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
      msg += `*#${o.id}* — ${o.product?.name || 'Produto'}\n`;
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

module.exports = { startSession, stopSession, getSessionStatus, restoreSessions, sendMessageToCustomer };
