const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
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

const router = express.Router();

// Valida a assinatura X-Hub-Signature-256 enviada pela Meta (HMAC-SHA256 do corpo bruto).
// Retorna: true (válida) | false (inválida/ausente) | 'skip' (META_APP_SECRET não configurado)
function verifyMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return 'skip';

  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// In-memory conversation state (per customer phone per store)
// Format: { "storeId:phone": { step, productId, data: { name, address, time } } }
const conversations = new Map();

function getConvoKey(storeId, phone) {
  return `${storeId}:${phone}`;
}

// WhatsApp Cloud API webhook verification
router.get('/:storeId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId)) {
      return res.sendStatus(403);
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store || !store.botWebhookToken) {
      return res.sendStatus(403);
    }

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === store.botWebhookToken) {
      console.log(`✅ Webhook verificado para loja: ${store.name}`);
      return res.status(200).send(challenge);
    }

    res.sendStatus(403);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// Receive WhatsApp messages
router.post('/:storeId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId)) {
      return res.sendStatus(404);
    }

    // Assinatura inválida → rejeita ANTES de qualquer processamento
    if (verifyMetaSignature(req) === false) {
      return res.sendStatus(401);
    }

    // Always respond 200 immediately (WhatsApp requirement)
    res.sendStatus(200);

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

    if (!store || !store.botEnabled || !store.botToken || !store.botPhoneId) {
      return;
    }

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const msgBody = message.text?.body?.trim() || '';
    const msgLower = msgBody.toLowerCase();
    const msgType = message.type;

    // Handle interactive button/list replies
    const interactiveReply = message.interactive;
    const buttonReply = interactiveReply?.button_reply?.id || '';
    const listReply = interactiveReply?.list_reply?.id || '';
    const replyId = buttonReply || listReply;

    const convoKey = getConvoKey(store.id, from);
    const convo = conversations.get(convoKey);

    // B18 — primeira mensagem de uma conversa fora do horário de funcionamento:
    // apenas AVISA (o cliente continua podendo agendar para os próximos dias)
    if (!convo) {
      await maybeSendAwayMessage(store, from, convoKey);
    }

    // Check if user wants to cancel/restart
    if (msgLower === 'cancelar' || msgLower === 'voltar' || msgLower === 'menu' || msgLower === 'inicio' || msgLower === 'início') {
      conversations.delete(convoKey);
      await sendGreeting(store, from);
      return;
    }

    // If we're in a conversation flow (collecting order info)
    if (convo) {
      await handleConversationFlow(store, from, convoKey, convo, msgBody, replyId);
      return;
    }

    // Standard menu navigation
    if (replyId.startsWith('cat_')) {
      const catId = parseInt(replyId.replace('cat_', ''));
      await sendProductsForCategory(store, from, catId);
    } else if (replyId.startsWith('prod_')) {
      const prodId = parseInt(replyId.replace('prod_', ''));
      await sendProductDetail(store, from, prodId);
    } else if (replyId.startsWith('order_')) {
      // Customer wants to order this specific product — start order flow
      const prodId = parseInt(replyId.replace('order_', ''));
      await startOrderFlow(store, from, convoKey, prodId);
    } else if (replyId === 'ver_catalogo' || msgLower === 'catalogo' || msgLower === 'catálogo' || msgLower === 'menu' || msgLower === 'produtos') {
      await sendCatalogMenu(store, from);
    } else if (replyId === 'ver_todos' || msgLower === 'todos' || msgLower === 'tudo') {
      await sendAllProducts(store, from);
    } else if (replyId === 'fazer_pedido' || msgLower === 'pedido' || msgLower === 'pedir') {
      await sendOrderInstructions(store, from);
    } else if (replyId === 'ver_pedidos' || msgLower === 'meus pedidos') {
      await sendCustomerOrders(store, from);
    } else {
      await sendGreeting(store, from);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
});

// ===== ORDER CONVERSATION FLOW =====

