const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const professionals = await prisma.professional.findMany({
      where: { storeId: store.id },
      orderBy: { name: 'asc' },
    });
    res.json(professionals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar profissionais' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const professional = await prisma.professional.create({
      data: { storeId: store.id, name: name.trim() },
    });
    res.status(201).json(professional);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar profissional' });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const existing = await prisma.professional.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado' });

    const { name, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (active !== undefined) data.active = active;

    const professional = await prisma.professional.update({
      where: { id: existing.id },
      data,
    });
    res.json(professional);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar profissional' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const existing = await prisma.professional.findFirst({
      where: { id: parseInt(req.params.id), storeId: store.id },
    });
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado' });

    await prisma.professional.delete({ where: { id: existing.id } });
    res.json({ message: 'Profissional removido' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar profissional' });
  }
});

module.exports = router;
