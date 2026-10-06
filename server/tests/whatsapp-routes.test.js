// HTTP real em localhost; auth, assinatura, banco e sockets são falsos.
// Não importa o serviço de produção nem lê arquivos de sessão ou .env.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { normalizeConnectOptions } = require('../src/services/whatsappSessions');

function mockedRouter(service) {
  const filename = path.join(__dirname, '..', 'src', 'routes', 'whatsapp.js');
  const target = new Module(filename, module);
  target.filename = filename;
  target.paths = module.paths;
  target.require = (name) => {
    if (name === '../services/whatsapp') return service;
    if (name === '../middleware/auth') return {
      auth: (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer test') return res.status(401).json({ error: 'Não autorizado' });
        req.user = { id: 1 };
        next();
      },
    };
    if (name === '../middleware/premium') return {
      requirePremium: (req, res, next) => {
        if (req.get('X-Test-Plan') !== 'active') return res.status(403).json({ code: 'SUBSCRIPTION_REQUIRED' });
        req.store = { id: Number(req.get('X-Test-Store') || 1) };
        next();
      },
    };
    if (name === '../lib/prisma') return { store: { findUnique: async () => ({ id: 1 }) } };
    return require(name);
  };
  target._compile(fs.readFileSync(filename, 'utf8'), filename);
  return target.exports;
}

test('rota exige auth/premium, valida contrato, não cacheia códigos e limita por loja', async (t) => {
  const calls = [];
  const service = {
    startSession: async (id, options) => {
      const normalized = normalizeConnectOptions(options);
      calls.push({ id, ...normalized });
      return { status: 'connecting', method: normalized.method, pairingCode: null };
    },
    getSessionStatus: () => ({ status: 'pairing', pairingCode: 'ABCD1234' }),
    stopSession: async () => {},
  };
  const app = express();
  app.use(express.json());
  app.use('/whatsapp', mockedRouter(service));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/whatsapp`;
  const headers = { Authorization: 'Bearer test', 'X-Test-Plan': 'active', 'Content-Type': 'application/json' };
  const post = (body, override = {}) => fetch(base + '/connect', { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(body) });

  assert.equal((await post({}, { Authorization: '' })).status, 401);
  assert.equal((await post({}, { 'X-Test-Plan': 'free' })).status, 403);
  assert.equal(calls.length, 0);
  const invalid = await post({ method: 'pairing', phoneNumber: 'incorrect' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_PHONE_NUMBER');
  assert.equal(calls.length, 0);
  const qr = await post({});
  assert.equal(qr.status, 200);
  assert.equal((await qr.json()).method, 'qr');
  const pairing = await post({ method: 'pairing', phoneNumber: '+55 (11) 99999-0000', restart: true });
  assert.equal(pairing.status, 200);
  assert.equal(pairing.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(calls[1], { id: 1, method: 'pairing', phoneNumber: '5511999990000', alternatePhoneNumber: '551199990000', exact: false, restart: true });
  const status = await fetch(base + '/status', { headers });
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  assert.equal((await status.json()).status, 'pairing');

  // Totaliza as 10 tentativas da loja 1; autenticação/plano recusados não contam.
  for (let i = 0; i < 7; i++) assert.equal((await post({})).status, 200);
  const limited = await post({});
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'CONNECTION_RATE_LIMITED');
  assert.equal((await post({}, { 'X-Test-Store': '2' })).status, 200);
});

test('rota devolve cooldown explícito e esconde erros internos de biblioteca', async (t) => {
  let mode = 'cooldown';
  const app = express();
  app.use(express.json());
  app.use('/whatsapp', mockedRouter({
    startSession: async () => {
      if (mode === 'cooldown') throw Object.assign(new Error('Aguarde 15 segundos.'), { code: 'CONNECTION_COOLDOWN', status: 429 });
      throw new Error('5511999990000 ABCD1234 private protocol');
    },
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = () => fetch(`http://127.0.0.1:${server.address().port}/whatsapp/connect`, {
    method: 'POST', headers: { Authorization: 'Bearer test', 'X-Test-Plan': 'active', 'Content-Type': 'application/json' }, body: '{}',
  });
  const cooldown = await request();
  assert.equal(cooldown.status, 429);
  assert.equal((await cooldown.json()).code, 'CONNECTION_COOLDOWN');
  mode = 'private-error';
  const failed = await request();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Erro ao iniciar sessão WhatsApp', code: 'CONNECTION_FAILED' });
});

test('rota normaliza número brasileiro sem 55, aceita forma exata e devolve número do código', async (t) => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use('/whatsapp', mockedRouter({
    startSession: async (id, options) => {
      const normalized = normalizeConnectOptions(options);
      calls.push(normalized);
      return { status: 'connecting', method: normalized.method };
    },
    getSessionStatus: () => ({ status: 'pairing', pairingCode: 'ABCD1234', pairingPhone: '553199990000', alternatePhoneNumber: '5531999990000' }),
    stopSession: async () => {},
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/whatsapp`;
  const headers = { Authorization: 'Bearer test', 'X-Test-Plan': 'active', 'Content-Type': 'application/json' };
  const post = body => fetch(base + '/connect', { method: 'POST', headers, body: JSON.stringify(body) });

  assert.equal((await post({ method: 'pairing', phoneNumber: '11 99999-0000' })).status, 200);
  assert.equal(calls[0].phoneNumber, '5511999990000');
  assert.equal((await post({ method: 'pairing', phoneNumber: '(31) 99999-0000' })).status, 200);
  assert.equal(calls[1].phoneNumber, '553199990000');
  assert.equal(calls[1].alternatePhoneNumber, '5531999990000');
  assert.equal((await post({ method: 'pairing', phoneNumber: '5531999990000', exact: true, restart: true })).status, 200);
  assert.equal(calls[2].phoneNumber, '5531999990000');
  assert.equal(calls[2].exact, true);
  assert.equal((await post({ method: 'pairing', phoneNumber: '+1 415 555 1234' })).status, 200);
  assert.equal(calls[3].phoneNumber, '14155551234');
  assert.equal(calls[3].alternatePhoneNumber, null);
  const badExact = await post({ method: 'pairing', phoneNumber: '11 99999-0000', exact: 'sim' });
  assert.equal(badExact.status, 400);
  assert.equal((await badExact.json()).code, 'INVALID_CONNECTION_OPTIONS');
  assert.equal(calls.length, 4);
  const status = await (await fetch(base + '/status', { headers })).json();
  assert.equal(status.pairingPhone, '553199990000');
  assert.equal(status.alternatePhoneNumber, '5531999990000');
});