async function startOrderFlow(store, to, convoKey, productId) {
  const product = store.products.find(p => p.id === productId);
  if (!product) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Produto não encontrado.' },
    });
    return;
  }

  // Save conversation state
  conversations.set(convoKey, {
    step: 'ask_name',
    productId: product.id,
    productName: product.name,
    productPrice: product.price,
    data: {},
  });

  await sendWhatsAppMessage(store, to, {
    type: 'text',
    text: {
      body: `✅ Ótimo! Você escolheu:\n\n📦 *${product.name}*\n💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n\nPara prosseguir com o pedido, me diga:\n\n👤 *Qual é o seu nome?*`,
    },
  });
}

async function handleConversationFlow(store, from, convoKey, convo, msgBody, replyId) {
  switch (convo.step) {
    case 'ask_name': {
      convo.data.name = msgBody;
      convo.step = 'ask_time_or_address';
      conversations.set(convoKey, convo);

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `Obrigado, *${msgBody}*! 👋\n\nEsse pedido é para:\n\n🕐 *Agendar um horário* (serviço)\n📍 *Entrega em endereço* (produto)`,
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'type_schedule', title: '🕐 Agendar Horário' } },
              { type: 'reply', reply: { id: 'type_delivery', title: '📍 Com Endereço' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_time_or_address': {
      if (replyId === 'type_schedule') {
        convo.data.type = 'schedule';
        conversations.set(convoKey, convo);
        await startScheduleFlow(store, from, convoKey, convo);
      } else if (replyId === 'type_delivery') {
        convo.step = 'ask_address';
        convo.data.type = 'delivery';
        conversations.set(convoKey, convo);

        await sendWhatsAppMessage(store, from, {
          type: 'text',
          text: {
            body: `📍 *Qual é o endereço de entrega?*\n\nEnvie o endereço completo (rua, número, bairro, referência).`,
          },
        });
      } else {
        // If they typed instead of clicking button
        if (msgBody.toLowerCase().includes('horario') || msgBody.toLowerCase().includes('horário') || msgBody.toLowerCase().includes('agendar')) {
          convo.data.type = 'schedule';
          conversations.set(convoKey, convo);
          await startScheduleFlow(store, from, convoKey, convo);
        } else {
          convo.step = 'ask_address';
          convo.data.type = 'delivery';
          conversations.set(convoKey, convo);
          await sendWhatsAppMessage(store, from, {
            type: 'text',
            text: { body: `📍 *Qual é o endereço de entrega?*` },
          });
        }
      }
      break;
    }

    case 'choose_professional': {
      if (!convo.professionalMap?.length) {
        await startScheduleFlow(store, from, convoKey, convo);
        break;
      }

      let match = null;
      if (replyId.startsWith('prof_')) {
        const raw = replyId.replace('prof_', '');
        match = convo.professionalMap.find(p => (raw === 'any' ? p.id === null : p.id === parseInt(raw, 10)));
      }
      if (!match) {
        match = convo.professionalMap.find(p => p.num === msgBody.trim());
      }
      if (!match) {
        await sendProfessionalOptions(store, from, convoKey, convo, '❌ *Não entendi.* Escolha uma das opções abaixo 👇\n\n');
        break;
      }

      convo.data.professionalId = match.id;
      convo.data.professionalName = match.id === null ? null : match.name;
      conversations.set(convoKey, convo);
      await sendDateOptions(store, from, convoKey, convo);
      break;
    }

    case 'choose_date': {
      if (!convo.dateMap?.length) {
        await sendDateOptions(store, from, convoKey, convo);
        break;
      }

      let match = null;
      if (replyId.startsWith('date_')) {
        const raw = replyId.replace('date_', '');
        match = convo.dateMap.find(d => d.date === raw);
      }
      if (!match) {
        match = convo.dateMap.find(d => d.num === msgBody.trim());
      }
      if (!match) {
        await sendDateOptions(store, from, convoKey, convo, '❌ *Não entendi.* Escolha um dos dias abaixo 👇\n\n');
        break;
      }

      convo.data.date = match.date;
      conversations.set(convoKey, convo);
      await sendTimeOptions(store, from, convoKey, convo, { refresh: true, page: 0 });
      break;
    }

    case 'choose_time': {
      const answer = msgBody.trim();

      if (!convo.slots?.length || !convo.data.date) {
        await sendTimeOptions(store, from, convoKey, convo, { refresh: true, page: 0 });
        break;
      }

      // Paginação: "0" mostra o próximo bloco de horários
      if (answer === '0') {
        await sendTimeOptions(store, from, convoKey, convo, { refresh: false, page: (convo.slotPage || 0) + 1 });
        break;
      }

      const index = /^\d+$/.test(answer) ? parseInt(answer, 10) : 0;
      const chosen = (index >= 1 && index <= convo.slots.length) ? convo.slots[index - 1] : null;
      if (!chosen) {
        await sendTimeOptions(store, from, convoKey, convo, { refresh: false, page: convo.slotPage || 0, prefix: '❌ *Não entendi.* Envie o *número* do horário 👇\n\n' });
        break;
      }

      convo.data.time = chosen;
      conversations.set(convoKey, convo);

      // Observações já coletadas (retorno após horário perdido): grava direto
      if (convo.data.notesDone) {
        await confirmAndSaveOrder(store, from, convoKey, convo);
        break;
      }

      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);

      let resumo = `✅ *${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)} às ${chosen}*\n`;
      if (convo.data.professionalName) resumo += `👤 Com *${convo.data.professionalName}*\n`;
      resumo += `\n💬 Deseja adicionar alguma observação ao pedido? (ex: preferências, alergias, etc.)`;

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: resumo },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'no_notes', title: '❌ Sem observação' } },
              { type: 'reply', reply: { id: 'add_notes', title: '✏️ Sim, adicionar' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_address': {
      convo.data.address = msgBody;
      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `📍 Endereço: *${msgBody}*\n\n💬 Deseja adicionar alguma observação ao pedido?`,
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'no_notes', title: '❌ Sem observação' } },
              { type: 'reply', reply: { id: 'add_notes', title: '✏️ Sim, adicionar' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_notes': {
      if (replyId === 'no_notes') {
        convo.data.notes = null;
        convo.data.notesDone = true;
        await confirmAndSaveOrder(store, from, convoKey, convo);
      } else if (replyId === 'add_notes') {
        convo.step = 'typing_notes';
        conversations.set(convoKey, convo);
        await sendWhatsAppMessage(store, from, {
          type: 'text',
          text: { body: '✏️ Escreva sua observação:' },
        });
      } else {
        // They typed the note directly
        convo.data.notes = msgBody;
        convo.data.notesDone = true;
        await confirmAndSaveOrder(store, from, convoKey, convo);
      }
      break;
    }

    case 'typing_notes': {
      convo.data.notes = msgBody;
      convo.data.notesDone = true;
      await confirmAndSaveOrder(store, from, convoKey, convo);
      break;
    }

    default:
      conversations.delete(convoKey);
      await sendGreeting(store, from);
  }
}

