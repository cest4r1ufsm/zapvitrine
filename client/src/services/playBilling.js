import api from './api';

// ── PAGAMENTO PELO GOOGLE PLAY (app Android) ────────────────────────────────
//
// O app da Play Store é este mesmo site aberto numa TWA. Lá dentro o Google
// exige o pagamento do Google Play; no navegador continua o Stripe. A TWA se
// anuncia no document.referrer (android-app://<pacote>) só na primeira
// página, então a marca fica guardada na sessão.

export const PLAY_PACKAGE = 'br.com.agentegestor.app';
export const PLAY_METHOD = 'https://play.google.com/billing';
export const PLAY_SKU = 'agtgestor_premium_mensal';
const KEY = 'agtgestor-play-app';

export function isAndroidApp() {
  const referrer = document.referrer || '';
  try {
    if (referrer.startsWith(`android-app://${PLAY_PACKAGE}`)) sessionStorage.setItem(KEY, '1');
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return referrer.startsWith(`android-app://${PLAY_PACKAGE}`);
  }
}

/** Está no app da Play Store e o Chrome oferece a Digital Goods API? */
export function canUsePlayBilling() {
  return isAndroidApp() && typeof window.getDigitalGoodsService === 'function';
}

async function service() {
  const s = await window.getDigitalGoodsService(PLAY_METHOD);
  if (!s) throw new Error('O pagamento do Google Play não está disponível neste aparelho.');
  return s;
}

const verify = (purchaseToken) => api.post('/play/verify', { purchaseToken, productId: PLAY_SKU });

/** Preço do plano como a Play Store mostra (ex.: "R$ 27,99"), ou null. */
export async function playPrice() {
  const [details] = await (await service()).getDetails([PLAY_SKU]);
  if (!details?.price) return null;
  const { currency, value } = details.price;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value));
}

/** Compra o plano pelo Google Play e só devolve depois de o servidor confirmar. */
export async function playPurchase() {
  const s = await service();
  const [details] = await s.getDetails([PLAY_SKU]);
  if (!details) throw new Error('Plano indisponível no Google Play agora. Tente mais tarde.');
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_METHOD, data: { sku: PLAY_SKU } }],
    { total: { label: 'AGTGestor Premium', amount: details.price || { currency: 'BRL', value: '0' } } }
  );
  const response = await request.show();
  const { purchaseToken } = response.details || {};
  try {
    const data = await verify(purchaseToken);
    await response.complete('success');
    return data;
  } catch (error) {
    await response.complete('fail').catch(() => {});
    throw error;
  }
}

/** Restaurar compra: confere no servidor as assinaturas que o Google Play conhece. */
export async function playRestore() {
  const purchases = await (await service()).listPurchases();
  let last = null;
  for (const p of purchases || []) {
    if (p.itemId !== PLAY_SKU) continue;
    last = await verify(p.purchaseToken);
  }
  return last;
}

export const PLAY_MANAGE_URL =
  `https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}&sku=${PLAY_SKU}`;
