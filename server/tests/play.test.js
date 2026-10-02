// Assinatura pelo Google Play (app Android) e exclusão de conta.
//
// O Google é simulado por um fetch falso: nenhuma chamada sai para a rede.
const { criarRunner, criarBancoTemporario } = require('./helpers');

const banco = criarBancoTemporario(); // antes de carregar o Prisma

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { isEligible } = require('../src/middleware/premium');
const {
  playEntitlement,
  createPlayBilling,
  createServiceAccountToken,
} = require('../src/services/playBilling');
const { createPlayRoutes } = require('../src/routes/play');

const { check, resumo } = criarRunner();
const PRODUTO = 'agtgestor_premium_mensal';
const DIA = 24 * 60 * 60 * 1000;

function compra({ state = 'SUBSCRIPTION_STATE_ACTIVE', productId = PRODUTO, expira = Date.now() + 30 * DIA, ack = 'ACKNOWLEDGEMENT_STATE_PENDING' } = {}) {
  return {
    subscriptionState: state,
    acknowledgementState: ack,
    lineItems: [{ productId, expiryTime: new Date(expira).toISOString() }],
  };
}

// fetch falso: responde pelo token de compra e registra as chamadas
function googleFalso(respostas) {
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    chamadas.push({ url, method: init.method || 'GET' });
    if (url.includes(':acknowledge')) return { ok: true, status: 204, json: async () => null };
    const token = decodeURIComponent(url.split('/tokens/')[1] || '');
    const r = respostas[token];
    if (r === undefined) return { ok: false, status: 404, text: async () => '' };
    if (typeof r === 'number') return { ok: false, status: r, text: async () => '' };
    return { ok: true, status: 200, json: async () => r };
  };
  return { fetchImpl, chamadas };
}

async function criarLoja(sufixo, extra = {}) {
  const user = await prisma.user.create({
    data: { email: `play-${sufixo}-${Date.now()}@exemplo.com`, password: await bcrypt.hash('senha-forte-1', 4), name: 'P', emailVerified: true },
  });
  const store = await prisma.store.create({
    data: { userId: user.id, name: 'Loja ' + sufixo, slug: `play-${sufixo}-${Date.now()}`, phone: '', ...extra },
  });
  return { user, store };
}

