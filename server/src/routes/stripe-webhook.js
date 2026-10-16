const express = require('express');
const prisma = require('../lib/prisma');
const Stripe = require('stripe');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Webhook payload TEM que ser raw format (buffer) para validar a assinatura
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !endpointSecret) return res.status(503).json({ error: 'Integração de pagamento indisponível.' });
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Stripe: assinatura inválida.');
    return res.status(400).json({ error: 'Assinatura inválida.' });
  }

  // Handle the event
  try {
    await require('../services/stripeReconciliation').reconcileStripeEvent({
      event, stripe, prisma,
      withStoreLock: require('../utils/bookingLock').withStoreLock,
      stopSession: require('../services/whatsapp').stopSession,
    });

    res.json({ received: true });
  } catch (err) {
    console.error('Erro processando webhook', err);
    res.status(500).json({ error: 'Server erro no DB' });
  }
});

module.exports = router;
