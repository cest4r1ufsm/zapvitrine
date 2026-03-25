const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get public store data by slug
router.get('/store/:slug', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { slug: req.params.slug },
      include: {
        categories: {
          orderBy: { order: 'asc' },
        },
        products: {
          where: { active: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
          include: { category: true },
        },
      },
    });

    if (!store || !store.active) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    // Don't expose sensitive fields
    const { userId, botToken, botPhoneId, botWebhookToken, botAwayMessage, ...storeData } = store;
    res.json(storeData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar loja' });
  }
});

module.exports = router;
