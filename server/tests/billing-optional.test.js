const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
function router(name) {
  const filename = path.join(__dirname, '../src/routes', name);
  const target = new Module(filename, module);
  target.filename = filename; target.paths = module.paths;
  target.require = name => {
    if (name === '../utils/bookingLock') return { withStoreLock: () => { throw new Error('Unconfigured billing must not open transactions'); } };
    if (name === '../middleware/auth') return { auth: (req, res, next) => { req.user = { id: 1 }; next(); } };
    if (name === '../lib/prisma') return new Proxy({}, { get() { throw new Error('Unconfigured provider must not read or change billing'); } });
    return require(name);
  };
  target._compile(fs.readFileSync(filename, 'utf8'), filename);
  return target.exports;
}
test('optional Stripe does not prevent startup or grant billing access', async () => {
  const app = express();
  app.use('/billing', router('billing.js'));
  app.use('/webhook', router('stripe-webhook.js'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const endpoint of ['/billing/checkout', '/webhook']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 503);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
