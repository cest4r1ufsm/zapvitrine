const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

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
    res.json(store);
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

    const logoUrl = `/uploads/${req.file.filename}`;
    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: { logoUrl },
    });

    res.json({ logoUrl: store.logoUrl });
  } catch (error) {
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

    const bannerUrl = `/uploads/${req.file.filename}`;
    const store = await prisma.store.update({
      where: { userId: req.user.id },
      data: { bannerUrl },
    });

    res.json({ bannerUrl: store.bannerUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer upload do banner' });
  }
});

// Get chatbot config
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
    res.json(store);
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
        ...(botToken !== undefined && { botToken }),
        ...(botWebhookToken !== undefined && { botWebhookToken }),
      },
    });

    res.json({
      botEnabled: store.botEnabled,
      botGreeting: store.botGreeting,
      botAwayMessage: store.botAwayMessage,
      botPhoneId: store.botPhoneId,
      botToken: store.botToken,
      botWebhookToken: store.botWebhookToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar configurações do chatbot' });
  }
});

module.exports = router;
