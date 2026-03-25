const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get all orders for the store
router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { status, page = 1 } = req.query;
    const take = 20;
    const skip = (parseInt(page) - 1) * take;

    const where = { storeId: store.id };
    if (status && status !== 'all') where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { product: { select: { name: true, price: true, imageUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, pages: Math.ceil(total / take) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// Get order stats
router.get('/stats', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const [pending, confirmed, completed, cancelled, total] = await Promise.all([
      prisma.order.count({ where: { storeId: store.id, status: 'pending' } }),
      prisma.order.count({ where: { storeId: store.id, status: 'confirmed' } }),
      prisma.order.count({ where: { storeId: store.id, status: 'completed' } }),
      prisma.order.count({ where: { storeId: store.id, status: 'cancelled' } }),
      prisma.order.count({ where: { storeId: store.id } }),
    ]);

    res.json({ pending, confirmed, completed, cancelled, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Update order status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const order = await prisma.order.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status },
      include: { product: true },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});

// Delete order
router.delete('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const order = await prisma.order.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    await prisma.order.delete({ where: { id: order.id } });
    res.json({ message: 'Pedido removido' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar pedido' });
  }
});

module.exports = router;
