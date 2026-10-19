const crypto = require('crypto');
const prisma = require('../lib/prisma');

function config() {
  const required = ['META_APP_ID', 'META_APP_SECRET', 'META_SIGNUP_CONFIG_ID', 'META_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_TOKEN_ENCRYPTION_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY)) missing.push('WHATSAPP_TOKEN_ENCRYPTION_KEY_INVALID');
  return { available: missing.length === 0, missing, appId: process.env.META_APP_ID || null, configId: process.env.META_SIGNUP_CONFIG_ID || null, graphVersion: process.env.META_GRAPH_VERSION || 'v23.0' };
}
function encrypt(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY, 'hex'), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
function decrypt(value) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY, 'hex'), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
function connection(store) {
  const expiration = store.officialTokenExpiresAt ? new Date(store.officialTokenExpiresAt).getTime() : null;
  const expired = expiration !== null && (!Number.isFinite(expiration) || expiration <= Date.now());
  return { connected: store.officialStatus === 'connected' && !expired, status: expired ? 'reauthorization_required' : store.officialStatus || 'disconnected', phoneId: store.officialPhoneId || null, wabaId: store.officialWabaId || null, displayPhoneNumber: store.officialDisplayPhone || null, verifiedName: store.officialVerifiedName || null, lastError: expired ? 'Autorização expirada. Conecte novamente.' : store.officialLastError || null };
}
async function graph(endpoint, token, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://graph.facebook.com/${config().graphVersion}/${endpoint}`, {
    method, headers, ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const error = new Error('A Meta não concluiu a operação. Verifique permissões, elegibilidade e janela de atendimento.');
    error.metaCode = data.error?.code;
    error.status = 502;
    throw error;
  }
  return data;
}
async function send(store, to, payload, { automation = false } = {}) {
  const current = await prisma.store.findUnique({ where: { id: store.id } });
  if (!current || !current.active || !require('../middleware/premium').isEligible(current)) throw new Error('Atendimento indisponível para esta loja');
  if (automation && !current.botEnabled) throw new Error('Chatbot pausado');
  if (current.officialPhoneId !== store.officialPhoneId || current.officialToken !== store.officialToken || current.botPhoneId !== store.botPhoneId) throw new Error('A conexão mudou durante o atendimento');
  store = current;
  const official = !!store.officialPhoneId;
  if (official && !connection(store).connected) throw new Error('WhatsApp oficial requer nova autorização');
  const phoneId = official ? store.officialPhoneId : store.botPhoneId;
  const token = official ? decrypt(store.officialToken) : store.botToken;
  if (!phoneId || !token) throw new Error('WhatsApp oficial desconectado');
  // Do not turn a LID/JID or arbitrary text into a different customer's number.
  if (typeof to !== 'string' || !/^\+?[\d\s().-]+$/.test(to.trim())) throw new Error('Telefone do cliente inválido');
  const phone = normalizePhone(to);
  if (!/^\d{8,15}$/.test(phone)) throw new Error('Telefone do cliente inválido');
  if (official && !connection(store).connected) throw new Error('Autorização expirada. Conecte novamente.');
  let result;
  try { result = await graph(`${phoneId}/messages`, token, { method: 'POST', body: { ...payload, messaging_product: 'whatsapp', recipient_type: 'individual', to: phone } }); }
  catch (err) {
    if (official && err.metaCode === 190) await prisma.store.update({ where: { id: store.id }, data: { officialStatus: 'reauthorization_required', officialLastError: 'Meta revogou ou expirou a autorização. Conecte novamente.' } });
    throw err;
  }
  const id = result.messages?.[0]?.id;
  if (!id) throw new Error('Meta não retornou confirmação de aceite');
  if (official) await prisma.whatsAppDelivery.upsert({ where: { id }, create: { id, storeId: store.id, phone }, update: {} });
  return { accepted: true, id, status: 'accepted' };
}
// Brazilian numbers typed without country code (DDD + number) would otherwise be read as another country.
function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, '');
  return /^\d{10,11}$/.test(digits) ? `55${digits}` : digits;
}

