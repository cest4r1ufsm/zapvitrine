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
  if (!secret) return false;

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

// The salon removed us in Meta, or Meta disabled the account: stop the bot and ask for a new connection.
const ACCOUNT_LOST = { PARTNER_REMOVED: 'Seu WhatsApp foi desconectado na Meta. Conecte de novo para o robô voltar.', PARTNER_APP_UNINSTALLED: 'Seu WhatsApp foi desconectado na Meta. Conecte de novo para o robô voltar.', ACCOUNT_DELETED: 'A conta do WhatsApp foi apagada na Meta. Conecte de novo.' };
async function handleAccountUpdate(entry, value) {
  const wabaId = String(value.waba_info?.waba_id || entry.id || '');
  if (!/^\d+$/.test(wabaId)) return;
  if (ACCOUNT_LOST[value.event]) {
    await prisma.store.updateMany({ where: { officialWabaId: wabaId }, data: { botEnabled: false, officialStatus: 'reauthorization_required', officialLastError: ACCOUNT_LOST[value.event] } });
  } else if (value.event === 'ACCOUNT_OFFBOARDED') {
    await prisma.store.updateMany({ where: { officialWabaId: wabaId }, data: { botEnabled: false, officialStatus: 'offboarded_waiting_reconnect', officialLastError: 'O WhatsApp trocou de aparelho ou foi registrado de novo. Abra o WhatsApp Business e confirme a reconexão da plataforma.' } });
  } else if (value.event === 'ACCOUNT_RECONNECTED') {
    const stores = await prisma.store.findMany({ where: { officialWabaId: wabaId } });
    for (const store of stores) {
      const expired = store.officialTokenExpiresAt && store.officialTokenExpiresAt.getTime() <= Date.now();
      await prisma.store.update({ where: { id: store.id }, data: expired
        ? { botEnabled: false, officialStatus: 'reauthorization_required', officialLastError: 'A Meta reconectou o número, mas a autorização expirou. Conecte novamente.' }
        : { botEnabled: true, officialStatus: 'connected', officialLastError: null } });
    }
  } else if (value.event === 'DISABLED_UPDATE' && value.ban_info?.waba_ban_state === 'DISABLE') {
    await prisma.store.updateMany({ where: { officialWabaId: wabaId }, data: { botEnabled: false, officialStatus: 'blocked', officialLastError: 'A Meta bloqueou esta conta do WhatsApp. Veja os avisos no Gerenciador do WhatsApp.' } });
  } else if (value.event === 'ACCOUNT_RESTRICTION') {
    await prisma.store.updateMany({ where: { officialWabaId: wabaId }, data: { officialLastError: 'A Meta limitou esta conta do WhatsApp. Algumas mensagens podem não sair. Veja os avisos no Gerenciador do WhatsApp.' } });
  }
}

async function markSyncWebhook(entry, field, value) {
  const wabaId = String(entry.id || '');
  if (!/^\d+$/.test(wabaId)) return;
  const stores = await prisma.store.findMany({ where: { officialWabaId: wabaId }, select: { id: true } });
  const step = field === 'smb_app_state_sync' ? 'smb_app_state_sync' : 'history';
  const historyNotShared = step === 'history' && (value.errors || []).some(error => Number(error.code) === 2593109);
  for (const store of stores) {
    const id = `${store.id}:smb_sync`;
    const saved = await prisma.whatsAppConversation.findUnique({ where: { id } });
    let progress;
    try { progress = saved ? JSON.parse(saved.state) : null; } catch { progress = null; }
    if (!progress || typeof progress.steps !== 'object') progress = { since: new Date().toISOString(), steps: {} };
    progress.steps[step] = { ...progress.steps[step], status: historyNotShared ? 'completed_without_history' : 'completed', webhookAt: new Date().toISOString() };
    await prisma.whatsAppConversation.upsert({ where: { id }, create: { id, storeId: store.id, state: JSON.stringify(progress) }, update: { state: JSON.stringify(progress) } });
  }
}

