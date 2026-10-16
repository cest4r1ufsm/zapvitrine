'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  spawnSync
} = require('node:child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agt-directory-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}`;
process.env.NODE_ENV = 'test';
fs.writeFileSync(path.join(tmp, 'test.db'), '');
const migrated = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  encoding: 'utf8'
});
assert.equal(migrated.status, 0, migrated.stderr);
const prisma = require('../src/lib/prisma');
// Authentication's own suites verify cookies/tokens. These HTTP tests inject the
// authenticated identity and exercise real ownership/state transitions against DB.
require.cache[require.resolve('../src/middleware/auth')] = {
  exports: {
    auth: (req, res, next) => {
      req.user = {
        id: Number(req.headers['x-test-user']),
        name: 'Consumidor teste',
        emailVerified: req.headers['x-test-verified'] === 'yes',
        role: req.headers['x-test-admin'] === 'yes' ? 'admin' : 'business'
      };
      next();
    },
    adminOnly: (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).end()
  }
};
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/v1', require('../src/routes/directory'));
app.use('/api/v1/public', require('../src/routes/public'));
const D = require('../src/modules/directory/domain');
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function api(url, method = 'GET', body, user = 1, verified = true, admin = false) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-test-user': String(user),
        'x-test-verified': verified ? 'yes' : 'no',
        'x-test-admin': admin ? 'yes' : 'no'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return {
      status: res.status,
      data: await res.json().catch(() => null)
    };
  }
  try {
    for (let id = 1; id <= 2; id++) await prisma.user.create({
      data: {
        id,
        email: `test${id}@invalid.local`,
        password: 'unused',
        name: 'Teste',
        emailVerified: true,
        store: {
          create: {
            name: `Loja ${id}`,
            slug: `loja-${id}`,
            phone: '11999999999'
          }
        }
      }
    });
    await prisma.directoryMunicipality.create({
      data: {
        code: '3550308',
        name: 'São Paulo',
        searchName: 'sao paulo',
        uf: 'SP',
        timeZone: 'America/Sao_Paulo'
      }
    });
    await prisma.store.update({
      where: {
        userId: 1
      },
      data: {
        address: 'Private store address'
      }
    });
    const store1 = await prisma.store.findUnique({
        where: {
          userId: 1
        }
      }),
      store2 = await prisma.store.findUnique({
        where: {
          userId: 2
        }
      });
    const cheap = await prisma.product.create({
        data: {
          storeId: store1.id,
          name: 'Manicure',
          price: 25
        }
      }),
      expensive = await prisma.product.create({
        data: {
          storeId: store1.id,
          name: 'Penteado',
          price: 150
        }
      }),
      otherProduct = await prisma.product.create({
        data: {
          storeId: store2.id,
          name: 'Outro',
          price: 10
        }
      });
    const body = {
      version: 0,
      name: 'Salão teste',
      description: 'Perfil de teste',
      phone: '11999999999',
      address: 'Rua privada, 123',
      neighborhood: 'Centro',
      municipalityCode: '3550308',
      latitude: -23.55123,
      longitude: -46.63123,
      locationPrecision: 'approximate',
      hours: {
        1: [{
          start: '09:00',
          end: '18:00'
        }]
      },
      services: ['penteado', 'manicure'],
      productServices: [{
        productId: cheap.id,
        services: ['manicure']
      }, {
        productId: expensive.id,
        services: ['penteado']
      }],
      coordinatesConfirmed: true,
      onlineBookingEnabled: true,
      consent: true
    };
    let r = await api('/me/listing', 'PUT', body);
    assert.equal(r.status, 200, JSON.stringify(r));
    let profile = r.data.listing;
    assert.equal(profile.status, 'draft');
    assert.equal((await api('/me/listing', 'PUT', {
      ...body,
      version: profile.version,
      productServices: [{
        productId: otherProduct.id,
        services: ['penteado']
      }]
    })).status, 403);
    assert.equal((await api('/me/listing', 'GET', null, 2)).data.listing, null);
    assert.equal((await api('/directory?lat=-23.55&lng=-46.63')).data.items.length, 0);
    assert.equal((await api('/me/listing/submit', 'POST', {
      version: profile.version
    }, 1, false)).status, 422);
    assert.equal((await api('/me/listing', 'PUT', {
      ...body,
      version: 0
    })).status, 409);
    r = await api('/me/listing/submit', 'POST', {
      version: profile.version
    });
    assert.equal(r.status, 200);
    profile = r.data.listing;
    assert.equal((await api(`/admin/directory/${profile.publicId}/moderate`, 'POST', {
      version: profile.version,
      action: 'publish'
    })).status, 403);
    r = await api(`/admin/directory/${profile.publicId}/moderate`, 'POST', {
      version: profile.version,
      action: 'publish'
    }, 1, true, true);
    assert.equal(r.status, 200, JSON.stringify(r));
    profile = r.data.listing;
    r = await api('/directory/search?lat=-23.55&lng=-46.63&service=penteado');
    assert.equal(r.status, 200);
    assert.equal(r.data.items.length, 1);
    const pub = r.data.items[0];
    assert.equal(pub.address, null);
    assert.equal(pub.location.lat, -23.55);
    assert.equal(pub.latitude, undefined);
    assert.equal(pub.storeId, undefined);
    assert.equal(pub.distanceKm, 0);
    assert.equal((await api('/public/store/loja-1')).data.address, null);
    assert.equal((await api('/directory/listings/' + profile.publicId + '/reports', 'POST', {
      reason: 'Informação de teste para análise'
    }, 2)).status, 202);
    const reports = await api('/admin/directory/reports', 'GET', null, 1, true, true);
    assert.equal(reports.data.items.length, 1);
    assert.equal((await api('/admin/directory/reports/' + reports.data.items[0].id + '/resolve', 'POST', {
      reason: 'Revisão concluída'
    }, 1, true, true)).status, 200);
    assert.equal((await api('/directory?municipalityCode=3550308&service=penteado&maxPrice=30')).data.items.length, 0);
    assert.equal((await api('/directory?municipalityCode=3550308&service=penteado&maxPrice=200')).data.items.length, 1);
    assert.equal((await api('/directory?municipalityCode=3550308&service=barba')).data.items.length, 0);
    assert.equal((await api('/directory/clusters?bbox=-47,-24,-46,-23')).data.items[0].count, 1);
    // Consumer workflow: favorite, real availability, idempotent concurrent booking, verified review.
    assert.equal((await api('/me/favorites/' + profile.publicId, 'PUT', {}, 2)).status, 200);
    assert.equal((await api('/me/favorites', 'GET', null, 2)).data.items.length, 1);
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 7);
    while (target.getUTCDay() !== 1) target.setUTCDate(target.getUTCDate() + 1);
    const date = target.toISOString().slice(0, 10);
    const slots = await api('/directory/listings/' + profile.publicId + '/availability?productId=' + expensive.id + '&date=' + date);
    assert.equal(slots.status, 200);
    assert(slots.data.slots.includes('09:00'));
    const payload = {
      productId: expensive.id,
      date,
      time: '09:00',
      customerPhone: '11999999999',
      idempotencyKey: 'same-reservation-key-123'
    };
    const pair = await Promise.all([api('/directory/listings/' + profile.publicId + '/bookings', 'POST', payload, 2), api('/directory/listings/' + profile.publicId + '/bookings', 'POST', payload, 2)]);
    assert(pair.every(r => [200, 201].includes(r.status)), JSON.stringify(pair));
    assert.equal(pair[0].data.booking.id, pair[1].data.booking.id);
    assert.equal(await prisma.publicBooking.count(), 1);
    const booking = pair[0].data.booking;
    assert.equal((await api('/directory/listings/' + profile.publicId + '/bookings', 'POST', {
      ...payload,
      time: '10:00'
    }, 2)).status, 409);
    assert.equal((await api('/me/bookings/' + booking.id + '/review', 'POST', {
      rating: 5,
      text: 'Atendimento excelente'
    }, 2)).status, 403);
    const actual = await prisma.publicBooking.findUnique({
      where: {
        id: booking.id
      }
    });
    await prisma.order.update({
      where: {
        id: actual.orderId
      },
      data: {
        status: 'completed'
      }
    });
    assert.equal((await api('/me/bookings/' + booking.id + '/review', 'POST', {
      rating: 5,
      text: 'Atendimento excelente'
    }, 2)).status, 201);
    assert.equal((await api('/directory/listings/' + profile.publicId + '/reviews')).data.count, 0);
    const reviews = await api('/admin/directory/reviews', 'GET', null, 1, true, true);
    assert.equal((await api('/admin/directory/reviews/' + reviews.data.items[0].id + '/moderate', 'POST', {
      action: 'publish'
    }, 1, true, true)).status, 200);
    assert.equal((await api('/directory/listings/' + profile.publicId + '/reviews')).data.count, 1);
    assert.equal((await api('/me/bookings/' + booking.id + '/cancel', 'POST', {}, 1)).status, 404);
    assert.equal((await api('/me/bookings/' + booking.id + '/cancel', 'POST', {}, 2)).status, 409);
    assert.equal((await api('/directory/clusters?bbox=-47,-24,-46,-23&service=barba')).data.items.length, 0);
    assert.equal((await api('/directory/clusters?bbox=-47,-24,-46,-23&service=penteado&maxPrice=30')).data.items.length, 0);
    // Actual paid-plan state is deliberately irrelevant to publication.
    await prisma.store.update({
      where: {
        userId: 1
      },
      data: {
        subscriptionStatus: 'canceled',
        active: true
      }
    });
    assert.equal((await api(`/directory/listings/${profile.publicId}`)).status, 200);
    await prisma.store.update({
      where: {
        userId: 1
      },
      data: {
        active: false
      }
    });
    assert.equal((await api(`/directory/listings/${profile.publicId}`)).status, 404);
    await prisma.store.update({
      where: {
        userId: 1
      },
      data: {
        active: true
      }
    });
    r = await api('/me/listing/unpublish', 'POST', {
      version: profile.version
    });
    assert.equal(r.status, 200);
    assert.equal((await api(`/directory/listings/${profile.publicId}`)).status, 404);
    const night = {
      timeZone: 'America/Sao_Paulo',
      hoursJson: JSON.stringify({
        1: [{
          start: '22:00',
          end: '02:00'
        }]
      }),
      holidayHoursJson: '{}'
    };
    assert.equal(D.isOpen(night, new Date('2026-10-13T04:00:00Z')), true);
    assert.equal(D.isOpen({
      ...night,
      holidayHoursJson: JSON.stringify({
        '2026-10-13': []
      })
    }, new Date('2026-10-13T04:00:00Z')), false);
    assert.throws(() => D.holidayHours({
      '2026-02-30': []
    }));
    assert.throws(() => D.hours({
      1: [{
        start: '22:00',
        end: '02:00'
      }],
      2: [{
        start: '01:00',
        end: '03:00'
      }]
    }));
    assert.throws(() => D.hours({
      1: [{
        start: '09:00',
        end: '12:00'
      }, {
        start: '11:00',
        end: '14:00'
      }]
    }));
    assert.equal((await api('/directory?lat=NaN&lng=0')).status, 400);
    assert.equal((await api('/me/location/resolve', 'POST', {
      municipalityCode: '3550308',
      address: 'Rua exemplo 10'
    })).status, 503);
    await prisma.store.delete({
      where: {
        userId: 1
      }
    });
    assert.equal(await prisma.directoryListing.count(), 0);
    console.log('PASS directory: real isolated DB, ownership, moderation, privacy, version conflicts, public query, free listing, cascade');
  } finally {
    await new Promise(r => server.close(r));
    await prisma.$disconnect();
    fs.rmSync(tmp, {
      recursive: true,
      force: true
    });
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
