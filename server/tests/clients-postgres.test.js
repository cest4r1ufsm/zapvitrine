'use strict';
if (!process.env.TEST_POSTGRES_URL) { console.log('SKIP clients PostgreSQL: TEST_POSTGRES_URL absent'); process.exit(0); }
if (process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Disposable PostgreSQL acknowledgement required');
Object.assign(process.env, { DATABASE_URL: process.env.TEST_POSTGRES_URL, NODE_ENV: 'test', ALLOW_LEGACY_TEST_AUTH: 'true', JWT_SECRET: 'isolated-postgres-clients-test-secret' });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../src/lib/prisma');
const app = express();
app.use('/clients', require('../src/routes/clients'));
(async () => {
  const ids = [];
  let server;
  try {
    const marker = randomUUID();
    async function owner(suffix) {
      const user = await prisma.user.create({ data: { email: `${marker}-${suffix}@test.invalid`, name: 'PG clients', password: 'unused', emailVerified: true, store: { create: { name: 'PG clients', slug: `${marker}-${suffix}`, phone: '5511999999999' } } }, include: { store: true } });
      ids.push(user.id); return user;
    }
    const a = await owner('a'), b = await owner('b');
    const phone = '5511999991111';
    await prisma.client.create({ data: { storeId: a.store.id, phone, name: 'Cliente A' } });
    await prisma.client.create({ data: { storeId: a.store.id, phone: '5511999992222', name: 'Sem pedidos' } });
    await prisma.client.create({ data: { storeId: b.store.id, phone, name: 'Segredo B' } });
    const product = await prisma.product.create({ data: { storeId: a.store.id, name: 'Serviço PG', price: 45.5 } });
    const pro = await prisma.professional.create({ data: { storeId: a.store.id, name: 'Profissional PG' } });
    const date = new Date('2035-01-01T10:00:00Z');
    const create = (storeId, createdAt, extra = {}) => prisma.order.create({ data: { storeId, customerName: 'Cliente', customerPhone: phone, createdAt, ...extra } });
    await create(a.store.id, date);
    const latest = await create(a.store.id, date, { productId: product.id, professionalId: pro.id, totalPrice: 45.5 });
    await create(a.store.id, new Date('2020-01-01T00:00:00Z'));
    await create(b.store.id, new Date('2040-01-01T00:00:00Z'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const token = jwt.sign({ userId: a.id }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/clients`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.equal(rows.length, 2);
    const client = rows.find(row => row.phone === phone);
    assert.equal(client.name, 'Cliente A');
    assert.equal(client.totalOrders, 3);
    assert.equal(typeof client.totalOrders, 'number', 'PG bigint count safely serialized');
    assert.equal(client.lastOrder.id, latest.id);
    assert.equal(client.lastOrder.createdAt, date.toISOString());
    assert.equal(client.lastOrder.totalPrice, 45.5);
    assert.equal(client.lastOrder.product.name, 'Serviço PG');
    assert.equal(client.lastOrder.professional.name, 'Profissional PG');
    const empty = rows.find(row => row.phone !== phone);
    assert.equal(empty.totalOrders, 0); assert.equal(empty.lastOrder, null);
    assert.ok(!JSON.stringify(rows).includes('Segredo B'));
    console.log('PASS clients PostgreSQL HTTP: stable date/id ranking, numeric counts, ISO dates, relations, empty history and tenant isolation');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