const HANDOFF_MS = (Number(process.env.WHATSAPP_HUMAN_HANDOFF_MINUTES) || 120) * 60000;
const handoffKey = (storeId, phone) => `${storeId}:handoff:${phone}`;
async function humanIsAttending(storeId, phone) {
  const handoff = await prisma.whatsAppConversation.findUnique({ where: { id: handoffKey(storeId, phone) }, select: { updatedAt: true } });
  return !!handoff && Date.now() - handoff.updatedAt.getTime() < HANDOFF_MS;
}

// WhatsApp Cloud API webhook verification
router.get('/meta', (req, res) => {
  if (process.env.META_WEBHOOK_VERIFY_TOKEN && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});
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

// Global Meta callback routes each message by verified phone ID, never a browser/store path.
router.post('/meta', async (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(401);
  try {
    for (const entry of req.body?.entry || []) for (const change of entry.changes || []) {
      if (change.field === 'account_update') { await handleAccountUpdate(entry, change.value || {}); continue; }
      if (['history', 'smb_app_state_sync'].includes(change.field)) { await markSyncWebhook(entry, change.field, change.value || {}); continue; }
      if (change.field && !['messages', 'smb_message_echoes'].includes(change.field)) continue;
      const value = change.value || {};
      const phoneId = value.metadata?.phone_number_id;
      if (!phoneId) continue;
      const store = await prisma.store.findUnique({ where: { officialPhoneId: String(phoneId) } });
      if (!store || String(entry.id) !== store.officialWabaId) continue;
      for (const status of value.statuses || []) {
        if (!status.id || !['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue;
        await prisma.whatsAppDelivery.updateMany({ where: { id: status.id, storeId: store.id, status: { in: { sent: ['accepted'], delivered: ['accepted', 'sent'], read: ['accepted', 'sent', 'delivered'], failed: ['accepted', 'sent'] }[status.status] } }, data: { status: status.status, error: status.status === 'failed' ? JSON.stringify(status.errors || []).slice(0, 1000) : null } });
      }
      // Coexistence echoes/history are never passed to the bot (prevents self-replies).
      if (store.officialStatus !== 'connected') continue;
      // The owner answered from the WhatsApp Business app: the bot stays quiet with that customer for a while.
      for (const echo of value.message_echoes || []) {
        const customer = String(echo.to || '').replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(customer)) continue;
        const id = handoffKey(store.id, customer);
        await prisma.whatsAppConversation.upsert({ where: { id }, create: { id, storeId: store.id, state: '{"handoff":true}' }, update: { state: '{"handoff":true}' } });
      }
      for (const message of value.messages || []) {
        if (message.echo || message.is_echo || !message.id || !/^\d{8,15}$/.test(message.from || '') || message.from === store.officialDisplayPhone?.replace(/\D/g, '')) continue;
        try { await prisma.whatsAppInbox.create({ data: { id: `${store.id}:${message.id}`, storeId: store.id, phone: message.from, payload: JSON.stringify({ ...message, _phoneId: store.officialPhoneId, _wabaId: store.officialWabaId, _connectionKey: crypto.createHash('sha256').update(store.officialToken).digest('hex') }) } }); }
        catch (err) { if (err.code !== 'P2002') throw err; }
      }
    }
    // Acknowledge only after durable commit; database failures cause Meta redelivery.
    res.sendStatus(200);
    if (process.env.RUN_BACKGROUND_JOBS !== 'false') drainInbox().catch(() => console.error('[WhatsApp inbox] Falha no processamento'));
  } catch (err) { res.sendStatus(503); }
});
router.post('/:storeId', async (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(401);
  try {
    const storeId = Number(req.params.storeId);
    if (!Number.isSafeInteger(storeId) || storeId <= 0) return res.sendStatus(404);
    const store = await loadStore(storeId);
    if (!store || store.officialPhoneId) return res.sendStatus(404);
    for (const entry of req.body?.entry || []) for (const change of entry.changes || []) {
      if (String(change.value?.metadata?.phone_number_id) !== store.botPhoneId) continue;
      for (const message of change.value?.messages || []) await processMessage(store, message);
    }
    res.sendStatus(200);
  } catch (err) { res.sendStatus(503); }
});
function loadStore(id) {
  return prisma.store.findUnique({ where: { id }, include: { categories: { orderBy: { order: 'asc' } }, products: { where: { active: true }, orderBy: { order: 'asc' }, include: { category: true } } } });
}
async function processMessage(store, message) {
  if (!/^\d{8,15}$/.test(message.from || '')) return;
  if (!store.active || !store.botEnabled) return;
  if (!require('../middleware/premium').isEligible(store)) return;
  // Reactions, system notices and content the API cannot show (e.g. coexistence 131060) are left to the owner; no auto-reply.
  if (['reaction', 'system', 'unsupported'].includes(message.type)) return;
  if (!['text', 'interactive', 'button'].includes(message.type)) {
    await sendWhatsAppMessage(store, message.from, { type: 'text', text: { body: 'Por enquanto consigo atender por texto. Digite sua mensagem ou escolha uma opção do menu.' } });
    return;
  }
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
    if (/^pagecat:\d+$/.test(replyId)) {
      await sendCatalogMenu(store, from, Number(replyId.split(':')[1]));
    } else if (/^pageprod:\d+:\d+$/.test(replyId)) {
      const [, categoryId, page] = replyId.split(':');
      await sendProductsForCategory(store, from, Number(categoryId), Number(page));
    } else if (/^pageorder:\d+$/.test(replyId)) {
      await sendOrderInstructions(store, from, Number(replyId.split(':')[1]));
    } else if (replyId.startsWith('cat_')) {
      const catId = parseInt(replyId.replace('cat_', ''));
      await sendProductsForCategory(store, from, catId);
    } else if (replyId.startsWith('prod_')) {
      const prodId = parseInt(replyId.replace('prod_', ''));
      await sendProductDetail(store, from, prodId);
    } else if (replyId.startsWith('order_')) {
      // Customer wants to order this specific product — start order flow
      const prodId = parseInt(replyId.replace('order_', ''));
      await startOrderFlow(store, from, convoKey, prodId);
    } else if (replyId === 'ver_catalogo' || ['catalogo', 'catálogo', 'menu', 'produtos', 'servicos', 'serviços'].includes(msgLower)) {
      await sendCatalogMenu(store, from);
    } else if (replyId === 'ver_todos' || ['todos', 'tudo', 'precos', 'preços', 'preco', 'preço', 'valores'].includes(msgLower)) {
      await sendAllProducts(store, from);
    } else if (replyId === 'fazer_pedido' || ['pedido', 'pedir', 'agendar', 'marcar', 'horario', 'horário', 'marcar horario', 'marcar horário'].includes(msgLower)) {
      await sendOrderInstructions(store, from);
    } else if (replyId === 'ver_pedidos' || ['meus pedidos', 'meus horarios', 'meus horários'].includes(msgLower)) {
      await sendCustomerOrders(store, from);
    } else {
      await sendGreeting(store, from);
    }
}
const workerOwner = crypto.randomBytes(16).toString('hex');
const INBOX_LEASE_MS = 5 * 60000;
const INBOX_CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.WHATSAPP_WORKER_CONCURRENCY) || 4));
const INBOX_STORE_BATCH = 10;
const INBOX_ROUND_MS = 20000;
let stoppingInbox = false;
let inboxTimer = null;
let activeDrain = null;

