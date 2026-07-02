const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { professionalId } = req.query;
    const where = { storeId: store.id };
    if (professionalId) where.professionalId = parseInt(professionalId);

    const slots = await prisma.blockedSlot.findMany({
      where,
      include: { professional: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    res.json(slots);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar bloqueios' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { professionalId, date, startTime, endTime, isFullDay, isRecurring, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Data é obrigatória' });

    const slot = await prisma.blockedSlot.create({
      data: {
        storeId: store.id,
        professionalId: professionalId ? parseInt(professionalId) : null,
        date,
        startTime: isFullDay ? null : startTime,
        endTime: isFullDay ? null : endTime,
        isFullDay: !!isFullDay,
        isRecurring: !!isRecurring,
        reason: reason || null,
      },
      include: { professional: { select: { id: true, name: true } } },
    });
    res.status(201).json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar bloqueio' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const existing = await prisma.blockedSlot.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!existing) return res.status(404).json({ error: 'Bloqueio não encontrado' });

    await prisma.blockedSlot.delete({ where: { id: existing.id } });
    res.json({ message: 'Bloqueio removido' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar bloqueio' });
  }
});

module.exports = router;
