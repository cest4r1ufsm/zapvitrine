const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { getAvailableSlots, getAvailableDates } = require('../utils/availability');

const router = express.Router();

// GET /api/availability/slots?date=YYYY-MM-DD&serviceId=1&professionalId=2
router.get('/slots', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { date, serviceId, professionalId, duration } = req.query;
    if (!date || !serviceId) {
      return res.status(400).json({ error: 'date e serviceId são obrigatórios' });
    }

    // Duração personalizada opcional: o painel permite ao profissional reservar
    // mais tempo que o padrão do serviço para um atendimento específico.
    let durationOverride = null;
    if (duration !== undefined && duration !== '') {
      const minutos = parseInt(duration, 10);
      if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) {
        return res.status(400).json({ error: 'Duração inválida. Informe um número entre 1 e 1440 minutos.' });
      }
      durationOverride = minutos;
    }

    const slots = await getAvailableSlots(
      prisma,
      store.id,
      date,
      parseInt(serviceId),
      professionalId ? parseInt(professionalId) : null,
      durationOverride
    );

    res.json({ date, slots });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar horários' });
  }
});

// GET /api/availability/dates?serviceId=1&professionalId=2&days=7
router.get('/dates', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { serviceId, professionalId, days } = req.query;
    if (!serviceId) return res.status(400).json({ error: 'serviceId é obrigatório' });

    const result = await getAvailableDates(
      prisma,
      store.id,
      parseInt(serviceId),
      professionalId ? parseInt(professionalId) : null,
      days ? parseInt(days) : 7
    );

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar datas' });
  }
});

module.exports = router;
