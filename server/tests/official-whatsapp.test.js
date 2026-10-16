const assert = require('node:assert/strict');
const crypto = require('crypto');
const { criarBancoTemporario } = require('./helpers');
const banco = criarBancoTemporario();
Object.assign(process.env, { META_APP_ID: '123456', META_APP_SECRET: 'test-app-secret', META_SIGNUP_CONFIG_ID: '654321', META_WEBHOOK_VERIFY_TOKEN: 'test-verify', WHATSAPP_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') });
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../src/lib/prisma');
const service = require('../src/services/officialWhatsApp');
const webhook = require('../src/routes/webhook');
const realFetch = global.fetch;
let tokenWaba = '777', metaFail = false, sent = 0, tokenExpiresAt = 0, dataAccessExpiresAt = 0, lastSentBody;
global.fetch = async (url, options) => {
  if (!String(url).includes('graph.facebook.com')) return realFetch(url, options);
  if (metaFail) return { ok: false, json: async () => ({ error: { code: 190 } }) };
  let data = {};
  if (String(url).includes('oauth/access_token')) data = { access_token: 'secret-token' };
  else if (String(url).includes('debug_token')) data = { data: { expires_at: tokenExpiresAt, data_access_expires_at: dataAccessExpiresAt, is_valid: true, app_id: '123456', scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [tokenWaba] }, { scope: 'whatsapp_business_messaging', target_ids: [tokenWaba] }] } };
  else if (String(url).includes('phone_numbers')) data = { data: [{ id: '888', display_phone_number: '+55 11 99999-0000', verified_name: 'Teste' }] };
  else if (String(url).endsWith('/messages')) { lastSentBody = JSON.parse(options.body); sent++; data = { messages: [{ id: `out-${sent}` }] }; }
  else data = { success: true };
  return { ok: true, json: async () => data };
};
async function run() {
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/official', require('../src/routes/officialWhatsApp'));
  app.use('/webhook', webhook);
  app.use('/store', require('../src/routes/store'));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const user = await prisma.user.create({ data: { email: `official-${Date.now()}@test.invalid`, password: 'hash', name: 'Teste', store: { create: { name: 'Teste', slug: `official-${Date.now()}`, phone: '5511999990000', subscriptionStatus: 'active' } } }, include: { store: true } });
    const auth = { Authorization: `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' };
    const request = (path, method = 'GET', data) => realFetch(base + path, { method, headers: auth, ...(data && { body: JSON.stringify(data) }) });
    const cfg = await (await request('/official/config')).json();
    assert.equal(cfg.available, true); assert.ok(cfg.state); assert.ok(!JSON.stringify(cfg).includes('test-app-secret'));
    tokenWaba = '999';
    let response = await request('/official/connect', 'POST', { code: 'code', state: cfg.state, wabaId: '777' });
    assert.equal(response.status, 400, 'untrusted WABA rejected');
    tokenWaba = '777';
    response = await request('/official/connect', 'POST', { code: 'code', state: cfg.state, wabaId: '777' });
    assert.equal(response.status, 400, 'state one-time even failure');
    tokenExpiresAt = Math.floor(Date.now() / 1000) - 60;
    const expiredConfig = await (await request('/official/config')).json();
    response = await request('/official/connect', 'POST', { code: 'expired-code', state: expiredConfig.state, wabaId: '777' });
    assert.equal(response.status, 400, 'expired authorization cannot replace a connection');
    tokenExpiresAt = Math.floor(Date.now() / 1000) + 7200;
    dataAccessExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    const fresh = await (await request('/official/config')).json();
    response = await request('/official/connect', 'POST', { code: 'code2', state: fresh.state, wabaId: '777' });
    assert.equal(response.status, 200); assert.equal((await response.json()).connection.phoneId, '888');
    const store = await prisma.store.findUnique({ where: { id: user.store.id } });
    assert.equal(store.officialTokenExpiresAt.getTime(), dataAccessExpiresAt * 1000, 'earlier data access expiry is persisted');
    assert.ok(store.officialToken !== 'secret-token'); assert.equal(service.decrypt(store.officialToken), 'secret-token');
    const safe = await (await request('/store')).json(); assert.equal(safe.officialToken, undefined);
    response = await request('/store/chatbot', 'PUT', { botPhoneId: '999' }); assert.equal(response.status, 409);
    response = await realFetch(base + '/webhook/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(response.status, 401);
    await prisma.store.update({ where: { id: store.id }, data: { botEnabled: true } });
    const data = { entry: [{ id: '777', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '888' }, messages: [{ id: 'wamid-one', from: '5511988880000', type: 'text', text: { body: 'oi' } }, { id: 'wamid-two', from: '5511977770000', type: 'text', text: { body: 'oi' } }] } }] }] };
    const postWebhook = async payload => {
      const body = JSON.stringify(payload);
      const signature = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
      return realFetch(base + '/webhook/meta', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature }, body });
    };
    await prisma.whatsAppConversation.create({ data: { id: `${store.id}:5511988880000`, storeId: store.id, state: '{invalid-json' } });
    assert.equal((await postWebhook(data)).status, 200);
    const until = Date.now() + 3000;
    while (await prisma.whatsAppInbox.count({ where: { status: 'done', storeId: store.id } }) < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
    assert.equal(await prisma.whatsAppInbox.count({ where: { storeId: store.id } }), 2);
    const beforeInvalid = sent;
    await assert.rejects(service.send(store, '5511988880000@lid', { type: 'text', text: { body: 'teste' } }), /inválido/);
    await assert.rejects(service.send(store, 'cliente5511988880000', { type: 'text', text: { body: 'teste' } }), /inválido/);
    assert.equal(sent, beforeInvalid, 'invalid recipient never reaches Graph');
    await service.send(store, '5511988880000', { type: 'text', to: '5511977770000', messaging_product: 'other', text: { body: 'teste' } });
    assert.equal(lastSentBody.to, '5511988880000', 'payload cannot override authorized destination');
    assert.equal(lastSentBody.messaging_product, 'whatsapp');
    assert.equal(service.connection({ ...store, officialTokenExpiresAt: new Date(Date.now() - 60000).toISOString() }).status, 'reauthorization_required');
    const before = sent; await postWebhook(data); await new Promise(r => setTimeout(r, 50)); assert.equal(sent, before, 'redelivery deduplicated');
    await prisma.store.update({ where: { id: store.id }, data: { botEnabled: false } });
    await assert.rejects(service.send(store, '5511988880000', { type: 'text', text: { body: 'teste' } }, { automation: true }), /pausado/);
    await prisma.store.update({ where: { id: store.id }, data: { botEnabled: true } });
    metaFail = true; await assert.rejects(service.send(store, '5511988880000', { type: 'text', text: { body: 'teste' } })); metaFail = false;
    await postWebhook({ entry: [{ id: '777', changes: [{ value: { metadata: { phone_number_id: '888' }, statuses: [{ id: 'out-1', status: 'failed', errors: [{ code: 131047 }] }] } }] }] });
    assert.equal((await prisma.whatsAppDelivery.findUnique({ where: { id: 'out-1' } })).status, 'failed');
    const reauth = await prisma.store.findUnique({ where: { id: store.id } });
    await prisma.whatsAppInbox.create({ data: {
      id: `${store.id}:pending-before-reauth`, storeId: store.id, phone: '5511988880000',
      payload: JSON.stringify({ id: 'pending-before-reauth', from: '5511988880000', type: 'text', text: { body: 'oi' },
        _phoneId: store.officialPhoneId, _wabaId: store.officialWabaId, _connectionKey: crypto.createHash('sha256').update(store.officialToken).digest('hex') }),
    } });
    await webhook.startInboxWorker();
    assert.equal((await prisma.whatsAppInbox.findUnique({ where: { id: `${store.id}:pending-before-reauth` } })).status, 'failed', 'authorization failure keeps pending customer request visible');
    await webhook.stopInboxWorker();

    await assert.rejects(service.send({ ...reauth, botToken: 'legacy-token', botPhoneId: 'old-phone' }, '5511988880000', { type: 'text', text: { body: 'teste' } }));
    await postWebhook({ entry: [{ id: '777', changes: [{ value: { metadata: { phone_number_id: '888' }, statuses: [{ id: 'out-2', status: 'read' }, { id: 'out-2', status: 'sent' }] } }] }] });
    assert.equal((await prisma.whatsAppDelivery.findUnique({ where: { id: 'out-2' } })).status, 'read');
    response = await request('/official/disconnect', 'DELETE'); assert.equal((await response.json()).connection.connected, false);
    assert.equal((await prisma.store.findUnique({ where: { id: store.id } })).officialToken, null);
    console.log('Official WhatsApp: authorization ownership, one-time state, encryption, secret redaction, signature, batch inbox, deduplication, send failure, delivery status and disconnect passed.');
  } finally { await webhook.stopInboxWorker(); global.fetch = realFetch; await prisma.$disconnect(); server.close(); banco.remover(); }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