async function acquireStoreLease(storeId) {
  const id = 'inbox:' + storeId;
  const expiresAt = new Date(Date.now() + INBOX_LEASE_MS);
  const acquired = await prisma.whatsAppWorkerLease.updateMany({
    where: { id, OR: [{ expiresAt: { lt: new Date() } }, { owner: workerOwner }] },
    data: { owner: workerOwner, expiresAt },
  });
  if (acquired.count) return id;
  try { await prisma.whatsAppWorkerLease.create({ data: { id, owner: workerOwner, expiresAt } }); return id; }
  catch (error) { if (error.code === 'P2002') return null; throw error; }
}

async function processStoreInbox(storeId, deadline) {
  if (stoppingInbox || Date.now() >= deadline) return;
  const leaseId = await acquireStoreLease(storeId);
  if (!leaseId) return;
  let leaseHeld = true;
  let heartbeatWork = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatWork = heartbeatWork.then(async () => {
      const renewed = await prisma.whatsAppWorkerLease.updateMany({
        where: { id: leaseId, owner: workerOwner, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(Date.now() + INBOX_LEASE_MS) },
      });
      if (!renewed.count) leaseHeld = false;
    }).catch(() => { leaseHeld = false; });
  }, 30000).unref();
  try {
    // We own this store's lease. Expired work is ambiguous, so it is retained for
    // operator review rather than repeating a possibly accepted Graph send.
    await prisma.whatsAppInbox.updateMany({
      where: { storeId, status: 'processing', updatedAt: { lt: new Date(Date.now() - INBOX_LEASE_MS) } },
      data: { status: 'failed', lastError: 'Processamento interrompido; conferir envio/pedido antes de repetir.' },
    });
    for (let count = 0; count < INBOX_STORE_BATCH && leaseHeld && !stoppingInbox && Date.now() < deadline; count++) {
      // Any still-processing event blocks subsequent events in this store.
      if (await prisma.whatsAppInbox.findFirst({ where: { storeId, status: 'processing' }, select: { id: true } })) break;
      const event = await prisma.whatsAppInbox.findFirst({
        where: { storeId, status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!event || event.availableAt > new Date()) break;
      if (stoppingInbox || !leaseHeld) break;
      const claimed = await prisma.whatsAppInbox.updateMany({
        where: { id: event.id, status: 'pending' }, data: { status: 'processing', attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      event._leaseId = leaseId;
      const key = getConvoKey(event.storeId, event.phone);
      try {
        const saved = await prisma.whatsAppConversation.findUnique({ where: { id: key } });
        if (saved && Date.now() - saved.updatedAt.getTime() < 24 * 60 * 60000) {
          try {
            const recovered = JSON.parse(saved.state);
            if (recovered && typeof recovered.step === 'string') conversations.set(key, recovered);
            else conversations.delete(key);
          } catch { conversations.delete(key); }
        } else conversations.delete(key);
        const store = await loadStore(event.storeId);
        const message = JSON.parse(event.payload);
        const identityMatches = store?.officialPhoneId === message._phoneId && store?.officialWabaId === message._wabaId && store?.officialToken && crypto.createHash('sha256').update(store.officialToken).digest('hex') === message._connectionKey;
        if (identityMatches && store?.officialStatus !== 'connected') throw new Error('WhatsApp requer nova autorização');
        if (store?.officialStatus === 'connected' && identityMatches && !await humanIsAttending(event.storeId, event.phone)) {
          await processMessage(store, message);
          if (store._sendFailure) throw store._sendFailure;
        }
        await persistEvent(event, key, 'done', null);
      } catch (error) {
        if (!await prisma.store.findUnique({ where: { id: event.storeId } })) continue;
        await persistEvent(event, key, 'failed', 'Falha no processamento; conferir envio/pedido antes de repetir.');
        await prisma.store.updateMany({ where: { id: event.storeId }, data: { officialLastError: 'Falha no atendimento. Verifique a conexão oficial e os eventos pendentes.' } });
      }
    }
  } finally {
    clearInterval(heartbeat);
    await heartbeatWork;
    await prisma.whatsAppWorkerLease.deleteMany({ where: { id: leaseId, owner: workerOwner } }).catch(() => {});
  }
}

function drainInbox() {
  if (stoppingInbox) return Promise.resolve();
  if (activeDrain) return activeDrain;
  activeDrain = (async () => {
    const legacyLease = await prisma.whatsAppWorkerLease.findUnique({ where: { id: 'inbox' } });
    if (legacyLease?.expiresAt > new Date()) return;
    const deadline = Date.now() + INBOX_ROUND_MS;
    // SQL GROUP BY selects stores, never loads the national message queue into JS.
    const candidates = /^postgres(ql)?:/.test(process.env.DATABASE_URL || '')
      ? await prisma.$queryRaw`
          SELECT event."storeId" FROM "WhatsAppInbox" event
          WHERE event.status IN ('pending','processing') AND event."availableAt" <= ${new Date().toISOString()}::timestamp
            AND NOT EXISTS (SELECT 1 FROM "WhatsAppWorkerLease" lease WHERE lease.id = 'inbox:' || event."storeId"::text AND lease."expiresAt" > ${new Date().toISOString()}::timestamp)
            AND NOT EXISTS (SELECT 1 FROM "WhatsAppInbox" active WHERE active."storeId"=event."storeId" AND active.status='processing' AND active."updatedAt" >= ${new Date(Date.now()-INBOX_LEASE_MS).toISOString()}::timestamp)
          GROUP BY event."storeId" ORDER BY MIN(event."createdAt") ASC LIMIT ${INBOX_CONCURRENCY * 4}`
      : await prisma.whatsAppInbox.groupBy({
          by: ['storeId'], where: { status: { in: ['pending', 'processing'] }, availableAt: { lte: new Date() } },
          _min: { createdAt: true }, orderBy: { _min: { createdAt: 'asc' } }, take: INBOX_CONCURRENCY * 4,
        });
    let next = 0;
    const results = await Promise.allSettled(Array.from({ length: INBOX_CONCURRENCY }, async () => {
      while (!stoppingInbox && next < candidates.length && Date.now() < deadline) {
        const storeId = candidates[next++].storeId;
        await processStoreInbox(storeId, deadline);
      }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  })().finally(() => { activeDrain = null; });
  return activeDrain;
}
async function persistEvent(event, key, status, lastError) {
  await prisma.$transaction(async tx => {
    if (event._leaseId && !await tx.whatsAppWorkerLease.findFirst({ where: { id: event._leaseId, owner: workerOwner, expiresAt: { gt: new Date() } } })) return;
    const current = await tx.store.findUnique({ where: { id: event.storeId } });
    if (!current) return;
    const source = JSON.parse(event.payload);
    const unchanged = current.officialPhoneId === source._phoneId && current.officialToken && crypto.createHash('sha256').update(current.officialToken).digest('hex') === source._connectionKey;
    if (unchanged) {
      const state = conversations.get(key);
      if (state) await tx.whatsAppConversation.upsert({ where: { id: key }, create: { id: key, storeId: event.storeId, state: JSON.stringify(state) }, update: { storeId: event.storeId, state: JSON.stringify(state) } });
      else await tx.whatsAppConversation.deleteMany({ where: { id: key } });
    }
    await tx.whatsAppInbox.updateMany({ where: { id: event.id, status: 'processing' }, data: { status: unchanged ? status : 'done', lastError: unchanged ? lastError : 'Conexão substituída ou desconectada' } });
  });
}
async function startInboxWorker() {
  if (inboxTimer) return inboxTimer;
  stoppingInbox = false;
  inboxTimer = setInterval(() => drainInbox().catch(() => console.error('[WhatsApp inbox] Falha no processamento')), 5000).unref();
  await drainInbox();
  return inboxTimer;
}

async function stopInboxWorker() {
  stoppingInbox = true;
  if (inboxTimer) clearInterval(inboxTimer);
  inboxTimer = null;
  if (activeDrain) await activeDrain;
}

// ===== ORDER CONVERSATION FLOW =====

async function startOrderFlow(store, to, convoKey, productId) {
  const product = store.products.find(p => p.id === productId);
  if (!product) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Serviço não encontrado.' },
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
      body: `✅ Ótimo! Você escolheu:\n\n💇 *${product.name}*\n💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n\nPara marcar, me diga:\n\n👤 *Qual é o seu nome?*`,
    },
  });
}

async function handleConversationFlow(store, from, convoKey, convo, msgBody, replyId) {
  switch (convo.step) {
    case 'ask_name': {
      convo.data.name = msgBody;
      convo.data.type = 'schedule';
      conversations.set(convoKey, convo);
      await startScheduleFlow(store, from, convoKey, convo, `Obrigado, *${msgBody}*! 👋\n\n`);
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
        } else if (/^(entrega|endereço|endereco|produto|2)$/i.test(msgBody.trim())) {
          convo.step = 'ask_address';
          convo.data.type = 'delivery';
          conversations.set(convoKey, convo);
          await sendWhatsAppMessage(store, from, {
            type: 'text',
            text: { body: `📍 *Qual é o endereço de entrega?*` },
          });
        } else {
          await sendWhatsAppMessage(store, from, { type: 'text', text: { body: 'Escolha Agendar Horário ou Com Endereço para continuar.' } });
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
  let orderSaved = false;
  const isSchedule = convo.data.type === 'schedule' && !!convo.data.date && !!convo.data.time;

  try {
    const scheduledLabel = isSchedule ? `${formatDateBR(convo.data.date)} ${convo.data.time}` : null;

    // Revalidar + gravar sob o mesmo lock da loja: entre a escolha do horário e
    // a confirmação o cliente digita as observações, e nesse intervalo outra
    // pessoa (ou o painel) pode ter pegado o slot.
    const order = await withStoreLock(store.id, async () => {
      const current = await prisma.store.findUnique({ where: { id: store.id } });
      if (!current?.active || !current.botEnabled || !require('../middleware/premium').isEligible(current) || current.officialPhoneId !== store.officialPhoneId || current.officialToken !== store.officialToken) throw new Error('Atendimento interrompido; loja ou conexão mudou');
      const product = await prisma.product.findFirst({ where: { id: convo.productId, storeId: store.id, active: true } });
      if (!product) throw new Error('Produto indisponível. Reinicie o pedido.');
      if (product.price !== convo.productPrice) {
        return { priceChanged: true };
      }
      let resource = { professionalId: null };
      if (isSchedule) {
        resource = await require('../utils/availability').assignAvailableProfessional(prisma, store.id,
          convo.data.date, convo.productId, convo.data.professionalId ?? null, convo.data.time);
        if (!resource) return null;
      }

      return prisma.order.create({
        data: {
          storeId: store.id,
          productId: convo.productId,
          professionalId: resource.professionalId,
          customerName: convo.data.name,
          customerPhone: from,
          customerAddress: convo.data.address || null,
          scheduledAt: isSchedule ? buildScheduledAt(convo.data.date, convo.data.time) : null,
          // scheduledTime legível: a Agenda do painel usa como fallback de exibição
          scheduledTime: scheduledLabel,
          notes: convo.data.notes || null,
          status: 'pending',
          totalPrice: convo.productPrice,
          priceCents: Math.round(convo.productPrice * 100),
          reservedDurationMinutes: product.duration,
          reservedBufferMinutes: product.bufferTime || 0,
        },
      });
    });

    if (order?.priceChanged) {
      conversations.delete(convoKey);
      await sendWhatsAppMessage(store, from, { type: 'text', text: { body: 'O preço deste serviço mudou. Envie "menu" e comece de novo para ver o valor certo.' } });
      return;
    }
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

    orderSaved = true;
    conversations.delete(convoKey);
    // Alimenta a tela "Clientes" do painel
    await registrarCliente(prisma, store.id, convo.data.name, from);

    // Clear conversation state
    conversations.delete(convoKey);

    // Build confirmation message
    let msg = `🎉 *Pedido #${order.id} recebido!*\n\n`;
    msg += `💇 *Serviço:* ${convo.productName}\n`;
    msg += `💰 *Valor:* R$ ${convo.productPrice.toFixed(2).replace('.', ',')}\n`;
    msg += `👤 *Nome:* ${convo.data.name}\n`;
    if (isSchedule) {
      msg += `📅 *Data:* ${getDayLabelBR(convo.data.date)} ${formatDateBR(convo.data.date)}\n`;
      msg += `🕐 *Horário:* ${convo.data.time}\n`;
      msg += `👥 *Profissional:* ${convo.data.professionalName || 'O salão escolhe'}\n`;
    }
    if (convo.data.address) msg += `📍 *Endereço:* ${convo.data.address}\n`;
    if (convo.data.notes) msg += `💬 *Obs:* ${convo.data.notes}\n`;
    msg += `\n✅ Status: *Aguardando confirmação*\n`;
    if (isSchedule && store.slug) msg += `\n📍 Veja a localização do estabelecimento:\n${(process.env.APP_URL || 'https://agentegestor.com.br').replace(/\/$/, '')}/loja/${encodeURIComponent(store.slug)}#localizacao\n`;
    msg += `\nO salão vai confirmar seu horário por aqui. Obrigado! 😊`;

    await sendWhatsAppMessage(store, from, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ver_catalogo', title: '💇 Ver serviços' } },
            { type: 'reply', reply: { id: 'ver_pedidos', title: '📄 Meus horários' } },
          ],
        },
      },
    });
  } catch (error) {
    console.error('Error saving order:', error);
    conversations.delete(convoKey);
    if (orderSaved) throw error;
    await sendWhatsAppMessage(store, from, {
      type: 'text',
      text: { body: 'Desculpe, não consegui marcar agora. Tente de novo em instantes.' },
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
async function startScheduleFlow(store, to, convoKey, convo, prefix = '') {
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
    return sendDateOptions(store, to, convoKey, convo, prefix);
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

  await sendProfessionalOptions(store, to, convoKey, convo, prefix);
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
  try { return await require('../services/officialWhatsApp').send(store, to, payload, { automation: true }); }
  catch (err) { store._sendFailure = err; throw err; }
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
          { type: 'reply', reply: { id: 'fazer_pedido', title: '📅 Marcar horário' } },
          { type: 'reply', reply: { id: 'ver_todos', title: '💰 Ver preços' } },
          { type: 'reply', reply: { id: 'ver_pedidos', title: '📄 Meus horários' } },
        ],
      },
    },
  });
}

function paginatedRows(items, page, prefix, makeRow) {
  const pageSize = items.length > 10 ? 8 : 10;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, pages - 1));
  const rows = items.slice(current * pageSize, (current + 1) * pageSize).map(makeRow);
  if (current > 0) rows.push({ id: `${prefix}:${current - 1}`, title: 'Página anterior' });
  if (current + 1 < pages) rows.push({ id: `${prefix}:${current + 1}`, title: 'Mais opções' });
  return rows;
}

