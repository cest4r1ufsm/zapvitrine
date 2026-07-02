const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const clients = await prisma.client.findMany({
      where: { storeId: store.id },
      orderBy: { name: 'asc' },
    });

    // Attach last order and total count per client
    const enriched = await Promise.all(
      clients.map(async (c) => {
        const [lastOrder, totalOrders] = await Promise.all([
          prisma.order.findFirst({
            where: { storeId: store.id, customerPhone: c.phone },
            orderBy: { createdAt: 'desc' },
            include: { product: { select: { name: true } }, professional: { select: { name: true } } },
          }),
          prisma.order.count({ where: { storeId: store.id, customerPhone: c.phone } }),
        ]);
        return { ...c, lastOrder, totalOrders };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

router.get('/:phone/history', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const orders = await prisma.order.findMany({
      where: { storeId: store.id, customerPhone: req.params.phone },
      include: {
        product: { select: { name: true, price: true } },
        professional: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const client = await prisma.client.findUnique({
      where: { storeId_phone: { storeId: store.id, phone: req.params.phone } },
    });

    res.json({ client, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

module.exports = router;
