const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWhatsAppSessions, normalizeConnectOptions, hasAuthenticatedCreds, PAIRING_TTL_MS, PAIRING_COOLDOWN_MS } = require('../src/services/whatsappSessions');

const PHONE = '5511999990000'; // Valor sintético; nenhum teste acessa rede, arquivos ou contas reais.
const pairing = { method: 'pairing', phoneNumber: PHONE };
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ registered = false, request, render, browser } = {}) {
  let clock = Date.UTC(2026, 9, 6);
  let timerId = 0;
  const timers = new Map();
  const disk = new Map();
  if (registered) disk.set(1, { me: { id: `${PHONE}:4@s.whatsapp.net` }, account: { signature: 'synthetic' }, registered: false });
  const sockets = [], writes = [], removed = [], updates = [], reads = [];
  const store = { id: 1, eligible: true };
  const manager = createWhatsAppSessions({
    ...(browser ? { browser } : {}),
    now: () => clock,
    schedule: (fn, delay) => { timers.set(++timerId, { fn, at: clock + delay }); return timerId; },
    cancel: (id) => timers.delete(id),
    prisma: { store: {
      findUnique: async () => { reads.push(true); return store; },
      update: async ({ data }) => { updates.push(data); return store; },
    } },
    isEligible: (value) => value?.eligible === true,
    loadAuth: async (id) => {
      const state = { creds: structuredClone(disk.get(id) || { registered: false }), keys: {} };
      writes.push('loaded');
      return { state, saveCreds: async () => { disk.set(id, structuredClone(state.creds)); writes.push('saved'); } };
    },
    removeAuth: async (id) => { removed.push(id); disk.delete(id); },
    renderQr: render || (async raw => 'data:image/png;base64,' + raw),
    disconnectReason: { loggedOut: 401, restartRequired: 515, timedOut: 408 },
    logger: {}, onMessage: async () => {},
    makeSocket: (options) => {
      const socket = {
        ev: new EventEmitter(), options, requests: [], ended: 0, logouts: 0,
        get user() { return options.auth.creds.me; },
        requestPairingCode: async (phone) => {
          socket.requests.push(phone);
          const me = { id: `${phone}@s.whatsapp.net`, name: '~' };
          socket.ev.emit('creds.update', { me, pairingCode: 'ABCD1234' });
          return request ? request(socket) : 'ABCD1234';
        },
        end: () => { socket.ended++; socket.ev.emit('connection.update', { connection: 'close' }); },
        logout: async () => { socket.logouts++; socket.ev.emit('connection.update', { connection: 'close' }); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  return {
    ...manager, sockets, writes, removed, updates, reads, disk, store, timers,
    async advance(ms) {
      clock += ms;
      const due = [...timers.entries()].filter(([, value]) => value.at <= clock);
      for (const [id, value] of due) { if (timers.delete(id)) value.fn(); }
      await settle();
    },
    emit(index, update) { sockets[index].ev.emit('connection.update', update); },
  };
}

test('normalização valida antes de ler banco, disco ou abrir socket', async () => {
  const f = fixture();
  for (const options of [null, [], { method: 'sms' }, { ...pairing, exact: 'yes' }, { ...pairing, phoneNumber: 'abc5511999990000' }, { ...pairing, phoneNumber: '00115511999990000' }, { ...pairing, phoneNumber: 5511999990000 }, { ...pairing, phoneNumber: '123' }, { ...pairing, restart: 'yes' }]) {
    assert.throws(() => f.startSession(1, options));
  }
  assert.equal(f.reads.length, 0);
  assert.equal(f.sockets.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(normalizeConnectOptions({ ...pairing, phoneNumber: '+55 (11) 99999-0000' }).phoneNumber, PHONE);
  assert.equal(normalizeConnectOptions().method, 'qr');
});

test('connect concorrente é single flight inclusive durante criação da auth', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 20 }, () => f.startSession(1, pairing)));
  assert.equal(f.sockets.length, 1);
  assert.equal(f.writes.filter(x => x === 'loaded').length, 1);
  assert.equal(f.getSessionStatus(1).status, 'connecting');
});

test('pairing espera QR após handshake e pede um único código com múltiplos eventos', async () => {
  const pending = deferred();
  const f = fixture({ request: () => pending.promise });
  await f.startSession(1, pairing);
  f.emit(0, { connection: 'connecting' });
  assert.equal(f.sockets[0].requests.length, 0);
  f.emit(0, { qr: 'raw-qr-1' });
  f.emit(0, { qr: 'raw-qr-2' });
  assert.equal(f.sockets[0].requests.length, 1);
  assert.equal(f.getSessionStatus(1).qr, null);
  pending.resolve('ABCD1234');
  await settle();
  const status = f.getSessionStatus(1);
  assert.equal(status.status, 'pairing');
  assert.equal(status.pairingCode, 'ABCD1234');
  assert.equal(status.pairingExpiresAt, new Date(Date.UTC(2026, 9, 6) + PAIRING_TTL_MS).toISOString());
  assert.equal(status.phone, null);
  assert.equal(status.pairingPhone, PHONE);
  assert.equal(status.alternatePhoneNumber, '551199990000');
  assert.deepEqual(await f.startSession(1, pairing), status);
});

test('QR antigo continua funcionando e render atrasado não sobrescreve conexão aberta', async () => {
  const render = deferred();
  const f = fixture({ render: () => render.promise });
  await f.startSession(1);
  f.emit(0, { qr: 'raw-qr' });
  f.sockets[0].ev.emit('creds.update', { me: { id: `${PHONE}:3@s.whatsapp.net` }, account: {} });
  f.emit(0, { connection: 'open' });
  await settle();
  render.resolve('data:image/png;base64,synthetic');
  await settle();
  assert.equal(f.getSessionStatus(1).status, 'connected');
  assert.equal(f.getSessionStatus(1).qr, null);
  assert.equal(f.getSessionStatus(1).phone, PHONE);
  assert.equal(f.sockets[0].requests.length, 0);
  assert.deepEqual(f.updates, [{ botEnabled: true }]);
});

test('QR publicado mantém contrato da imagem data URL', async () => {
  const f = fixture();
  await f.startSession(1);
  f.emit(0, { qr: 'synthetic' });
  await settle();
  assert.equal(f.getSessionStatus(1).status, 'qr');
  assert.equal(f.getSessionStatus(1).qr, 'data:image/png;base64,synthetic');
  assert.equal(f.getSessionStatus(1).pairingCode, null);
});

test('código expira sem renovar sozinho; novo connect limpa auth de tentativa incompleta', async () => {
  const f = fixture();
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  await f.advance(PAIRING_TTL_MS);
  assert.equal(f.getSessionStatus(1).errorCode, 'PAIRING_EXPIRED');
  assert.equal(f.getSessionStatus(1).pairingCode, null);
  assert.equal(f.getSessionStatus(1).pairingExpiresAt, null);
  assert.equal(f.sockets[0].ended, 1);
  assert.equal(f.sockets.length, 1);
  await f.startSession(1, pairing);
  assert.equal(f.sockets.length, 2);
  assert.equal(f.removed.length, 1);
  assert.equal(f.sockets[1].options.auth.creds.me, undefined);
});

test('restart é explícito, tem cooldown e troca tentativa sem derrubar sessão autenticada', async () => {
  const f = fixture();
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  await assert.rejects(f.startSession(1, { ...pairing, restart: true }), { code: 'CONNECTION_COOLDOWN' });
  assert.equal(f.sockets.length, 1);
  await f.advance(15000);
  await f.startSession(1, { ...pairing, restart: true });
  assert.equal(f.sockets.length, 2);
  f.sockets[1].ev.emit('creds.update', { me: { id: PHONE + '@s.whatsapp.net' }, account: {} });
  await f.startSession(1, { method: 'qr', restart: true });
  assert.equal(f.sockets.length, 2);
  f.emit(1, { connection: 'open' });
  await settle();
  const connected = await f.startSession(1, { ...pairing, phoneNumber: '5511888880000', restart: true });
  assert.equal(connected.status, 'connected');
  assert.equal(f.sockets.length, 2);
});

test('troca QR/código invalida resultado assíncrono e timer da tentativa anterior', async () => {
  const pending = deferred();
  const f = fixture({ request: () => pending.promise });
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await f.startSession(1, { method: 'qr' });
  pending.resolve('ABCD1234');
  await settle();
  f.emit(0, { connection: 'open' });
  assert.equal(f.sockets.length, 2);
  assert.equal(f.getSessionStatus(1).method, 'qr');
  assert.equal(f.getSessionStatus(1).pairingCode, null);
  assert.equal(f.getSessionStatus(1).status, 'connecting');
  assert.equal(f.updates.length, 0);
});

test('pareamento completo sobrevive restartRequired sem solicitar outro código', async () => {
  const f = fixture();
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  f.sockets[0].ev.emit('creds.update', { me: { id: PHONE + '@s.whatsapp.net' }, account: { signature: 'synthetic' } });
  f.emit(0, { isNewLogin: true });
  f.emit(0, { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
  await settle();
  assert.equal(f.getSessionStatus(1).pairingCode, null);
  assert.equal(f.getSessionStatus(1).status, 'reconnecting');
  await f.advance(5000);
  assert.equal(f.sockets.length, 2);
  assert.equal(f.removed.length, 0);
  assert.ok(hasAuthenticatedCreds(f.sockets[1].options.auth.creds));
  f.emit(1, { qr: 'unexpected' });
  f.emit(1, { connection: 'open' });
  await settle();
  assert.equal(f.sockets[1].requests.length, 0);
  assert.equal(f.getSessionStatus(1).status, 'connected');
});

test('disconnect invalida código em voo e todos os timers e eventos antigos', async () => {
  const pending = deferred();
  const f = fixture({ request: () => pending.promise });
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await f.stopSession(1);
  pending.resolve('ABCD1234');
  f.emit(0, { connection: 'close' });
  await f.advance(PAIRING_TTL_MS * 2);
  assert.equal(f.getSessionStatus(1).status, 'disconnected');
  assert.equal(f.timers.size, 0);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.sockets[0].logouts, 1);
  assert.equal(f.disk.size, 0);
});

test('disconnect cancela reconexão agendada e não deixa reativar bot', async () => {
  const f = fixture({ registered: true });
  await f.startSession(1);
  f.emit(0, { connection: 'close', lastDisconnect: { error: { code: 'ECONNREFUSED' } } });
  await settle();
  await f.stopSession(1);
  await f.advance(5000);
  assert.equal(f.sockets.length, 1);
  assert.deepEqual(f.updates, [{ botEnabled: false }]);
});

test('falha de rede preserva credenciais e limita reconexão a três tentativas', async () => {
  const f = fixture({ registered: true });
  await f.startSession(1);
  for (let index = 0; index < 4; index++) {
    f.emit(index, { connection: 'close', lastDisconnect: { error: { code: 'ENOTFOUND' } } });
    await f.advance(5000);
  }
  assert.equal(f.sockets.length, 4);
  assert.equal(f.removed.length, 0);
  assert.ok(hasAuthenticatedCreds(f.disk.get(1)));
  assert.equal(f.getSessionStatus(1).errorCode, 'CONNECTION_FAILED');
  assert.equal(f.timers.size, 0);
});

test('logout apaga auth; solicitação interrompida não emite outro código sem ação', async () => {
  const f = fixture();
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  f.emit(0, { connection: 'close' });
  await f.advance(5000);
  assert.equal(f.getSessionStatus(1).errorCode, 'PAIRING_INTERRUPTED');
  assert.equal(f.getSessionStatus(1).pairingCode, null);
  assert.equal(f.sockets.length, 1);
  const g = fixture({ registered: true });
  await g.startSession(1);
  g.emit(0, { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  await settle();
  assert.equal(g.getSessionStatus(1).errorCode, 'LOGGED_OUT');
  assert.equal(g.removed.length, 1);
  assert.deepEqual(g.updates, [{ botEnabled: false }]);
});

test('elegibilidade é conferida antes de conectar e novamente no open', async () => {
  const f = fixture();
  f.store.eligible = false;
  await assert.rejects(f.startSession(1, pairing), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.equal(f.sockets.length, 0);
  f.store.eligible = true;
  await f.startSession(1, pairing);
  f.store.eligible = false;
  f.emit(0, { connection: 'open' });
  await settle();
  assert.equal(f.getSessionStatus(1).errorCode, 'SUBSCRIPTION_REQUIRED');
  assert.equal(f.getSessionStatus(1).pairingCode, null);
  assert.equal(f.updates.length, 0);
});

test('falha de geração não expõe erro interno, número ou código', async () => {
  const f = fixture({ request: async () => { throw new Error(PHONE + ' ABCD1234 detalhes privados'); } });
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  assert.equal(f.getSessionStatus(1).errorCode, 'PAIRING_FAILED');
  assert.ok(!JSON.stringify(f.getSessionStatus(1)).includes(PHONE));
  assert.ok(!JSON.stringify(f.getSessionStatus(1)).includes('ABCD1234'));
});

test('restore distingue me provisório de identidade de conta autenticada', () => {
  assert.equal(hasAuthenticatedCreds({ me: { id: PHONE }, pairingCode: 'ABCD1234', registered: false }), false);
  assert.equal(hasAuthenticatedCreds({ me: { id: PHONE }, account: {}, registered: false }), true);
  assert.equal(hasAuthenticatedCreds({ me: { id: PHONE }, registered: true }), true);
});

test('normaliza número brasileiro: sem 55, com/sem o 9 por DDD e forma alternativa', () => {
  const n = (phoneNumber, extra = {}) => {
    const { phoneNumber: number, alternatePhoneNumber: alt } = normalizeConnectOptions({ ...pairing, phoneNumber, ...extra });
    return [number, alt];
  };
  // Sem código do país: lido como Brasil, não como EUA.
  assert.deepEqual(n('11 99999-0000'), ['5511999990000', '551199990000']);
  assert.deepEqual(n('(11) 99999-0000'), ['5511999990000', '551199990000']);
  // DDD até 28 mantém o 9; a partir de 31 o padrão é sem o 9.
  assert.deepEqual(n('+55 21 99999-0000'), ['5521999990000', '552199990000']);
  assert.deepEqual(n('+55 11 9999-0000'), ['5511999990000', '551199990000']);
  assert.deepEqual(n('31 99999-0000'), ['553199990000', '5531999990000']);
  assert.deepEqual(n('+55 31 99999-0000'), ['553199990000', '5531999990000']);
  assert.deepEqual(n('55 99999-0000'), ['555599990000', '5555999990000']);
  assert.deepEqual(n('+55 55 9999-0000'), ['555599990000', '5555999990000']);
  assert.deepEqual(n('85999990000'), ['558599990000', '5585999990000']);
  // Fixo: sem forma alternativa.
  assert.deepEqual(n('11 3333-4444'), ['551133334444', null]);
  // Internacional com + não muda.
  assert.deepEqual(n('+1 415 555 1234'), ['14155551234', null]);
  assert.deepEqual(n('+44 7911 123456'), ['447911123456', null]);
  assert.deepEqual(n('+351 912 345 678'), ['351912345678', null]);
  // exact usa o número como veio e devolve a outra forma.
  assert.deepEqual(n('5531999990000', { exact: true }), ['5531999990000', '553199990000']);
  assert.deepEqual(n('551199990000', { exact: true }), ['551199990000', '5511999990000']);
  assert.equal(normalizeConnectOptions({ method: 'qr' }).phoneNumber, null);
});

test('socket usa navegador canônico aceito pelo código por número', async () => {
  const f = fixture();
  await f.startSession(1, pairing);
  const browser = f.sockets[0].options.browser;
  assert.ok(['Mac OS', 'Ubuntu', 'Windows', 'Baileys'].includes(browser[0]), String(browser));
  assert.notEqual(browser[0], 'AGTgestor');
  assert.equal(browser[1], 'Chrome');
  assert.equal(`${browser[1]} (${browser[0]})`, 'Chrome (Mac OS)');
  const g = fixture({ browser: ['Ubuntu', 'Chrome', '22.04.4'] });
  await g.startSession(1, pairing);
  assert.deepEqual(g.sockets[0].options.browser, ['Ubuntu', 'Chrome', '22.04.4']);
});

test('tentar a outra forma do número ignora o cooldown uma vez e pede o código exato', async () => {
  const f = fixture();
  await f.startSession(1, { ...pairing, phoneNumber: '31 99999-0000' });
  f.emit(0, { qr: 'raw' });
  await settle();
  assert.deepEqual(f.sockets[0].requests, ['553199990000']);
  let status = f.getSessionStatus(1);
  assert.equal(status.pairingPhone, '553199990000');
  assert.equal(status.alternatePhoneNumber, '5531999990000');
  // Outro número qualquer continua sujeito ao cooldown.
  await assert.rejects(f.startSession(1, { ...pairing, phoneNumber: '5531888880000', exact: true, restart: true }), { code: 'CONNECTION_COOLDOWN' });
  // Forma alternativa, exata: sem esperar e sem normalizar de volta.
  await f.startSession(1, { ...pairing, phoneNumber: status.alternatePhoneNumber, exact: true, restart: true });
  assert.equal(f.sockets.length, 2);
  assert.equal(f.sockets[0].ended, 1);
  f.emit(1, { qr: 'raw' });
  await settle();
  assert.deepEqual(f.sockets[1].requests, ['5531999990000']);
  status = f.getSessionStatus(1);
  assert.equal(status.pairingPhone, '5531999990000');
  assert.equal(status.alternatePhoneNumber, '553199990000');
  // Voltar logo em seguida respeita o cooldown (não alterna sem fim).
  await assert.rejects(f.startSession(1, { ...pairing, phoneNumber: '553199990000', exact: true, restart: true }), { code: 'CONNECTION_COOLDOWN' });
  await f.advance(PAIRING_COOLDOWN_MS);
  await f.startSession(1, { ...pairing, phoneNumber: '553199990000', exact: true, restart: true });
  assert.equal(f.sockets.length, 3);
});

test('fim das referências de QR durante o código vira código expirado', async () => {
  assert.ok(PAIRING_TTL_MS <= 150000);
  const f = fixture();
  await f.startSession(1, pairing);
  f.emit(0, { qr: 'raw' });
  await settle();
  f.emit(0, { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } });
  await settle();
  const status = f.getSessionStatus(1);
  assert.equal(status.errorCode, 'PAIRING_EXPIRED');
  assert.equal(status.pairingCode, null);
  assert.equal(status.pairingPhone, null);
  assert.equal(f.sockets.length, 1);
});
