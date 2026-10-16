const express = require('express');
const { auth } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const Stripe = require('stripe');

const { withStoreLock } = require('../utils/bookingLock');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

router.post('/checkout', auth, async (req, res) => {
  try {
    if (!stripe || !process.env.STRIPE_PRICE_ID) return res.status(503).json({ error: 'Pagamento pelo site temporariamente indisponível.' });
    // URLs de retorno vêm SEMPRE do APP_URL — nunca do header Origin (manipulável/ausente)
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error('APP_URL não configurado no .env — checkout abortado');
      return res.status(500).json({ error: 'Configuração do servidor incompleta' });
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    // Assinatura feita no app Android é gerenciada no Google Play, não no Stripe
    if (store.subscriptionSource === 'play' && store.subscriptionStatus === 'active') {
      return res.status(409).json({
        error: 'Sua assinatura foi feita pelo Google Play. Gerencie ou cancele pelo app da Play Store.',
        code: 'PLAY_SUBSCRIPTION',
      });
    }

    // Se já tiver uma assinatura ativa, redirecionar para o portal (Customer Portal)
    if (store.subscriptionStatus === 'active' && store.stripeCustomerId) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: store.stripeCustomerId,
        return_url: `${appUrl}/dashboard/billing`,
      });
      return res.json({ url: portalSession.url });
    }

    const session = await withStoreLock(store.id, async () => {
      const current = await prisma.store.findUnique({ where: { id: store.id } });
      if (!current || !current.active) throw Object.assign(new Error('Loja indisponível'), { status: 403 });
      if (current.subscriptionSource === 'play' && current.subscriptionStatus === 'active') throw Object.assign(new Error('Gerencie a assinatura pelo Google Play'), { status: 409 });
      let customer = current.stripeCustomerId;
      if (!customer) {
        const created = await stripe.customers.create({ email: req.user.email, metadata: { storeId: String(store.id) } }, { idempotencyKey: `agt-customer-${store.id}-${req.user.id}` });
        customer = created.id;
        await prisma.store.update({ where: { id: store.id }, data: { stripeCustomerId: customer } });
      }
      // Reuse the current open checkout rather than issuing independent subscriptions
      // when a mobile user retries after a slow response or refresh.
      const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 10 });
      const existing = open.data.find(s => s.mode === 'subscription' && s.client_reference_id === String(store.id));
      if (existing?.url) return existing;
      return stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        mode: 'subscription',
        success_url: `${appUrl}/dashboard/billing?success=true`,
        cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
        client_reference_id: String(store.id),
        metadata: { storeId: String(store.id) },
        customer,
      }, { idempotencyKey: `agt-checkout-${store.id}-${Math.floor(Date.now() / 900000)}` });
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Erro ao gerar checkout:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Falha ao iniciar pagamento' });
  }
});

module.exports = router;
