const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agt-session-'));
fs.writeFileSync(path.join(folder, 'test.db'), '');
process.env.DATABASE_URL = `file:${path.join(folder, 'test.db').replace(/\\/g, '/')}`;
process.env.NODE_ENV = 'test';
process.env.ALLOW_LEGACY_TEST_AUTH = 'false';
process.env.APP_URL = 'http://localhost:5007';
process.env.JWT_SECRET = 'isolated-test-secret-which-is-not-used-in-production';
const prepared = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.join(__dirname, '../prisma/schema.prisma')], { env: process.env, encoding: 'utf8' });
assert.equal(prepared.status, 0, prepared.stderr + prepared.stdout);
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { auth } = require('../src/middleware/auth');
const { digest, cookieName } = require('../src/services/session');

test('session cookies, CSRF, expiry, logout and password reset revocation', async () => {
  const user = await prisma.user.create({ data: { email: 'session@example.test', name: 'Session', password: await bcrypt.hash('strong-password-123', 4), emailVerified: true } });
  const app = express();
  app.use(express.json());
  require('../src/services/emailService').sendVerificationEmail = async () => {};
  app.use('/auth', require('../src/routes/auth'));
  app.post('/protected', auth, (req, res) => res.json({ id: req.user.id }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, { method = 'GET', cookie, csrf, origin = process.env.APP_URL, body, authorization } = {}) => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(authorization ? { Authorization: authorization } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  async function login(cookie) {
    const response = await call('/auth/login', { method: 'POST', cookie, body: { email: user.email, password: 'strong-password-123' } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.token, undefined);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/);
    return { cookie: header.split(';')[0], csrf: payload.csrfToken };
  }
  try {
    const consumerRegistration = await call('/auth/register', { method: 'POST', body: { name: 'Consumer', email: 'consumer@example.test', password: 'consumer-password', accountType: 'consumer' } });
    assert.equal(consumerRegistration.status, 201);
    const consumer = await prisma.user.findUnique({ where: { email: 'consumer@example.test' }, include: { store: true } });
    assert.equal(consumer.role, 'consumer'); assert.equal(consumer.store, null); assert.equal(consumer.emailVerified, false);
    assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'Admin?', email: 'invalid@example.test', password: 'strong-password-123', accountType: 'admin' } })).status, 400);
    assert.equal((await call('/auth/login', { method: 'POST', origin: 'https://evil.test', body: { email: user.email, password: 'strong-password-123' } })).status, 403);
    const first = await login();
    const raw = first.cookie.split('=')[1];
    const stored = await prisma.authSession.findUnique({ where: { id: digest(raw) } });
    assert.ok(stored); assert.notEqual(stored.id, raw); assert.notEqual(stored.csrfHash, first.csrf);
    const me = await call('/auth/me', first);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.equal((await me.json()).csrfToken, first.csrf);
    assert.equal((await call('/protected', { method: 'POST', cookie: first.cookie })).status, 403);
    assert.equal((await call('/protected', { method: 'POST', ...first, origin: 'https://evil.test' })).status, 403);
    assert.equal((await call('/protected', { method: 'POST', ...first, csrf: 'f'.repeat(64) })).status, 403);
    assert.equal((await call('/protected', { method: 'POST', ...first })).status, 200);
    const second = await login(first.cookie);
    assert.notEqual(second.cookie, first.cookie);
    assert.equal((await call('/auth/me', first)).status, 401);
    assert.equal((await call('/auth/logout', { method: 'POST', ...second })).status, 200);
    assert.equal((await call('/auth/me', second)).status, 401);
    const third = await login();
    await prisma.authSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/auth/me', third)).status, 401);
    const fourth = await login();
    const resetToken = 'a'.repeat(64);
    await prisma.user.update({ where: { id: user.id }, data: { passwordResetToken: resetToken, passwordResetExpires: new Date(Date.now() + 60000) } });
    const reset = { method: 'POST', body: { token: resetToken, password: 'another-password-456' } };
    assert.equal((await call('/auth/reset-password', reset)).status, 200);
    assert.equal((await call('/auth/reset-password', reset)).status, 400);
    assert.equal((await call('/auth/me', fourth)).status, 401);
    assert.equal(await prisma.authSession.count({ where: { userId: user.id } }), 0);
    const bearer = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
    assert.equal((await call('/auth/me', { authorization: `Bearer ${bearer}` })).status, 401);
    process.env.NODE_ENV = 'production';
    assert.equal(cookieName(), '__Host-agt_session');
    process.env.ALLOW_LEGACY_TEST_AUTH = 'true';
    assert.equal((await call('/auth/me', { authorization: `Bearer ${bearer}` })).status, 401);
  } finally {
    process.env.NODE_ENV = 'test';
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
