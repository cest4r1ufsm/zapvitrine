const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { processImage } = require('../utils/processImage');

const router = express.Router();

// Get store
router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { userId: req.user.id },
      include: { categories: { orderBy: { order: 'asc' } } },
    });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }
    // Nunca enviar segredos/ids internos ao navegador (o painel não usa esses campos;
    // subscriptionStatus, plan e trialEndsAt continuam presentes)
    const { botToken, stripeCustomerId, stripeSubscriptionId, ...safeStore } = store;
    res.json(safeStore);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar loja' });
  }
});

// Update store
router.put('/', auth, async (req, res) => {
  try {
    const { name, slug, description, phone, address, themeColor, businessHours } = req.body;

    // Check slug uniqueness
    if (slug) {
      const existingStore = await prisma.store.findUnique({ where: { slug } });
      if (existingStore && existingStore.userId !== req.user.id) {
        return res.status(400).json({ error: 'Este link já está em uso' });
      }
    }

    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(themeColor && { themeColor }),
        ...(businessHours !== undefined && { businessHours }),
      },
    });

    res.json(store);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar loja' });
  }
});

// Upload logo
router.post('/logo', auth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem' });
    }

    const { filename } = await processImage(req.file);
    const logoUrl = `/uploads/${filename}`;
    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: { logoUrl },
    });

    res.json({ logoUrl: store.logoUrl });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer upload do logo' });
  }
});

// Upload banner
router.post('/banner', auth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem' });
    }

    const { filename } = await processImage(req.file);
    const bannerUrl = `/uploads/${filename}`;
    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: { bannerUrl },
    });

    res.json({ bannerUrl: store.bannerUrl });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer upload do banner' });
  }
});

// Get chatbot config
// botToken (Cloud API da Meta) é write-only: nunca sai em texto claro para o navegador.
// botWebhookToken permanece visível — é o verify token que o próprio usuário digita no painel da Meta.
router.get('/chatbot', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        botEnabled: true,
        botGreeting: true,
        botAwayMessage: true,
        botPhoneId: true,
        botToken: true,
        botWebhookToken: true,
      },
    });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { botToken, ...rest } = store;
    res.json({
      ...rest,
      botTokenSet: !!botToken,
      botTokenLast4: botToken ? botToken.slice(-4) : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações do chatbot' });
  }
});

// Update chatbot config
router.put('/chatbot', auth, async (req, res) => {
  try {
    const { botEnabled, botGreeting, botAwayMessage, botPhoneId, botToken, botWebhookToken } = req.body;

    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: {
        ...(botEnabled !== undefined && { botEnabled }),
        ...(botGreeting !== undefined && { botGreeting }),
        ...(botAwayMessage !== undefined && { botAwayMessage }),
        ...(botPhoneId !== undefined && { botPhoneId }),
        // botToken: só atualiza quando vier string não-vazia (evita apagar sem querer);
        // null explícito limpa o token
        ...(typeof botToken === 'string' && botToken.trim() !== '' && { botToken: botToken.trim() }),
        ...(botToken === null && { botToken: null }),
        ...(botWebhookToken !== undefined && { botWebhookToken }),
      },
    });

    res.json({
      botEnabled: store.botEnabled,
      botGreeting: store.botGreeting,
      botAwayMessage: store.botAwayMessage,
      botPhoneId: store.botPhoneId,
      botTokenSet: !!store.botToken,
      botTokenLast4: store.botToken ? store.botToken.slice(-4) : null,
      botWebhookToken: store.botWebhookToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar configurações do chatbot' });
  }
});

module.exports = router;
