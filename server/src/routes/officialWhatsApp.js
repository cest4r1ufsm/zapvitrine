const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const official = require('../services/officialWhatsApp');
const { requirePremium } = require('../middleware/premium');
const rateLimit = require('express-rate-limit');
const limit = rateLimit({ windowMs: 15 * 60000, limit: 20, keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
const router = express.Router();
router.use(auth);
async function mutationLease(req, res, next) {
  const owner = crypto.randomBytes(16).toString('hex');
  const id = `signup:${req.user.id}`;
  const expiresAt = new Date(Date.now() + 5 * 60000);
  try {
    const renewed = await prisma.whatsAppWorkerLease.updateMany({ where: { id, expiresAt: { lt: new Date() } }, data: { owner, expiresAt } });
    if (!renewed.count) {
      try { await prisma.whatsAppWorkerLease.create({ data: { id, owner, expiresAt } }); }
      catch (err) { if (err.code === 'P2002') return res.status(409).json({ error: 'Conexão já em andamento. Aguarde antes de tentar novamente.' }); throw err; }
    }
    res.once('finish', () => prisma.whatsAppWorkerLease.deleteMany({ where: { id, owner } }).catch(() => {}));
    next();
  } catch (err) { next(err); }
}
router.get('/status', async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const [failedMessages, processingMessages] = await Promise.all([
    prisma.whatsAppInbox.count({ where: { storeId: store.id, status: 'failed' } }),
    prisma.whatsAppInbox.count({ where: { storeId: store.id, status: 'processing' } }),
  ]);
  res.set('Cache-Control', 'no-store').json({ ...official.config(), connection: official.connection(store), attention: { failedMessages, processingMessages } });
});
router.get('/config', requirePremium, limit, async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const cfg = official.config();
  let state = null, expiresAt = null;
  if (cfg.available) {
    state = crypto.randomBytes(32).toString('hex');
    expiresAt = new Date(Date.now() + 10 * 60000);
    await prisma.whatsAppSignupState.deleteMany({ where: { OR: [{ storeId: store.id }, { expiresAt: { lt: new Date() } }] } });
    await prisma.whatsAppSignupState.create({ data: { id: state, storeId: store.id, expiresAt } });
  }
  res.set('Cache-Control', 'no-store').json({ ...cfg, state, expiresAt, connection: official.connection(store) });
});
router.post('/connect', requirePremium, limit, mutationLease, async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  if (!store.active) return res.status(403).json({ error: 'Loja desativada' });
  if (!official.config().available) return res.status(503).json({ error: 'Integração oficial ainda não configurada no servidor' });
  const { code, state, wabaId, phoneId } = req.body || {};
  if (typeof code !== 'string' || code.length > 4096 || !code || typeof state !== 'string' || !/^\d+$/.test(wabaId || '') || (phoneId && !/^\d+$/.test(phoneId))) return res.status(400).json({ error: 'Autorização da Meta incompleta' });
  const claimed = await prisma.whatsAppSignupState.deleteMany({ where: { id: state, storeId: store.id, expiresAt: { gt: new Date() } } });
  if (!claimed.count) return res.status(400).json({ error: 'Autorização expirada ou já utilizada. Inicie novamente.' });
  try {
    // OAuth code exchanged exclusively on the server; asset IDs from the browser are untrusted.
    const query = new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, code });
    const exchanged = await official.graph(`oauth/access_token?${query}`, null);
    if (!exchanged.access_token) throw new Error('Token não recebido da Meta');
    const token = exchanged.access_token;
    const debugQuery = new URLSearchParams({ input_token: token });
    const debug = await official.graph(`debug_token?${debugQuery}`, `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
    const info = debug.data;
    const permissions = info?.granular_scopes || [];
    if (!info?.is_valid || String(info.app_id) !== process.env.META_APP_ID || !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => info.scopes?.includes(scope))) throw new Error('Permissões do WhatsApp incompletas');
    const ownsAsset = ['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => permissions.filter(p => p.scope === scope).flatMap(p => p.target_ids || []).map(String).includes(String(wabaId)));
    if (!ownsAsset) throw new Error('Conta WhatsApp não pertence à autorização recebida');
    const phones = await official.graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`, token);
    const phone = phoneId ? phones.data?.find(p => String(p.id) === String(phoneId)) : phones.data?.length === 1 ? phones.data[0] : null;
    if (!phone) throw new Error('Número não pertence à conta WhatsApp autorizada');
    const owner = await prisma.store.findFirst({ where: { officialPhoneId: String(phone.id), NOT: { id: store.id } } });
    if (owner) return res.status(409).json({ error: 'Este número já está conectado a outra loja' });
    await official.graph(`${wabaId}/subscribed_apps`, token, { method: 'POST', body: {} });
    await require('../services/whatsapp').stopSession(store.id);
    await prisma.$transaction([
      prisma.whatsAppInbox.updateMany({ where: { storeId: store.id, status: { in: ['pending', 'processing'] } }, data: { status: 'done', lastError: 'Identidade da conexão substituída' } }),
      prisma.whatsAppConversation.deleteMany({ where: { id: { startsWith: `${store.id}:` } } }),
    ]);
    const updated = await prisma.store.update({ where: { id: store.id }, data: { botEnabled: store.botEnabled, officialPhoneId: String(phone.id), officialWabaId: String(wabaId), officialToken: official.encrypt(token), officialTokenExpiresAt: info.expires_at ? new Date(info.expires_at * 1000) : null, officialDisplayPhone: phone.display_phone_number, officialVerifiedName: phone.verified_name, officialStatus: 'connected', officialLastError: null } });
    res.json({ connection: official.connection(updated) });
  } catch (err) {
    const message = err.metaCode ? `Meta recusou a conexão (código ${err.metaCode}). Verifique as permissões e a elegibilidade.` : err.message;
    await prisma.store.update({ where: { id: store.id }, data: { officialLastError: message } });
    res.status(err.status || 400).json({ error: message });
  }
});
router.delete('/disconnect', limit, mutationLease, async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  // Subscription belongs to the WABA (possibly multiple numbers); do not unsubscribe other stores.
  await prisma.whatsAppSignupState.deleteMany({ where: { storeId: store.id } });
  const updated = await prisma.store.update({ where: { id: store.id }, data: { botEnabled: false, officialPhoneId: null, officialWabaId: null, officialToken: null, officialTokenExpiresAt: null, officialDisplayPhone: null, officialVerifiedName: null, officialStatus: 'disconnected', officialLastError: null } });
  await prisma.whatsAppInbox.updateMany({ where: { storeId: store.id, status: 'pending' }, data: { status: 'done', lastError: 'Integração desconectada' } });
  await prisma.whatsAppConversation.deleteMany({ where: { id: { startsWith: `${store.id}:` } } });
  res.json({ connection: official.connection(updated) });
});
module.exports = router;
