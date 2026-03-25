const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Get all products for user's store
router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: { category: true },
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Create product
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, price, categoryId, active } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const maxOrder = await prisma.product.findFirst({
      where: { storeId: store.id },
      orderBy: { order: 'desc' },
    });

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        description: description || null,
        price: parseFloat(price),
        categoryId: categoryId ? parseInt(categoryId) : null,
        active: active !== undefined ? active : true,
        order: (maxOrder?.order ?? -1) + 1,
      },
      include: { category: true },
    });
    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// Update product
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, price, categoryId, active, order } = req.body;

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId) : null }),
        ...(active !== undefined && { active }),
        ...(order !== undefined && { order }),
      },
      include: { category: true },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Delete product
router.delete('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    await prisma.product.delete({ where: { id: product.id } });
    res.json({ message: 'Produto removido com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

// Upload product image
router.post('/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem' });
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const imageUrl = `/uploads/${req.file.filename}`;
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
    });

    res.json({ imageUrl: updated.imageUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
  }
});

module.exports = router;