module.exports = async function run() {
  console.log('\n=== Google Play Billing ===');
  try {
    // ── tradução da resposta do Google ──
    check('assinatura ativa libera', playEntitlement(compra()).active === true, 'não liberou');
    check('cancelada ainda no período pago libera',
      playEntitlement(compra({ state: 'SUBSCRIPTION_STATE_CANCELED' })).active === true, 'não liberou');
    check('vencida não libera',
      playEntitlement(compra({ state: 'SUBSCRIPTION_STATE_EXPIRED', expira: Date.now() - DIA })).active === false, 'liberou');
    check('produto de outro app é ignorado', playEntitlement(compra({ productId: 'outro' })) === null, 'aceitou');

    // ── elegibilidade premium ──
    check('Play com validade futura é premium',
      isEligible({ subscriptionStatus: 'active', subscriptionSource: 'play', subscriptionExpiresAt: new Date(Date.now() + DIA) }), 'negou');
    check('Play vencido não é premium',
      !isEligible({ subscriptionStatus: 'active', subscriptionSource: 'play', subscriptionExpiresAt: new Date(Date.now() - DIA) }), 'liberou');
    check('Stripe ativo continua premium sem data',
      isEligible({ subscriptionStatus: 'active', subscriptionSource: null }), 'negou');

    // ── verificar compra ──
    const google = googleFalso({
      'tok-ok': compra(),
      'tok-vencido': compra({ state: 'SUBSCRIPTION_STATE_EXPIRED', expira: Date.now() - DIA }),
      'tok-fora': 503,
    });
    const expirados = [];
    const play = createPlayBilling({
      prisma, getAccessToken: async () => 'token-falso', fetchImpl: google.fetchImpl,
      onExpired: (id) => expirados.push(id),
    });

    const a = await criarLoja('a');
    const loja = await play.verify(a.store.id, { purchaseToken: 'tok-ok', productId: PRODUTO });
    check('compra confirmada ativa a loja', loja.subscriptionStatus === 'active' && loja.subscriptionSource === 'play', JSON.stringify(loja));
    check('validade gravada', loja.subscriptionExpiresAt > new Date(), String(loja.subscriptionExpiresAt));
    check('compra reconhecida no Google (acknowledge)', google.chamadas.some((c) => c.url.includes(':acknowledge')), 'sem acknowledge');
    check('loja passa a ser premium', isEligible(loja), 'não elegível');

    const b = await criarLoja('b');
    let erro = await play.verify(b.store.id, { purchaseToken: 'tok-ok' }).catch((e) => e);
    check('mesma compra não libera outra conta', erro?.status === 409, 'status: ' + erro?.status);

    erro = await play.verify(b.store.id, { purchaseToken: 'tok-ok', productId: 'outro' }).catch((e) => e);
    check('plano desconhecido é recusado', erro?.status === 400, 'status: ' + erro?.status);

    erro = await play.verify(b.store.id, { purchaseToken: 'tok-inexistente' }).catch((e) => e);
    check('compra que o Google não conhece é recusada', erro?.status === 400, 'status: ' + erro?.status);

    const c = await criarLoja('c', { subscriptionStatus: 'active', stripeSubscriptionId: 'sub_123', subscriptionSource: 'stripe' });
    erro = await play.verify(c.store.id, { purchaseToken: 'tok-ok-2' }).catch((e) => e);
    check('conta que já paga pelo site não compra de novo', erro?.status === 409, 'status: ' + erro?.status);

    // ── renovação / vencimento ──
    const d = await criarLoja('d', {
      subscriptionStatus: 'active', subscriptionSource: 'play', playPurchaseToken: 'tok-vencido',
      playProductId: PRODUTO, subscriptionExpiresAt: new Date(Date.now() - 1000), botEnabled: true,
    });
    const e = await criarLoja('e', {
      subscriptionStatus: 'active', subscriptionSource: 'play', playPurchaseToken: 'tok-fora',
      playProductId: PRODUTO, subscriptionExpiresAt: new Date(Date.now() - 1000),
    });
    await play.refreshDue();
    const dDepois = await prisma.store.findUnique({ where: { id: d.store.id } });
    check('assinatura vencida é encerrada', dDepois.subscriptionStatus === 'canceled', dDepois.subscriptionStatus);
    check('robô desligado ao vencer', dDepois.botEnabled === false, 'bot ligado');
    check('WhatsApp desconectado ao vencer', expirados.includes(d.store.id), JSON.stringify(expirados));
    const eDepois = await prisma.store.findUnique({ where: { id: e.store.id } });
    check('Google fora do ar não derruba a assinatura', eDepois.subscriptionStatus === 'active', eDepois.subscriptionStatus);

    // ── token OAuth da conta de serviço ──
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    let pedidos = 0;
    let assertion = null;
    const getToken = createServiceAccountToken({
      serviceAccount: { client_email: 'sa@exemplo.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) },
      fetchImpl: async (url, init) => {
        pedidos++;
        assertion = new URLSearchParams(init.body).get('assertion');
        return { ok: true, json: async () => ({ access_token: 'abc', expires_in: 3600 }) };
      },
    });
    const t1 = await getToken();
    await getToken();
    const claims = jwt.verify(assertion, publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['RS256'] });
    check('token OAuth obtido', t1 === 'abc', t1);
    check('token reaproveitado até vencer', pedidos === 1, 'pedidos: ' + pedidos);
    check('assinatura pede escopo da Play', claims.scope.includes('androidpublisher'), claims.scope);

    // ── rotas HTTP ──
    const app = express();
    app.use(express.json());
    app.use('/api/play-off', createPlayRoutes(null));
    app.use('/api/play', createPlayRoutes(play));
    app.use('/api/auth', require('../src/routes/auth'));
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const BASE = 'http://127.0.0.1:' + server.address().port + '/api';
    const req = async (metodo, rota, user, corpo) => {
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
      const r = await fetch(BASE + rota, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    };

    try {
      const f = await criarLoja('f');
      let r = await req('POST', '/play-off/verify', f.user, { purchaseToken: 'x' });
      check('sem conta de serviço a compra responde 503', r.status === 503, 'status: ' + r.status);

      const g = await criarLoja('g');
      const respostas = googleFalso({ 'tok-g': compra() });
      const playG = createPlayBilling({ prisma, getAccessToken: async () => 't', fetchImpl: respostas.fetchImpl });
      const appG = express();
      appG.use(express.json());
      appG.use('/api/play', createPlayRoutes(playG));
      const serverG = appG.listen(0);
      await new Promise((ok) => serverG.once('listening', ok));
      const tokenG = jwt.sign({ userId: g.user.id }, process.env.JWT_SECRET);
      const rg = await fetch('http://127.0.0.1:' + serverG.address().port + '/api/play/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenG },
        body: JSON.stringify({ purchaseToken: 'tok-g', productId: PRODUTO }),
      });
      const bodyG = await rg.json();
      serverG.close();
      check('rota /verify ativa a assinatura', rg.status === 200 && bodyG.subscriptionStatus === 'active', JSON.stringify(bodyG));

      // ── excluir conta ──
      const h = await criarLoja('h');
      r = await req('DELETE', '/auth/account', h.user, { password: 'errada' });
      check('senha errada não exclui', r.status === 400, 'status: ' + r.status);
      check('conta continua lá', !!(await prisma.user.findUnique({ where: { id: h.user.id } })), 'sumiu');

      r = await req('DELETE', '/auth/account', h.user, { password: 'senha-forte-1' });
      check('senha certa exclui', r.status === 200, 'status: ' + r.status + ' ' + JSON.stringify(r.body));
      check('usuário apagado', !(await prisma.user.findUnique({ where: { id: h.user.id } })), 'ainda existe');
      check('loja apagada junto', !(await prisma.store.findUnique({ where: { id: h.store.id } })), 'ainda existe');

      const me = await req('GET', '/auth/me', a.user);
      check('/me não expõe o token de compra', me.body?.store && !('playPurchaseToken' in me.body.store), JSON.stringify(Object.keys(me.body?.store || {})));
    } finally {
      server.close();
    }

    return resumo('Google Play Billing');
  } finally {
    await prisma.$disconnect();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then((r) => { process.exitCode = r.fail ? 1 : 0; process.exit(); });
}