async function sendCatalogMenu(store, to, page = 0) {
  const categories = store.categories;

  if (categories.length === 0) {
    await sendAllProducts(store, to);
    return;
  }

  const sections = [{
    title: 'Categorias',
    rows: paginatedRows(categories, page, 'pagecat', cat => ({
      id: `cat_${cat.id}`,
      title: cat.name.substring(0, 24),
      description: `Ver serviços de ${cat.name}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `💇 *Serviços - ${store.name}*\n\nEscolha um tipo de serviço:`,
      },
      action: {
        button: 'Ver Categorias',
        sections,
      },
    },
  });
}

async function sendProductsForCategory(store, to, categoryId, page = 0) {
  const products = store.products.filter(p => p.categoryId === categoryId);
  const category = store.categories.find(c => c.id === categoryId);
  const catName = category?.name || 'Categoria';

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: `Nenhum serviço disponível em *${catName}* agora.` },
    });
    return;
  }

  const sections = [{
    title: catName.substring(0, 24),
    rows: paginatedRows(products, page, `pageprod:${categoryId}`, p => ({
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
        text: `💇 *${catName}*\n\nEscolha um serviço:`,
      },
      action: {
        button: 'Ver serviços',
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
      text: { body: 'Nenhum serviço disponível agora. 😕' },
    });
    return;
  }

  let msg = `💰 *Preços - ${store.name}*\n\n`;

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

  msg += `\n📅 Para marcar, envie *"agendar"*.`;

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
      text: { body: 'Serviço não encontrado.' },
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
          { type: 'reply', reply: { id: `order_${product.id}`, title: '📅 Marcar este' } },
          { type: 'reply', reply: { id: 'ver_catalogo', title: '💇 Ver serviços' } },
        ],
      },
    },
  });
}

async function sendOrderInstructions(store, to, page = 0) {
  // Show products as options to order
  const products = store.products;

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Nenhum serviço disponível para marcar agora.' },
    });
    return;
  }

  const sections = [{
    title: 'Escolha um serviço',
    rows: paginatedRows(products, page, 'pageorder', p => ({
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
        text: `📅 *Marcar horário*\n\nQual serviço você quer?`,
      },
      action: {
        button: 'Escolher serviço',
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
        text: { body: 'Você ainda não tem horários marcados. 📋' },
      });
      return;
    }

    let msg = `📄 *Seus horários*\n\n`;
    const statusEmoji = { pending: '⏳', confirmed: '✅', completed: '🎉', cancelled: '❌' };
    const statusLabel = { pending: 'Aguardando', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };

    orders.forEach(o => {
      msg += `*Pedido #${o.id}:* ${o.product?.name || 'Serviço removido'}\n`;
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

router.startInboxWorker = startInboxWorker;
router.stopInboxWorker = stopInboxWorker;
module.exports = router;
