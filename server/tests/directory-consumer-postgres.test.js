'use strict';

if (!process.env.TEST_POSTGRES_URL) {
  console.log('SKIP consumer PostgreSQL: TEST_POSTGRES_URL absent');
  process.exit(0);
}
if (process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Disposable PostgreSQL acknowledgement required');
process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict'),
  {
    randomUUID
  } = require('node:crypto');
const {
  fork
} = require('node:child_process');
const prisma = require('../src/lib/prisma');
require.cache[require.resolve('../src/middleware/auth')] = {
  exports: {
    auth: (req, res, next) => {
      req.user = {
        id: Number(req.headers['x-test-user']),
        name: 'Test consumer',
        emailVerified: true,
        role: 'business'
      };
      next();
    },
    adminOnly: (req, res, next) => res.status(403).end()
  }
};
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/v1', require('../src/routes/directory'));
async function start() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return server;
}
if (process.env.DIRECTORY_HTTP_WORKER === 'yes') {
  start().then(server => {
    process.send({
      port: server.address().port
    });
    process.on('message', async m => {
      if (m === 'stop') {
        await new Promise(r => server.close(r));
        await prisma.$disconnect();
        process.exit(0);
      }
    });
  });
} else (async () => {
  let owner, consumer, server, worker;
  try {
    const marker = randomUUID();
    owner = await prisma.user.create({
      data: {
        email: `owner-${marker}@test.invalid`,
        password: 'unused',
        name: 'Owner',
        store: {
          create: {
            name: 'PG consumer test',
            slug: marker,
            phone: '11999999999'
          }
        }
      },
      include: {
        store: true
      }
    });
    consumer = await prisma.user.create({
      data: {
        email: `consumer-${marker}@test.invalid`,
        password: 'unused',
        name: 'Consumer',
        emailVerified: true,
        role: 'consumer'
      }
    });
    const product = await prisma.product.create({
      data: {
        storeId: owner.store.id,
        name: 'Corte',
        price: 100,
        duration: 30
      }
    });
    await prisma.professional.createMany({
      data: [{
        storeId: owner.store.id,
        name: 'Prof A'
      }, {
        storeId: owner.store.id,
        name: 'Prof B'
      }]
    });
    const hours = JSON.stringify(Object.fromEntries(Array.from({
      length: 7
    }, (_, i) => [i, [{
      start: '09:00',
      end: '18:00'
    }]])));
    const listing = await prisma.directoryListing.create({
      data: {
        publicId: marker,
        storeId: owner.store.id,
        name: 'PG test',
        phone: '11999999999',
        storeSlug: marker,
        address: 'Test address',
        municipalityCode: '3550308',
        city: 'São Paulo',
        uf: 'SP',
        latitude: -23.55,
        longitude: -46.63,
        publicLatitude: -23.55,
        publicLongitude: -46.63,
        locationPrecision: 'exact',
        timeZone: 'America/Sao_Paulo',
        hoursJson: hours,
        status: 'published',
        consentAt: new Date(),
        coordinatesConfirmedAt: new Date(),
        onlineBookingEnabled: true
      }
    });
    server = await start();
    worker = fork(__filename, [], {
      env: {
        ...process.env,
        DIRECTORY_HTTP_WORKER: 'yes'
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    const childPort = await new Promise((resolve, reject) => {
      worker.once('message', m => resolve(m.port));
      worker.once('error', reject);
      worker.once('exit', code => reject(new Error(`worker exit ${code}`)));
    });
    const ports = [server.address().port, childPort];
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 7);
    while (future.getUTCDay() !== 1) future.setUTCDate(future.getUTCDate() + 1);
    const date = future.toISOString().slice(0, 10);
    async function book(i, key, time) {
      const res = await fetch(`http://127.0.0.1:${ports[i % 2]}/api/v1/directory/listings/${marker}/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user': String(consumer.id)
        },
        body: JSON.stringify({
          productId: product.id,
          date,
          time,
          customerPhone: '11999999999',
          idempotencyKey: key
        })
      });
      return {
        status: res.status,
        data: await res.json()
      };
    }
    const repeated = await Promise.all(Array.from({
      length: 8
    }, (_, i) => book(i, 'identical-key-cross-worker', '09:00')));
    assert(repeated.every(r => [200, 201].includes(r.status)), JSON.stringify(repeated));
    assert.equal(new Set(repeated.map(r => r.data.booking.id)).size, 1);
    assert.equal(await prisma.publicBooking.count({
      where: {
        userId: consumer.id
      }
    }), 1);
    const competing = await Promise.all(Array.from({
      length: 8
    }, (_, i) => book(i, `different-key-number-${i}`, '10:00')));
    assert.equal(competing.filter(r => r.status === 201).length, 2, JSON.stringify(competing));
    assert(competing.every(r => [201, 409].includes(r.status)), JSON.stringify(competing));
    assert.equal(await prisma.order.count({
      where: {
        storeId: owner.store.id
      }
    }), 3);
    const assigned = await prisma.order.findMany({
      where: {
        storeId: owner.store.id,
        scheduledTime: {
          endsWith: '10:00'
        }
      },
      select: {
        professionalId: true
      }
    });
    assert.equal(new Set(assigned.map(r => r.professionalId)).size, 2);
    assert(assigned.every(r => r.professionalId !== null));
    const storedBooking = await prisma.publicBooking.findFirst({
      where: {
        userId: consumer.id
      }
    });
    await prisma.order.update({
      where: {
        id: storedBooking.orderId
      },
      data: {
        status: 'completed'
      }
    });
    await assert.rejects(() => prisma.directoryReview.create({
      data: {
        id: randomUUID(),
        bookingId: storedBooking.id,
        listingId: listing.id,
        rating: 6,
        text: 'Invalid direct database rating'
      }
    }), /review_rating_valid|constraint/i);
    const otherStore = await prisma.store.create({
      data: {
        userId: consumer.id,
        name: 'Other',
        slug: 'other-' + marker,
        phone: '11999999999'
      }
    });
    const otherListing = await prisma.directoryListing.create({
      data: {
        publicId: 'other-' + marker,
        storeId: otherStore.id,
        name: 'Other',
        phone: '11999999999',
        storeSlug: 'other-' + marker,
        address: 'Other',
        municipalityCode: '3550308',
        city: 'São Paulo',
        uf: 'SP',
        latitude: -23.55,
        longitude: -46.63,
        publicLatitude: -23.55,
        publicLongitude: -46.63,
        timeZone: 'America/Sao_Paulo'
      }
    });
    await assert.rejects(() => prisma.publicBooking.create({
      data: {
        id: randomUUID(),
        userId: consumer.id,
        orderId: storedBooking.orderId,
        listingId: otherListing.id,
        idempotencyKey: 'cross-tenant-key-test',
        requestHash: 'a'.repeat(64),
        timeZone: 'America/Sao_Paulo'
      }
    }), /booking tenant mismatch/i);
    await assert.rejects(() => prisma.directoryReview.create({
      data: {
        id: randomUUID(),
        bookingId: storedBooking.id,
        listingId: otherListing.id,
        rating: 5,
        text: 'Wrong listing review'
      }
    }), /same listing/i);
    console.log('PASS consumer DB integrity: rejects invalid rating, cross-tenant booking and cross-listing review');
    console.log('PASS consumer PostgreSQL HTTP: two processes, 8 same-key requests = 1 booking; 8 competing requests = 2 real professionals, remainder409');
  } finally {
    if (worker) {
      worker.send('stop');
      await new Promise(r => worker.once('exit', r));
    }
    if (server) await new Promise(r => server.close(r));
    if (consumer) await prisma.user.delete({
      where: {
        id: consumer.id
      }
    });
    if (owner) await prisma.user.delete({
      where: {
        id: owner.id
      }
    });
    await prisma.$disconnect();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
