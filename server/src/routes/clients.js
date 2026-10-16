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

    // Two bounded-query roundtrips regardless of client count. Rank in the
    // database: never load every historical order or issue two queries/client.
    const latest = await prisma.$queryRaw`
      WITH ranked AS (
        SELECT o."id", o."storeId", o."productId", o."professionalId",
          o."customerName", o."customerPhone", o."customerAddress", o."scheduledTime", o."scheduledAt",
          o."durationOverride", o."reservedDurationMinutes", o."reservedBufferMinutes", o."priceCents",
          o."notes", o."status", o."totalPrice", o."createdAt",
          ROW_NUMBER() OVER (PARTITION BY o."customerPhone" ORDER BY o."createdAt" DESC, o."id" DESC) AS "rowNumber",
          COUNT(*) OVER (PARTITION BY o."customerPhone") AS "orderCount"
        FROM "Order" o WHERE o."storeId" = ${store.id}
      )
      SELECT r.*, p."name" AS "lastProductName", pr."name" AS "lastProfessionalName"
      FROM ranked r
      LEFT JOIN "Product" p ON p."id" = r."productId" AND p."storeId" = r."storeId"
      LEFT JOIN "Professional" pr ON pr."id" = r."professionalId" AND pr."storeId" = r."storeId"
      WHERE r."rowNumber" = 1
    `;
    const ordersByPhone = new Map(latest.map(row => {
      const { rowNumber, orderCount, lastProductName, lastProfessionalName, ...order } = row;
      return [order.customerPhone, {
        lastOrder: { ...order, product: lastProductName === null ? null : { name: lastProductName }, professional: lastProfessionalName === null ? null : { name: lastProfessionalName } },
        totalOrders: Number(orderCount),
      }];
    }));
    const enriched = clients.map(client => ({ ...client, ...(ordersByPhone.get(client.phone) || { lastOrder: null, totalOrders: 0 }) }));

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