// Free text is only delivered inside 24 h of the customer's last message; afterwards Meta requires an approved template.
const ORDER_TEMPLATE = {
  name: 'agtgestor_atualizacao_pedido',
  language: 'pt_BR',
  category: 'UTILITY',
  components: [{ type: 'BODY', text: 'Olá, {{1}}! Seu pedido #{{2}} de {{3}} foi {{4}} pela loja. Se tiver alguma dúvida, responda esta mensagem.', example: { body_text: [['Maria', '123', 'Corte de cabelo', 'confirmado']] } }],
};
const SERVICE_WINDOW_MS = 23.5 * 60 * 60000;

async function ensureTemplates(wabaId, token) {
  // Creation is idempotent from our side: Meta answers with an error when the name already exists.
  try { await graph(`${wabaId}/message_templates`, token, { method: 'POST', body: ORDER_TEMPLATE }); return true; }
  catch { return false; }
}
async function insideServiceWindow(storeId, phone) {
  const local = phone.startsWith('55') ? phone.slice(2) : phone;
  const last = await prisma.whatsAppInbox.findFirst({ where: { storeId, phone: { in: [phone, local] }, createdAt: { gt: new Date(Date.now() - SERVICE_WINDOW_MS) } }, select: { id: true } });
  return !!last;
}
const templateText = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 200) || '-';
async function sendOrderUpdate(store, to, text, params) {
  if (!store.officialPhoneId) return send(store, to, { type: 'text', text: { body: text } });
  const phone = normalizePhone(to);
  if (await insideServiceWindow(store.id, phone)) {
    try { return await send(store, to, { type: 'text', text: { body: text } }); }
    catch (err) { if (err.metaCode !== 131047) throw err; }
  }
  const template = { name: ORDER_TEMPLATE.name, language: { code: ORDER_TEMPLATE.language }, components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: templateText(p) })) }] };
  try { return await send(store, to, { type: 'template', template }); }
  catch (err) {
    if (![132001, 132000, 132015, 132016].includes(err.metaCode)) throw err;
    const current = await prisma.store.findUnique({ where: { id: store.id } });
    if (current?.officialWabaId && current.officialToken) await ensureTemplates(current.officialWabaId, decrypt(current.officialToken));
    const pending = new Error('Modelo de mensagem aguardando aprovação da Meta. Tente de novo em alguns minutos.');
    pending.metaCode = err.metaCode;
    throw pending;
  }
}
// Two-step verification PIN for numbers we register. Derived, so it can be recomputed without storing it.
function registrationPin(phoneId) {
  const digest = crypto.createHmac('sha256', Buffer.from(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY, 'hex')).update(`pin:${phoneId}`).digest();
  return String(digest.readUInt32BE(0) % 1000000).padStart(6, '0');
}
async function registerPhone(phoneId, token) {
  try { await graph(`${phoneId}/register`, token, { method: 'POST', body: { messaging_product: 'whatsapp', pin: registrationPin(phoneId) } }); }
  catch (err) {
    const error = new Error('A Meta não ativou este número. Confira se ele recebeu o código de verificação e tente de novo.');
    error.metaCode = err.metaCode; error.status = 502;
    throw error;
  }
}
async function syncBusinessApp(phoneId, token) {
  // Contacts first, then history, as Meta documents. Each type can only be requested once per onboarding.
  for (const syncType of ['smb_app_state_sync', 'history']) {
    try { await graph(`${phoneId}/smb_app_data`, token, { method: 'POST', body: { messaging_product: 'whatsapp', sync_type: syncType } }); }
    catch (err) { return { ok: false, step: syncType, metaCode: err.metaCode }; }
  }
  return { ok: true };
}
module.exports = { config, encrypt, decrypt, connection, graph, send, normalizePhone, ensureTemplates, sendOrderUpdate, ORDER_TEMPLATE, registerPhone, syncBusinessApp, registrationPin };
