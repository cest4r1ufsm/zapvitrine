'use strict';

if (!process.env.TEST_POSTGRES_URL) {
  console.log('SKIP inbox PostgreSQL: TEST_POSTGRES_URL absent');
  process.exit(0);
}
if (process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Disposable PostgreSQL acknowledgement required');
process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
process.env.NODE_ENV = 'test';
process.env.RUN_BACKGROUND_JOBS = 'false';
const assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  {
    fork
  } = require('node:child_process');
const prisma = require('../src/lib/prisma');
if (process.env.INBOX_TEST_CHILD === 'yes') {
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://graph.facebook.com/') || !String(url).endsWith('/messages')) throw new Error('Unexpected network blocked');
    const body = JSON.parse(options.body);
    process.send({
      type: 'send-start',
      phone: body.to,
      phoneId: String(url).split('/').at(-2)
    });
    await new Promise(r => setTimeout(r, 200));
    process.send({
      type: 'send-end',
      phone: body.to,
      phoneId: String(url).split('/').at(-2)
    });
    return {
      ok: true,
      json: async () => ({
        messages: [{
          id: crypto.randomUUID()
        }]
      })
    };
  };
  const worker = require('../src/routes/webhook');
  process.on('message', async message => {
    if (message === 'stop') {
      await worker.stopInboxWorker();
      await prisma.$disconnect();
      process.send({
        type: 'stopped'
      });
      process.exit(0);
    }
  });
  worker.startInboxWorker().then(() => process.send({
    type: 'round-complete'
  })).catch(error => {
    process.send({
      type: 'error',
      error: error.message
    });
    process.exit(1);
  });
} else (async () => {
  const users = [],
    workers = [];
  let apiServer;
  const events = [],
    active = new Set();
  let maxParallel = 0;
  const marker = crypto.randomUUID();
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.META_APP_SECRET = 'test-inbox-secret';
  const service = require('../src/services/officialWhatsApp');
  function spawn() {
    const worker = fork(__filename, [], {
      env: {
        ...process.env,
        INBOX_TEST_CHILD: 'yes'
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    workers.push(worker);
    worker.on('message', m => {
      events.push(m);
      if (m.type === 'send-start') {
        assert(!active.has(m.phoneId), 'Concurrent sends within same store');
        active.add(m.phoneId);
        maxParallel = Math.max(maxParallel, active.size);
      }
      if (m.type === 'send-end') active.delete(m.phoneId);
    });
    return worker;
  }
  async function waitFor(predicate, ms = 15000) {
    const end = Date.now() + ms;
    while (!predicate()) {
      if (events.some(e => e.type === 'error')) throw new Error(JSON.stringify(events));
      if (Date.now() > end) throw new Error('Timed out waiting inbox test ' + JSON.stringify({
        events: events.map(e => e.type),
        queue: await prisma.whatsAppInbox.groupBy({
          by: ['status'],
          where: {
            storeId: {
              in: users.map(u => u.store.id)
            }
          },
          _count: true
        })
      }));
      await new Promise(r => setTimeout(r, 20));
    }
  }
  async function stop(worker) {
    if (worker.exitCode !== null) return;
    const exited = new Promise(r => worker.once('exit', r));
    worker.send('stop');
    await exited;
  }
  async function event(store, index, status = 'pending') {
    const phone = '5511999' + String(index).padStart(6, '0');
    return prisma.whatsAppInbox.create({
      data: {
        id: marker + '-' + store.id + '-' + index,
        storeId: store.id,
        phone,
        status,
        createdAt: new Date(Date.now() + index),
        ...(status === 'processing' ? {
          updatedAt: new Date(Date.now() - 360000)
        } : {}),
        payload: JSON.stringify({
          id: marker + '-' + index,
          from: phone,
          type: 'text',
          text: {
            body: 'oi'
          },
          _phoneId: store.officialPhoneId,
          _wabaId: store.officialWabaId,
          _connectionKey: crypto.createHash('sha256').update(store.officialToken).digest('hex')
        })
      }
    });
  }
  try {
    for (let i = 0; i < 6; i++) {
      const user = await prisma.user.create({
        data: {
          email: `${marker}-${i}@inbox.invalid`,
          password: 'unused',
          name: 'Test',
          store: {
            create: {
              name: 'Test inbox',
              slug: `${marker}-${i}`,
              phone: '5511999990000',
              officialPhoneId: `test-phone-${marker}-${i}`,
              officialWabaId: 'test-waba',
              officialToken: service.encrypt('synthetic-only-token'),
              officialStatus: 'connected',
              botEnabled: true,
              subscriptionStatus: 'active'
            }
          }
        },
        include: {
          store: true
        }
      });
      users.push(user);
      for (let j = 1; j <= 3; j++) await event(user.store, j);
    }
    const stale = await event(users[0].store, 0, 'processing');
    // Real webhook HTTP must enqueue only when API/worker separation is enabled.
    const express = require('express'),
      app = express();
    app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    app.use('/webhook', require('../src/routes/webhook'));
    apiServer = app.listen(0, '127.0.0.1');
    await new Promise(r => apiServer.once('listening', r));
    const body = JSON.stringify({
      entry: [{
        id: 'test-waba',
        changes: [{
          field: 'messages',
          value: {
            metadata: {
              phone_number_id: users[0].store.officialPhoneId
            },
            messages: [{
              id: 'http-' + marker,
              from: '5511999999999',
              type: 'text',
              text: {
                body: 'oi'
              }
            }]
          }
        }]
      }]
    });
    const res = await fetch(`http://127.0.0.1:${apiServer.address().port}/webhook/meta`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')
      },
      body
    });
    assert.equal(res.status, 200);
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await prisma.whatsAppInbox.findUnique({
      where: {
        id: users[0].store.id + ':http-' + marker
      }
    })).status, 'pending');
    const a = spawn(),
      b = spawn();
    await waitFor(() => events.filter(e => e.type === 'send-end').length === 19);
    const lateStale = await event(users[1].store, 99, 'processing');
    const recoveryDeadline = Date.now() + 8000;
    while ((await prisma.whatsAppInbox.findUnique({
      where: {
        id: lateStale.id
      }
    })).status !== 'failed') {
      assert(Date.now() < recoveryDeadline, 'Periodic expired-work detection must run after startup');
      await new Promise(r => setTimeout(r, 30));
    }
    await stop(a);
    await stop(b);
    assert(maxParallel >= 2, 'Independent stores must run concurrently');
    assert.equal((await prisma.whatsAppInbox.findUnique({
      where: {
        id: stale.id
      }
    })).status, 'failed');
    for (const user of users) {
      const messages = events.filter(e => e.type === 'send-start' && e.phoneId === user.store.officialPhoneId && e.phone !== '5511999999999');
      assert.deepEqual(messages.map(e => e.phone.slice(-6)), ['000001', '000002', '000003']);
    }
    assert.equal(await prisma.whatsAppWorkerLease.count({
      where: {
        id: {
          in: users.map(u => 'inbox:' + u.store.id)
        }
      }
    }), 0);
    // Graceful stop waits for the current accepted send and leaves later work pending.
    for (let i = 10; i < 15; i++) await event(users[0].store, i);
    const before = events.filter(e => e.type === 'send-start').length;
    const c = spawn();
    await waitFor(() => events.filter(e => e.type === 'send-start').length > before);
    await stop(c);
    assert.equal(active.size, 0);
    assert.equal(await prisma.whatsAppInbox.count({
      where: {
        storeId: users[0].store.id,
        status: 'pending'
      }
    }), 4);
    console.log('PASS inbox PostgreSQL: two workers; parallel stores; FIFO per store; API enqueue-only; stale processing failed without retry; graceful stop preserves pending work');
  } finally {
    for (const worker of workers) await stop(worker);
    if (apiServer) await new Promise(r => apiServer.close(r));
    for (const user of users) await prisma.user.delete({
      where: {
        id: user.id
      }
    });
    await prisma.$disconnect();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
