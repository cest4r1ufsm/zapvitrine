const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { processImage } = require('../utils/processImage');

const router = express.Router();

const MAX_MINUTES = 1440; // 24h

// Converte para inteiro aceitando number ou string numérica; null se inválido
function toIntOrNull(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

// Retorna { error } ou { value } (value = null quando o campo não foi enviado)
function parseMinutesField(value, { min, max, label }) {
  if (value === undefined || value === null || value === '') return { value: null };
  const parsed = toIntOrNull(value);
  if (parsed === null || parsed < min || parsed > max) {
    return { error: `${label} deve ser um número inteiro entre ${min} e ${max} minutos` };
  }
  return { value: parsed };
}

function parsePriceField(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: 'Preço inválido. Informe um valor numérico maior ou igual a zero.' };
  }
  return { value: parsed };
}

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
    const { name, description, price, categoryId, active, duration, bufferTime } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const parsedPrice = parsePriceField(price);
    if (parsedPrice.error) return res.status(400).json({ error: parsedPrice.error });

    const parsedDuration = parseMinutesField(duration, { min: 1, max: MAX_MINUTES, label: 'Duração' });
    if (parsedDuration.error) return res.status(400).json({ error: parsedDuration.error });

    const parsedBuffer = parseMinutesField(bufferTime, { min: 0, max: MAX_MINUTES, label: 'Intervalo entre atendimentos' });
    if (parsedBuffer.error) return res.status(400).json({ error: parsedBuffer.error });

    let parsedCategoryId = null;
    if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
      parsedCategoryId = toIntOrNull(categoryId);
      if (parsedCategoryId === null) return res.status(400).json({ error: 'Categoria inválida' });
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
        price: parsedPrice.value,
        duration: parsedDuration.value ?? 30,
        bufferTime: parsedBuffer.value ?? 0,
        categoryId: parsedCategoryId,
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
    const productId = toIntOrNull(req.params.id);
    if (productId === null) return res.status(400).json({ error: 'Produto inválido' });

    const { name, description, price, categoryId, active, order, duration, bufferTime } = req.body;

    let parsedPrice;
    if (price !== undefined) {
      const result = parsePriceField(price);
      if (result.error) return res.status(400).json({ error: result.error });
      parsedPrice = result.value;
    }

    let parsedDuration;
    if (duration !== undefined && duration !== null && duration !== '') {
      const result = parseMinutesField(duration, { min: 1, max: MAX_MINUTES, label: 'Duração' });
      if (result.error) return res.status(400).json({ error: result.error });
      parsedDuration = result.value;
    }

    let parsedBuffer;
    if (bufferTime !== undefined && bufferTime !== null && bufferTime !== '') {
      const result = parseMinutesField(bufferTime, { min: 0, max: MAX_MINUTES, label: 'Intervalo entre atendimentos' });
      if (result.error) return res.status(400).json({ error: result.error });
      parsedBuffer = result.value;
    }

    let parsedCategoryId;
    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === '') {
        parsedCategoryId = null;
      } else {
        parsedCategoryId = toIntOrNull(categoryId);
        if (parsedCategoryId === null) return res.status(400).json({ error: 'Categoria inválida' });
      }
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parsedPrice }),
        ...(parsedDuration !== undefined && { duration: parsedDuration }),
        ...(parsedBuffer !== undefined && { bufferTime: parsedBuffer }),
        ...(categoryId !== undefined && { categoryId: parsedCategoryId }),
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
    const productId = toIntOrNull(req.params.id);
    if (productId === null) return res.status(400).json({ error: 'Produto inválido' });

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId: store.id },
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

    const productId = toIntOrNull(req.params.id);
    if (productId === null) return res.status(400).json({ error: 'Produto inválido' });

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const { filename } = await processImage(req.file);
    const imageUrl = `/uploads/${filename}`;
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
    });

    res.json({ imageUrl: updated.imageUrl });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
  }
});

module.exports = router;
