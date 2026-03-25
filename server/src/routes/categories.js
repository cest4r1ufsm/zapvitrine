const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get all categories for user's store
router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const categories = await prisma.category.findMany({
      where: { storeId: store.id },
      orderBy: { order: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// Create category
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório' });

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const maxOrder = await prisma.category.findFirst({
      where: { storeId: store.id },
      orderBy: { order: 'desc' },
    });

    const category = await prisma.category.create({
      data: {
        storeId: store.id,
        name,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });
    res.status(201).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// Update category
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, order } = req.body;
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const category = await prisma.category.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!category) return res.status(404).json({ error: 'Categoria não encontrada' });

    const updated = await prisma.category.update({
      where: { id: category.id },
      data: {
        ...(name && { name }),
        ...(order !== undefined && { order }),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// Delete category
router.delete('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const category = await prisma.category.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!category) return res.status(404).json({ error: 'Categoria não encontrada' });

    await prisma.category.delete({ where: { id: category.id } });
    res.json({ message: 'Categoria removida com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

module.exports = router;