async function confirmAndSaveOrder(store, from, convoKey, convo) {
  const isSchedule = convo.data.type === 'schedule' && !!convo.data.date && !!convo.data.time;

  try {
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
          customerPhone: from,
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
      await sendWhatsAppMessage(store, from, {
        type: 'text',
        text: { body: '😔 *Poxa, esse horário acabou de ser reservado por outra pessoa.*\n\nSem problema. Escolha outro logo abaixo 👇' },
      });
      await sendTimeOptions(store, from, convoKey, convo, { refresh: true, page: 0 });
      return;
    }

    // Alimenta a tela "Clientes" do painel
    await registrarCliente(prisma, store.id, convo.data.name, from);

    // Clear conversation state
    conversations.delete(convoKey);

    // Build confirmation message
    let msg = `🎉 *Pedido #${order.id} registrado com sucesso!*\n\n`;
    msg += `📦 *Produto:* ${convo.productName}\n`;
    msg += `💰 *Valor:* R$ ${convo.productPrice.toFixed(2).replace('.', ',')}\n`;
    msg += `👤 *Nome:* ${convo.data.name}\n`;
    if (isSchedule) {
      msg += `📅 *Data:* ${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)}\n`;
      msg += `🕐 *Horário:* ${convo.data.time}\n`;
      msg += `👥 *Profissional:* ${convo.data.professionalName || 'A definir pela loja'}\n`;
    }
    if (convo.data.address) msg += `📍 *Endereço:* ${convo.data.address}\n`;
    if (convo.data.notes) msg += `💬 *Obs:* ${convo.data.notes}\n`;
    msg += `\n✅ Status: *Aguardando confirmação*\n`;
    msg += `\nO lojista verá seu pedido e entrará em contato para confirmar. Obrigado! 😊`;

    await sendWhatsAppMessage(store, from, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
            { type: 'reply', reply: { id: 'ver_pedidos', title: '📄 Meus Pedidos' } },
          ],
        },
      },
    });
  } catch (error) {
    console.error('Error saving order:', error);
    conversations.delete(convoKey);
    await sendWhatsAppMessage(store, from, {
      type: 'text',
      text: { body: 'Desculpe, houve um erro ao registrar seu pedido. Tente novamente.' },
    });
  }
}

