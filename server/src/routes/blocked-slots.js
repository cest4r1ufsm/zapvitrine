const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { isValidHHMM, isValidDateStr, timeToMinutes, DAYS } = require('../utils/availability');

const router = express.Router();

const MAX_REASON_LENGTH = 200;

// Converte para inteiro aceitando number ou string numérica; null se inválido
function toIntOrNull(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

// Monta e valida os dados do bloqueio.
// `current` = registro existente (PATCH) para preencher os campos não enviados.
// Retorna { status, error } em caso de falha ou { data } em caso de sucesso.
async function buildBlockData(body, storeId, current = null) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);

  const isFullDay   = !!pick('isFullDay',   current ? current.isFullDay   : false);
  const isRecurring = !!pick('isRecurring', current ? current.isRecurring : false);
  const rawDate     = pick('date', current ? current.date : undefined);

  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return { status: 400, error: 'Data é obrigatória' };
  }
  if (typeof rawDate !== 'string') {
    return { status: 400, error: 'Data inválida' };
  }
  const date = rawDate.trim();

  if (isRecurring) {
    if (!DAYS.includes(date)) {
      return { status: 400, error: 'Para bloqueio recorrente, informe um dia da semana válido (sunday, monday, tuesday, wednesday, thursday, friday ou saturday)' };
    }
  } else if (!isValidDateStr(date)) {
    return { status: 400, error: 'Data inválida. Use o formato AAAA-MM-DD.' };
  }

  // Horários
  let startTime = null;
  let endTime   = null;

  if (!isFullDay) {
    const rawStart = pick('startTime', current ? current.startTime : undefined);
    const rawEnd   = pick('endTime',   current ? current.endTime   : undefined);

    if (rawStart === undefined || rawStart === null || rawStart === '' ||
        rawEnd   === undefined || rawEnd   === null || rawEnd   === '') {
      return { status: 400, error: 'Horário de início e término são obrigatórios quando o bloqueio não é de dia inteiro' };
    }
    if (!isValidHHMM(rawStart)) {
      return { status: 400, error: 'Horário de início inválido. Use o formato HH:MM.' };
    }
    if (!isValidHHMM(rawEnd)) {
      return { status: 400, error: 'Horário de término inválido. Use o formato HH:MM.' };
    }

    startTime = rawStart.trim();
    endTime   = rawEnd.trim();

    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      return { status: 400, error: 'Horário de início deve ser anterior ao de término' };
    }
  }

  // Profissional (null = bloqueio global, vale para toda a loja)
  let professionalId = null;
  const rawProfessional = pick('professionalId', current ? current.professionalId : null);

  if (rawProfessional !== undefined && rawProfessional !== null && rawProfessional !== '') {
    professionalId = toIntOrNull(rawProfessional);
    if (professionalId === null) {
      return { status: 400, error: 'Profissional inválido' };
    }
    const professional = await prisma.professional.findFirst({
      where: { id: professionalId, storeId },
    });
    if (!professional) {
      return { status: 404, error: 'Profissional não encontrado' };
    }
  }

  // Motivo
  let reason = null;
  const rawReason = pick('reason', current ? current.reason : null);
  if (rawReason !== undefined && rawReason !== null && rawReason !== '') {
    if (typeof rawReason !== 'string') {
      return { status: 400, error: 'Motivo deve ser um texto' };
    }
    reason = rawReason.trim().slice(0, MAX_REASON_LENGTH) || null;
  }

  const data = { professionalId, date, startTime, endTime, isFullDay, isRecurring, reason };

  // Bloqueio duplicado exato
  const duplicate = await prisma.blockedSlot.findFirst({
    where: {
      storeId,
      professionalId,
      date,
      startTime,
      endTime,
      isFullDay,
      isRecurring,
      ...(current ? { id: { not: current.id } } : {}),
    },
  });
  if (duplicate) {
    return { status: 409, error: 'Já existe um bloqueio idêntico cadastrado' };
  }

  return { data };
}

router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { professionalId } = req.query;
    const where = { storeId: store.id };

    if (professionalId !== undefined && professionalId !== '') {
      const parsed = toIntOrNull(professionalId);
      if (parsed === null) return res.status(400).json({ error: 'Profissional inválido' });
      // Bloqueios globais (professionalId null) também se aplicam ao profissional
      where.OR = [{ professionalId: parsed }, { professionalId: null }];
    }

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

    const result = await buildBlockData(req.body || {}, store.id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const slot = await prisma.blockedSlot.create({
      data: { storeId: store.id, ...result.data },
      include: { professional: { select: { id: true, name: true } } },
    });
    res.status(201).json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar bloqueio' });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const id = toIntOrNull(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Bloqueio inválido' });

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const existing = await prisma.blockedSlot.findFirst({
      where: { id, storeId: store.id },
    });
    if (!existing) return res.status(404).json({ error: 'Bloqueio não encontrado' });

    const result = await buildBlockData(req.body || {}, store.id, existing);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const slot = await prisma.blockedSlot.update({
      where: { id: existing.id },
      data: result.data,
      include: { professional: { select: { id: true, name: true } } },
    });
    res.json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar bloqueio' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const id = toIntOrNull(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Bloqueio inválido' });

    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const existing = await prisma.blockedSlot.findFirst({
      where: { id, storeId: store.id },
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
