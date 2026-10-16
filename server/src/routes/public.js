const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get public store data by slug
router.get('/store/:slug', async (req, res) => {
  try {
    // WHITELIST explícita: este endpoint é público — nunca usar include + blacklist,
    // qualquer campo novo no schema vazaria por padrão (stripe*, bot*, subscription* etc.)
    const store = await prisma.store.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        phone: true,
        address: true,
        logoUrl: true,
        bannerUrl: true,
        themeColor: true,
        businessHours: true,
        active: true,
        directoryListing: { select: { locationPrecision: true } },
        categories: {
          select: { id: true, name: true, order: true },
          orderBy: { order: 'asc' },
        },
        products: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            duration: true,
            imageUrl: true,
            categoryId: true,
            order: true,
            category: { select: { id: true, name: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!store || !store.active) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    // Approximate directory profiles must not leak the private address through
    // their existing catalog link, even after withdrawal from the directory.
    const { directoryListing, ...publicStore } = store;
    if (directoryListing?.locationPrecision === 'approximate') publicStore.address = null;
    res.json(publicStore);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar loja' });
  }
});

module.exports = router;
