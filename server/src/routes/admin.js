const express = require('express');
const prisma = require('../lib/prisma');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        createdAt: true,
        store: {
          select: { id: true, name: true, slug: true, active: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Get all stores (admin only)
router.get('/stores', auth, adminOnly, async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      include: {
        user: { select: { email: true, name: true, plan: true } },
        _count: { select: { products: true, categories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(stores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar lojas' });
  }
});

// Toggle store active status (admin only)
router.patch('/stores/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { active: !store.active },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao alterar status da loja' });
  }
});

module.exports = router;