// ===== AGENDAMENTO GUIADO (disponibilidade real) =====

const SLOTS_PER_PAGE = 12;
const MAX_LIST_ROWS = 10; // limite da Cloud API para interactive:list
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

async function sendPlainText(store, to, body) {
  await sendWhatsAppMessage(store, to, { type: 'text', text: { body } });
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
async function maybeSendAwayMessage(store, to, convoKey) {
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

    await sendPlainText(store, to, `🌙 ${away}\n\n_Você pode deixar seu agendamento por aqui mesmo. É só escolher um dos horários da lista._`);
  } catch (error) {
    console.error('Erro ao enviar mensagem de fora do horário:', error.message);
  }
}

// Falha de consulta à agenda: pede desculpas e limpa a conversa
async function failScheduling(store, to, convoKey, error) {
  console.error('Erro ao consultar disponibilidade:', error?.message || error);
  conversations.delete(convoKey);
  try {
    await sendPlainText(store, to, `😥 *Ops!* Tive um problema para consultar a agenda agora.\n\n${storeContactLine(store)}\n\n_Envie "menu" para tentar de novo_`);
  } catch (sendError) {
    console.error('Erro ao avisar falha de agenda:', sendError.message);
  }
}

// Passo 1 — profissional (pulado quando a loja não tem equipe cadastrada)
async function startScheduleFlow(store, to, convoKey, convo) {
  let professionals = [];
  try {
    professionals = await prisma.professional.findMany({
      where: { storeId: store.id, active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
  } catch (error) {
    return failScheduling(store, to, convoKey, error);
  }

  if (professionals.length === 0) {
    convo.data.professionalId = null;
    convo.data.professionalName = null;
    conversations.set(convoKey, convo);
    return sendDateOptions(store, to, convoKey, convo);
  }

  const professionalMap = professionals.slice(0, MAX_LIST_ROWS - 1).map((p, idx) => ({
    num: String(idx + 1),
    id: p.id,
    name: p.name,
  }));
  professionalMap.push({ num: String(professionalMap.length + 1), id: null, name: 'Qualquer profissional' });

  convo.professionalMap = professionalMap;
  convo.step = 'choose_professional';
  conversations.set(convoKey, convo);

  await sendProfessionalOptions(store, to, convoKey, convo);
}

async function sendProfessionalOptions(store, to, convoKey, convo, prefix = '') {
  const map = convo.professionalMap || [];

  let body = `${prefix}👤 *Com quem você quer ser atendido(a)?*\n\n`;
  map.forEach(p => {
    body += `${numLabel(Number(p.num))} ${p.id === null ? '✨ ' : ''}${p.name}\n`;
  });
  body += `\n_Toque em "Escolher" ou envie o número da opção_`;

  const rows = map.map(p => ({
    id: p.id === null ? 'prof_any' : `prof_${p.id}`,
    title: (p.id === null ? '✨ Qualquer um' : p.name).substring(0, 24),
    description: (p.id === null ? 'A loja encaixa quem estiver livre' : `Atendimento com ${p.name}`).substring(0, 72),
  }));

  convo.step = 'choose_professional';
  conversations.set(convoKey, convo);

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body.substring(0, 1024) },
      action: { button: 'Escolher', sections: [{ title: 'Profissionais', rows }] },
    },
  });
}

