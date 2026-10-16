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
  const phone = to.replace(/\D/g, '');
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
module.exports = { config, encrypt, decrypt, connection, graph, send };
