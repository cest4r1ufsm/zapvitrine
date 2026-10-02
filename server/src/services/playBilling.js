const fs = require('fs');
const jwt = require('jsonwebtoken');

// ── ASSINATURA PELO GOOGLE PLAY ──────────────────────────────────────────────
//
// O app da Play Store é este mesmo site aberto numa TWA. Lá dentro o Google
// exige o pagamento do Google Play; no site continua o Stripe. A página compra
// pela Digital Goods API e manda o purchaseToken para cá. Aqui ele é conferido
// na Google Play Developer API antes de liberar o premium — o navegador nunca
// é a fonte da verdade.
//
// Renovação, cancelamento e reembolso chegam sem webhook: perto de vencer,
// refreshDue() pergunta de novo ao Google.

const PLAY_PACKAGE = 'br.com.agentegestor.app';
const PLAY_PRODUCTS = ['agtgestor_premium_mensal'];
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

const ACCESS_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  // Cancelada pela pessoa: o período já pago continua valendo até expirar.
  'SUBSCRIPTION_STATE_CANCELED',
]);

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Traduz a resposta do subscriptionsv2 no que a loja precisa guardar. */
function playEntitlement(purchase, now = Date.now()) {
  const item = (purchase?.lineItems || []).find((i) => PLAY_PRODUCTS.includes(i.productId));
  if (!item) return null;
  const expiresAt = Date.parse(item.expiryTime || '') || 0;
  const active = ACCESS_STATES.has(purchase.subscriptionState) && expiresAt > now;
  return {
    active,
    productId: item.productId,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  };
}

/** Lê a conta de serviço do Google: JSON direto na variável ou caminho de arquivo. */
function loadServiceAccount(env = process.env) {
  if (env.PLAY_SERVICE_ACCOUNT_JSON) return JSON.parse(env.PLAY_SERVICE_ACCOUNT_JSON);
  if (env.PLAY_SERVICE_ACCOUNT_FILE) return JSON.parse(fs.readFileSync(env.PLAY_SERVICE_ACCOUNT_FILE, 'utf8'));
  return null;
}

/** Token OAuth da conta de serviço, guardado até perto de vencer. */
function createServiceAccountToken({ serviceAccount, fetchImpl = fetch }) {
  let cached = null;
  return async function getAccessToken() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const iat = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: serviceAccount.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 },
      serviceAccount.private_key,
      { algorithm: 'RS256' }
    );
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!response.ok) throw fail(502, `Google OAuth respondeu ${response.status}`);
    const data = await response.json();
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return cached.token;
  };
}

function createPlayBilling({ prisma, getAccessToken, fetchImpl = fetch, now = Date.now, onExpired = () => {} }) {
  async function call(path, init = {}) {
    const token = await getAccessToken();
    const response = await fetchImpl(`${API}/${PLAY_PACKAGE}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) {
      const notFound = response.status === 404 || response.status === 400 || response.status === 410;
      throw fail(notFound ? 400 : 502, notFound ? 'Compra não encontrada no Google Play.' : `Google Play respondeu ${response.status}.`);
    }
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  const fetchPurchase = (purchaseToken) =>
    call(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);

  async function acknowledge(purchase, productId, purchaseToken) {
    if (purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING') return;
    await call(
      `purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      { method: 'POST', body: '{}' }
    );
  }

  async function save(storeId, entitlement, purchaseToken) {
    const data = {
      subscriptionSource: 'play',
      subscriptionStatus: entitlement.active ? 'active' : 'canceled',
      subscriptionExpiresAt: entitlement.expiresAt,
      playPurchaseToken: purchaseToken,
      playProductId: entitlement.productId,
    };
    if (entitlement.active) data.plan = 'premium';
    else data.botEnabled = false;
    const store = await prisma.store.update({ where: { id: storeId }, data });
    if (!entitlement.active) onExpired(storeId);
    return store;
  }

  /** Confere uma compra feita no app e libera o premium se o Google confirmar. */
  async function verify(storeId, { purchaseToken, productId } = {}) {
    if (!purchaseToken || typeof purchaseToken !== 'string') throw fail(400, 'Compra inválida.');
    if (productId && !PLAY_PRODUCTS.includes(productId)) throw fail(400, 'Plano desconhecido.');

    // Um token de compra vale para uma loja só: sem isso, a mesma compra
    // liberaria o premium para quantas contas alguém quisesse.
    const owner = await prisma.store.findFirst({ where: { playPurchaseToken: purchaseToken } });
    if (owner && owner.id !== storeId) throw fail(409, 'Esta compra já está ligada a outra conta AGTGestor.');

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw fail(404, 'Loja não encontrada');
    if (store.subscriptionSource !== 'play' && store.subscriptionStatus === 'active' && store.stripeSubscriptionId) {
      throw fail(409, 'Esta conta já tem assinatura ativa pelo site.');
    }

    const purchase = await fetchPurchase(purchaseToken);
    const entitlement = playEntitlement(purchase, now());
    if (!entitlement) throw fail(400, 'Esta compra não é de um plano do AGTGestor.');
    if (entitlement.active) await acknowledge(purchase, entitlement.productId, purchaseToken);
    return save(storeId, entitlement, purchaseToken);
  }

  /** Pergunta de novo ao Google sobre a compra guardada (renovação, cancelamento). */
  async function refresh(store) {
    if (store.subscriptionSource !== 'play' || !store.playPurchaseToken) return store;
    try {
      const purchase = await fetchPurchase(store.playPurchaseToken);
      const entitlement = playEntitlement(purchase, now()) || { active: false, productId: store.playProductId, expiresAt: null };
      return await save(store.id, entitlement, store.playPurchaseToken);
    } catch (error) {
      // Google fora do ar não pode derrubar quem ainda está no período pago.
      if (error.status === 502) return store;
      throw error;
    }
  }

  /** Revisa as assinaturas do Google que já venceram ou vencem na próxima hora. */
  async function refreshDue() {
    const due = await prisma.store.findMany({
      where: {
        subscriptionSource: 'play',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: { lte: new Date(now() + 60 * 60 * 1000) },
      },
    });
    for (const store of due) {
      await refresh(store).catch((err) => console.error(`[Play] refresh loja #${store.id}:`, err.message));
    }
    return due.length;
  }

  return { verify, refresh, refreshDue };
}

module.exports = {
  PLAY_PACKAGE,
  PLAY_PRODUCTS,
  playEntitlement,
  loadServiceAccount,
  createServiceAccountToken,
  createPlayBilling,
};