// Passo 2 — dias com pelo menos um horário livre
async function sendDateOptions(store, to, convoKey, convo, prefix = '') {
  let dates;
  try {
    dates = await getAvailableDates(prisma, store.id, convo.productId, convo.data.professionalId ?? null, 7);
  } catch (error) {
    return failScheduling(store, to, convoKey, error);
  }

  if (!dates || dates.length === 0) {
    conversations.delete(convoKey);
    await sendPlainText(store, to, `${prefix}😕 *Não encontrei horários livres nos próximos dias.*\n\n${storeContactLine(store)}\n\n_Envie "menu" para voltar ao início_`);
    return;
  }

  convo.dateMap = dates.slice(0, MAX_LIST_ROWS).map((d, idx) => ({
    num: String(idx + 1),
    date: d.date,
    count: d.slots.length,
  }));
  convo.step = 'choose_date';
  conversations.set(convoKey, convo);

  let body = `${prefix}📅 *Para qual dia?*\n\n`;
  convo.dateMap.forEach(d => {
    body += `${numLabel(Number(d.num))} ${getDayLabelBR(d.date)} ${formatDateBR(d.date)}: ${d.count} ${d.count === 1 ? 'horário' : 'horários'}\n`;
  });
  body += `\n_Toque em "Escolher dia" ou envie o número_`;

  const rows = convo.dateMap.map(d => ({
    id: `date_${d.date}`,
    title: `${getDayLabelBR(d.date)} ${formatDateBR(d.date)}`.substring(0, 24),
    description: `${d.count} ${d.count === 1 ? 'horário livre' : 'horários livres'}`.substring(0, 72),
  }));

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body.substring(0, 1024) },
      action: { button: 'Escolher dia', sections: [{ title: 'Próximos dias', rows }] },
    },
  });
}

// Passo 3 — horários reais da data escolhida (texto numerado + paginação:
// a lista interativa da Cloud API só aceita 10 linhas)
async function sendTimeOptions(store, to, convoKey, convo, options = {}) {
  const { refresh = true, page = 0, prefix = '' } = options;

  if (refresh) {
    let slots;
    try {
      slots = await getAvailableSlots(prisma, store.id, convo.data.date, convo.productId, convo.data.professionalId ?? null);
    } catch (error) {
      return failScheduling(store, to, convoKey, error);
    }
    if (!slots || slots.length === 0) {
      // Alguém pegou o último horário: volta para a escolha de data
      return sendDateOptions(store, to, convoKey, convo, '😕 *Os horários desse dia acabaram de ser preenchidos.*\n\n');
    }
    convo.slots = slots;
  }

  const total = convo.slots.length;
  const pages = Math.max(Math.ceil(total / SLOTS_PER_PAGE), 1);
  const current = ((page % pages) + pages) % pages;

  convo.slotPage = current;
  convo.step = 'choose_time';
  conversations.set(convoKey, convo);

  const start = current * SLOTS_PER_PAGE;
  const visible = convo.slots.slice(start, start + SLOTS_PER_PAGE);

  let body = `${prefix}🕐 *Horários livres para ${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)}*\n\n`;
  visible.forEach((slot, idx) => {
    body += `${numLabel(start + idx + 1)} ${slot}\n`;
  });
  if (pages > 1) {
    body += `\n${numLabel(0)} Ver mais horários _(página ${current + 1} de ${pages})_\n`;
  }
  body += `\n_Envie o número do horário desejado_`;

  await sendPlainText(store, to, body);
}

// ===== MENU FUNCTIONS =====

async function sendWhatsAppMessage(store, to, payload) {
  const url = `https://graph.facebook.com/v21.0/${store.botPhoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${store.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        ...payload,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('WhatsApp API error:', JSON.stringify(err));
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error.message);
  }
}

async function sendGreeting(store, to) {
  const greeting = store.botGreeting || `Olá! 👋 Bem-vindo(a) à *${store.name}*!`;

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `${greeting}\n\nComo posso te ajudar?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
          { type: 'reply', reply: { id: 'ver_todos', title: '📦 Todos Produtos' } },
          { type: 'reply', reply: { id: 'fazer_pedido', title: '🛒 Fazer Pedido' } },
        ],
      },
    },
  });
}

