const express = require('express');
const prisma = require('../lib/prisma');
const Stripe = require('stripe');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Webhook payload TEM que ser raw format (buffer) para validar a assinatura
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const storeId = parseInt(session.client_reference_id);

        if (storeId) {
          await prisma.store.update({
            where: { id: storeId },
            data: {
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              subscriptionStatus: 'active',
              plan: 'premium',
            }
          });
          console.log(`✅ Assinatura ativada via Checkout para loja #${storeId}`);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        // Nota: "past_due" intencionalmente NÃO derruba a sessão do bot aqui —
        // período de graça até o próximo restart ou o cancelamento definitivo (subscription.deleted).
        // Pelo ID do customer ou da subscription, acha a store
        await prisma.store.updateMany({
           where: { stripeSubscriptionId: subscription.id },
           data: {
              subscriptionStatus: subscription.status, // "active", "past_due", "canceled" etc
           }
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        // Localiza as stores ANTES do update para poder derrubar as sessões Baileys ativas
        const affectedStores = await prisma.store.findMany({
          where: { stripeSubscriptionId: subscription.id },
          select: { id: true },
        });

        await prisma.store.updateMany({
           where: { stripeSubscriptionId: subscription.id },
           data: {
              subscriptionStatus: 'canceled',
              botEnabled: false // Desliga o robô automaticamente se cancelar!
           }
        });

        // Encerra a sessão WhatsApp imediatamente (require tardio evita ciclo de dependência)
        const { stopSession } = require('../services/whatsapp');
        for (const s of affectedStores) {
          stopSession(s.id).catch((err) =>
            console.error(`Erro ao encerrar sessão da loja #${s.id} após cancelamento:`, err.message)
          );
        }

        console.log(`❌ Assinatura cancelada.`);
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Erro processando webhook', err);
    res.status(500).json({ error: 'Server erro no DB' });
  }
});

module.exports = router;
