const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const official = require('../services/officialWhatsApp');
const { requirePremium } = require('../middleware/premium');
const rateLimit = require('express-rate-limit');
const limit = rateLimit({ ...require('../lib/sharedLimits').limitStore('official-connect'), windowMs: 15 * 60000, limit: 20, keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
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
    const release = () => prisma.whatsAppWorkerLease.deleteMany({ where: { id, owner } }).catch(() => {});
    res.once('finish', release);
    res.once('close', release);
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
  const { code, state, phoneId, onboarding } = req.body || {};
  let { wabaId } = req.body || {};
  const reject = (message, status = 400) => { throw official.publicError(message, { status }); };
  if (typeof code !== 'string' || code.length > 4096 || !code || typeof state !== 'string' || (wabaId && !/^\d+$/.test(wabaId)) || (phoneId && !/^\d+$/.test(phoneId))) return res.status(400).json({ error: 'Autorização da Meta incompleta' });
  const claimed = await prisma.whatsAppSignupState.deleteMany({ where: { id: state, storeId: store.id, expiresAt: { gt: new Date() } } });
  if (!claimed.count) return res.status(400).json({ error: 'Autorização expirada ou já utilizada. Inicie novamente.' });
  try {
    // OAuth code exchanged exclusively on the server; asset IDs from the browser are untrusted.
    const query = new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, code });
    const exchanged = await official.graph(`oauth/access_token?${query}`, null);
    if (!exchanged.access_token) reject('Token não recebido da Meta');
    const token = exchanged.access_token;
    const debugQuery = new URLSearchParams({ input_token: token });
    const debug = await official.graph(`debug_token?${debugQuery}`, `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
    const info = debug.data;
    const permissions = info?.granular_scopes || [];
    if ((info?.expires_at && Number(info.expires_at) * 1000 <= Date.now()) || (info?.data_access_expires_at && Number(info.data_access_expires_at) * 1000 <= Date.now())) reject('Autorização expirada. Inicie novamente.');
    if (!info?.is_valid || String(info.app_id) !== process.env.META_APP_ID || !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => info.scopes?.includes(scope))) reject('Permissões do WhatsApp incompletas');
    // Without the popup's session message, the only account this authorization covers is the right one.
    if (!wabaId) {
      const granted = [...new Set(permissions.filter(p => p.scope === 'whatsapp_business_management').flatMap(p => p.target_ids || []).map(String))];
      if (granted.length !== 1) reject('Não deu para saber qual WhatsApp você escolheu. Tente de novo.');
      wabaId = granted[0];
    }
    const ownsAsset = ['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => permissions.filter(p => p.scope === scope).flatMap(p => p.target_ids || []).map(String).includes(String(wabaId)));
    if (!ownsAsset) reject('Conta WhatsApp não pertence à autorização recebida');
    const phones = await official.graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type&limit=100`, token);
    const list = Array.isArray(phones.data) ? phones.data : [];
    // Coexistence completion only reports the WABA; with several numbers, the one on the Business app is the chosen one.
    const onApp = list.filter(p => p.is_on_biz_app === true);
    const phone = phoneId ? list.find(p => String(p.id) === String(phoneId)) : list.length === 1 ? list[0] : onboarding === 'business_app' && onApp.length === 1 ? onApp[0] : null;
    if (!phone) reject(phoneId || list.length < 2 ? 'Número não pertence à conta WhatsApp autorizada' : 'Sua conta da Meta tem mais de um número e não deu para saber qual você escolheu. Tente de novo e escolha o número do salão.');
    const owner = await prisma.store.findFirst({ where: { officialPhoneId: String(phone.id), NOT: { id: store.id } } });
    if (owner) return res.status(409).json({ error: 'Este número já está conectado a outra loja' });
    await official.graph(`${wabaId}/subscribed_apps`, token, { method: 'POST', body: {} });
    // Coexistence numbers are already registered; a brand-new number must be registered for Cloud API.
    const businessApp = onboarding === 'business_app' || phone.is_on_biz_app === true;
    if (!businessApp) await official.registerPhone(String(phone.id), token);
    const templateReady = await official.ensureTemplates(wabaId, token);
    const authorizationDeadlines = [info.expires_at, info.data_access_expires_at].map(Number).filter(value => Number.isFinite(value) && value > 0);
    const tokenExpiresAt = authorizationDeadlines.length ? new Date(Math.min(...authorizationDeadlines) * 1000) : null;
    const [updated] = await prisma.$transaction([
      prisma.store.update({ where: { id: store.id }, data: { botEnabled: true, officialPhoneId: String(phone.id), officialWabaId: String(wabaId), officialToken: official.encrypt(token), officialTokenExpiresAt: tokenExpiresAt, officialDisplayPhone: phone.display_phone_number, officialVerifiedName: phone.verified_name, officialStatus: 'connected', officialLastError: templateReady ? null : 'WhatsApp conectado. O modelo de aviso fora de 24 horas ainda está sendo preparado pela Meta.' } }),
      prisma.whatsAppInbox.updateMany({ where: { storeId: store.id, status: { in: ['pending', 'processing'] } }, data: { status: 'done', lastError: 'Identidade da conexão substituída' } }),
      prisma.whatsAppConversation.deleteMany({ where: { id: { startsWith: `${store.id}:` } } }),
    ]);
    await require('../services/whatsapp').stopSession(store.id, { preserveBotEnabled: true });
    // Meta allows contacts/history sync only within 24 h of coexistence onboarding.
    const sync = businessApp ? await official.syncBusinessApp(String(phone.id), token, store.id) : { ok: true };
    const syncFailure = sync.uncertain ? 'Conectado, mas a Meta não confirmou a sincronização. Desconecte e conecte de novo para tentar com segurança.' : 'Conectado. Falta sincronizar seus contatos: toque em "Sincronizar agora".';
    const finalStore = sync.ok ? updated : await prisma.store.update({ where: { id: store.id }, data: { officialLastError: syncFailure } });
    res.json({ connection: official.connection(finalStore), syncPending: !sync.ok });
  } catch (err) {
    // Only our own messages reach the salon owner; database/internal errors are never shown verbatim.
    if (err.code === 'P2002') return res.status(409).json({ error: 'Este número já está conectado a outra loja' });
    const ours = err.publicMessage === true;
    const message = err.metaCode ? `Meta recusou a conexão (código ${err.metaCode}). Verifique as permissões e a elegibilidade.` : ours ? err.message : 'Não deu para concluir a conexão agora. Tente de novo em alguns minutos.';
    if (!ours) console.error('[WhatsApp oficial] Falha interna ao conectar:', { name: err.name, code: err.code || null });
    else if (err.metaCode || err.network) console.warn('[WhatsApp oficial] Falha da Meta:', { code: err.metaCode || null, subcode: err.metaSubcode || null, traceId: err.traceId || null, network: !!err.network });
    await prisma.store.update({ where: { id: store.id }, data: { officialLastError: message } }).catch(() => {});
    res.status(ours ? err.status || 400 : 500).json({ error: message });
  }
});
router.post('/sync', requirePremium, limit, mutationLease, async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store?.officialPhoneId || !official.connection(store).connected) return res.status(409).json({ error: 'Conecte o WhatsApp antes de sincronizar.' });
  const sync = await official.syncBusinessApp(store.officialPhoneId, official.decrypt(store.officialToken), store.id);
  const failure = sync.expired ? 'Já passaram 24 horas da conexão e a Meta não deixa mais sincronizar. Para trazer seus contatos, desconecte e conecte de novo.' : sync.uncertain ? 'A Meta não confirmou se recebeu a sincronização. Para evitar repetir uma operação única, desconecte e conecte de novo.' : 'A Meta não aceitou a sincronização. Tente novamente dentro de 24 horas.';
  const updated = await prisma.store.update({ where: { id: store.id }, data: { officialLastError: sync.ok ? null : failure } });
  res.status(sync.ok ? 200 : 502).json({ connection: official.connection(updated), syncPending: !sync.ok, ...(!sync.ok && { error: failure }) });
});
router.delete('/disconnect', limit, mutationLease, async (req, res) => {
  const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  // Subscription belongs to the WABA (possibly multiple numbers); do not unsubscribe other stores.
  await prisma.whatsAppSignupState.deleteMany({ where: { storeId: store.id } });
  const updated = await prisma.store.update({ where: { id: store.id }, data: { botEnabled: false, officialPhoneId: null, officialWabaId: null, officialToken: null, officialTokenExpiresAt: null, officialDisplayPhone: null, officialVerifiedName: null, officialStatus: 'disconnected', officialLastError: null } });
  await prisma.whatsAppInbox.updateMany({ where: { storeId: store.id, status: { in: ['pending', 'processing'] } }, data: { status: 'done', lastError: 'Integração desconectada' } });
  await prisma.whatsAppConversation.deleteMany({ where: { id: { startsWith: `${store.id}:` } } });
  res.json({ connection: official.connection(updated) });
});
module.exports = router;