async function sendCatalogMenu(store, to) {
  const categories = store.categories;

  if (categories.length === 0) {
    await sendAllProducts(store, to);
    return;
  }

  const sections = [{
    title: 'Categorias',
    rows: categories.slice(0, 10).map(cat => ({
      id: `cat_${cat.id}`,
      title: cat.name.substring(0, 24),
      description: `Ver produtos de ${cat.name}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `📋 *Catálogo - ${store.name}*\n\nEscolha uma categoria para ver os produtos:`,
      },
      action: {
        button: 'Ver Categorias',
        sections,
      },
    },
  });
}

async function sendProductsForCategory(store, to, categoryId) {
  const products = store.products.filter(p => p.categoryId === categoryId);
  const category = store.categories.find(c => c.id === categoryId);
  const catName = category?.name || 'Categoria';

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: `Nenhum produto disponível em *${catName}* no momento.` },
    });
    return;
  }

  const sections = [{
    title: catName,
    rows: products.slice(0, 10).map(p => ({
      id: `prod_${p.id}`,
      title: p.name.substring(0, 24),
      description: `R$ ${p.price.toFixed(2).replace('.', ',')}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `📦 *${catName}*\n\nEscolha um produto para ver os detalhes:`,
      },
      action: {
        button: 'Ver Produtos',
        sections,
      },
    },
  });
}

async function sendAllProducts(store, to) {
  const products = store.products;

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Nenhum produto disponível no momento. 😕' },
    });
    return;
  }

  let msg = `📦 *Todos os Produtos - ${store.name}*\n\n`;

  const grouped = {};
  products.forEach(p => {
    const catName = p.category?.name || 'Sem categoria';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(p);
  });

  Object.entries(grouped).forEach(([catName, prods]) => {
    msg += `*${catName}*\n`;
    prods.forEach(p => {
      msg += `  • ${p.name}: R$ ${p.price.toFixed(2).replace('.', ',')}\n`;
    });
    msg += '\n';
  });

  msg += `\n💬 Para fazer um pedido, envie *"pedido"* ou liste os itens que deseja!`;

  await sendWhatsAppMessage(store, to, {
    type: 'text',
    text: { body: msg },
  });
}

async function sendProductDetail(store, to, productId) {
  const product = store.products.find(p => p.id === productId);

  if (!product) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Produto não encontrado.' },
    });
    return;
  }

  let msg = `📦 *${product.name}*\n\n`;
  if (product.description) msg += `${product.description}\n\n`;
  msg += `💰 *Preço: R$ ${product.price.toFixed(2).replace('.', ',')}*\n`;
  if (product.category) msg += `📁 Categoria: ${product.category.name}\n`;

  // Send product info with ORDER button
  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: msg },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `order_${product.id}`, title: '🛒 Pedir Este' } },
          { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
        ],
      },
    },
  });
}

async function sendOrderInstructions(store, to) {
  // Show products as options to order
  const products = store.products;

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Nenhum produto disponível para pedido no momento.' },
    });
    return;
  }

  const sections = [{
    title: 'Escolha um produto',
    rows: products.slice(0, 10).map(p => ({
      id: `order_${p.id}`,
      title: p.name.substring(0, 24),
      description: `R$ ${p.price.toFixed(2).replace('.', ',')}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `🛒 *Fazer Pedido*\n\nEscolha o produto ou serviço que deseja:`,
      },
      action: {
        button: 'Escolher Produto',
        sections,
      },
    },
  });
}

async function sendCustomerOrders(store, from) {
  try {
    const orders = await prisma.order.findMany({
      where: { storeId: store.id, customerPhone: from },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (orders.length === 0) {
      await sendWhatsAppMessage(store, from, {
        type: 'text',
        text: { body: 'Você não tem pedidos recentes. 📋' },
      });
      return;
    }

    let msg = `📄 *Seus Pedidos Recentes*\n\n`;
    const statusEmoji = { pending: '⏳', confirmed: '✅', completed: '🎉', cancelled: '❌' };
    const statusLabel = { pending: 'Aguardando', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };

    orders.forEach(o => {
      msg += `*Pedido #${o.id}:* ${o.product?.name || 'Produto removido'}\n`;
      msg += `  💰 R$ ${(o.totalPrice || 0).toFixed(2).replace('.', ',')}\n`;
      msg += `  ${statusEmoji[o.status] || '❓'} ${statusLabel[o.status] || o.status}\n`;
      if (o.scheduledTime) msg += `  🕐 ${o.scheduledTime}\n`;
      msg += `\n`;
    });

    await sendWhatsAppMessage(store, from, {
      type: 'text',
      text: { body: msg },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
}

module.exports = router;
