const express = require('express');
const { auth } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const Stripe = require('stripe');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/checkout', auth, async (req, res) => {
  try {
    // URLs de retorno vêm SEMPRE do APP_URL — nunca do header Origin (manipulável/ausente)
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error('APP_URL não configurado no .env — checkout abortado');
      return res.status(500).json({ error: 'Configuração do servidor incompleta' });
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    // Se já tiver uma assinatura ativa, redirecionar para o portal (Customer Portal)
    if (store.subscriptionStatus === 'active' && store.stripeCustomerId) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: store.stripeCustomerId,
        return_url: `${appUrl}/dashboard/billing`,
      });
      return res.json({ url: portalSession.url });
    }

    // Criar nova sessão de Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // ou 'boleto', 'pix', se configurado na Stripe
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard/billing?success=true`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
      client_reference_id: store.id.toString(),
      metadata: {
        storeId: store.id.toString(),
      },
      customer_email: req.user.email // Pra já preencher o checkout
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Erro ao gerar checkout:', error);
    res.status(500).json({ error: 'Falha ao iniciar pagamento' });
  }
});

module.exports = router;
