const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { sendMessageToCustomer } = require('../services/whatsapp');
const { withStoreLock } = require('../utils/bookingLock');
const { registrarCliente } = require('../utils/clients');
const {
  getAvailableSlots,
  assignAvailableProfessional,
  buildScheduledAt,
  formatDateBR,
  isValidHHMM,
  isValidDateStr,
} = require('../utils/availability');

const router = express.Router();

const MAX_AGENDA_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

// Campos que a Agenda consome (WeekGrid + card de detalhes)
const AGENDA_INCLUDE = {
  product: { select: { id: true, name: true, price: true, duration: true, bufferTime: true } },
  professional: { select: { id: true, name: true } },
};

// Converte para inteiro aceitando number ou string numérica; null se inválido
function toIntOrNull(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

// Get all orders for the store
router.get('/', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { status, page = 1 } = req.query;
    if (!/^\d+$/.test(String(page)) || !Number.isSafeInteger(Number(page)) || Number(page) < 1 || Number(page) > 100000) return res.status(400).json({ error: 'Página inválida' });
    if (status && !['all', 'pending', 'confirmed', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const take = 20;
    const skip = (Number(page) - 1) * take;

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

// Get orders for the agenda grid — GET /api/orders/agenda?start=AAAA-MM-DD&end=AAAA-MM-DD
// Retorna um ARRAY único com os pedidos agendados (scheduledAt) + os legados
// (sem scheduledAt, mas com scheduledTime) criados na janela. A UI separa os
// legados filtrando por `!scheduledAt && scheduledTime`.
router.get('/agenda', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { start, end } = req.query;
    if (!isValidDateStr(start) || !isValidDateStr(end)) {
      return res.status(400).json({ error: 'start e end são obrigatórios no formato AAAA-MM-DD' });
    }

    const rangeStart = new Date(`${start}T00:00:00.000Z`);
    const rangeEnd   = new Date(`${end}T23:59:59.999Z`);

    if (rangeEnd < rangeStart) {
      return res.status(400).json({ error: 'A data final deve ser igual ou posterior à data inicial' });
    }
    const totalDays = Math.round((rangeEnd - rangeStart) / DAY_MS) + 1;
    if (totalDays > MAX_AGENDA_DAYS) {
      return res.status(400).json({ error: `O período máximo de consulta é de ${MAX_AGENDA_DAYS} dias` });
    }

    // scheduledAt é gravado como "fake UTC" = horário local BRT;
    // createdAt é UTC real, então a janela dos legados é deslocada em +3h
    const legacyStart = new Date(rangeStart.getTime() + 3 * 60 * 60 * 1000);
    const legacyEnd   = new Date(rangeEnd.getTime() + 3 * 60 * 60 * 1000);

    const [scheduled, legacy] = await Promise.all([
      prisma.order.findMany({
        where: {
          storeId: store.id,
          scheduledAt: { gte: rangeStart, lte: rangeEnd },
        },
        include: AGENDA_INCLUDE,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          storeId: store.id,
          scheduledAt: null,
          scheduledTime: { not: null },
          createdAt: { gte: legacyStart, lte: legacyEnd },
        },
        include: AGENDA_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.json([...scheduled, ...legacy]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agenda' });
  }
});

// Create a manual appointment from the dashboard — POST /api/orders/manual
router.post('/manual', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const { customerName, customerPhone, productId, professionalId, date, time, notes, duration } = req.body || {};

    const name = typeof customerName === 'string' ? customerName.trim() : '';
    if (!name) return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
    if (name.length > 120) return res.status(400).json({ error: 'Nome do cliente é muito longo (máximo 120 caracteres)' });

    const phone = typeof customerPhone === 'string' ? customerPhone.trim() : '';
    if (!phone) return res.status(400).json({ error: 'Telefone do cliente é obrigatório' });
    if (phone.length > 30) return res.status(400).json({ error: 'Telefone do cliente é inválido' });

    const parsedProductId = toIntOrNull(productId);
    if (parsedProductId === null) return res.status(400).json({ error: 'Serviço é obrigatório' });

    let parsedProfessionalId = null;
    if (professionalId !== undefined && professionalId !== null && professionalId !== '') {
      parsedProfessionalId = toIntOrNull(professionalId);
      if (parsedProfessionalId === null) return res.status(400).json({ error: 'Profissional inválido' });
    }

    if (!isValidDateStr(date)) {
      return res.status(400).json({ error: 'Data inválida. Use o formato AAAA-MM-DD.' });
    }
    if (!isValidHHMM(time)) {
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM.' });
    }

    // Duração personalizada opcional para este atendimento
    let parsedDuration = null;
    if (duration !== undefined && duration !== null && duration !== '') {
      parsedDuration = toIntOrNull(duration);
      if (parsedDuration === null || parsedDuration < 1 || parsedDuration > 1440) {
        return res.status(400).json({ error: 'Duração inválida. Informe um número entre 1 e 1440 minutos.' });
      }
    }

    let parsedNotes = null;
    if (notes !== undefined && notes !== null && notes !== '') {
      if (typeof notes !== 'string') return res.status(400).json({ error: 'Observações devem ser um texto' });
      parsedNotes = notes.trim().slice(0, 500) || null;
    }

    // Posse: serviço e profissional precisam ser da loja do usuário
    const product = await prisma.product.findFirst({
      where: { id: parsedProductId, storeId: store.id },
    });
    if (!product) return res.status(404).json({ error: 'Serviço não encontrado' });

    if (parsedProfessionalId !== null) {
      const professional = await prisma.professional.findFirst({
        where: { id: parsedProfessionalId, storeId: store.id },
      });
      if (!professional) return res.status(404).json({ error: 'Profissional não encontrado' });
      // Agendar para um profissional desativado gera um compromisso que o motor
      // de disponibilidade não enxerga — 400 explícito em vez de um 409 confuso.
      if (!professional.active) {
        return res.status(400).json({ error: 'Este profissional está desativado. Reative-o ou escolha outro.' });
      }
    }

    // Revalidar e gravar precisam ser atômicos por loja: sem o lock, dois
    // pedidos simultâneos para o mesmo horário passam os dois pela checagem
    // antes de qualquer um gravar, e a loja fica com agendamento duplicado.
    const order = await withStoreLock(store.id, async () => {
      const currentProduct = await prisma.product.findFirst({ where: { id: product.id, storeId: store.id, active: true } });
      if (!currentProduct) return null;
      // A revalidação usa a MESMA duração que será reservada — senão um
      // atendimento estendido poderia ser aceito sobre um horário sem espaço
      const resource = await assignAvailableProfessional(prisma, store.id, date, product.id, parsedProfessionalId, time.trim(), parsedDuration);
      if (!resource) return null;

      return prisma.order.create({
        data: {
          storeId: store.id,
          productId: product.id,
          professionalId: resource.professionalId,
          customerName: name,
          customerPhone: phone,
          scheduledAt: buildScheduledAt(date, time.trim()),
          // scheduledTime legível mantido por compatibilidade com o fluxo antigo
          scheduledTime: `${formatDateBR(date)} ${time.trim()}`,
          // Só grava se realmente diferir do padrão do serviço
          durationOverride: (parsedDuration !== null && parsedDuration !== product.duration)
            ? parsedDuration
            : null,
          notes: parsedNotes,
          status: 'pending',
          totalPrice: currentProduct.price,
          priceCents: Math.round(currentProduct.price * 100),
          reservedDurationMinutes: parsedDuration ?? currentProduct.duration,
          reservedBufferMinutes: currentProduct.bufferTime || 0,
        },
        include: AGENDA_INCLUDE,
      });
    });

    if (!order) {
      return res.status(409).json({ error: 'Este horário não está disponível. Ele já foi ocupado ou bloqueado.' });
    }

    // Alimenta a tela "Clientes" (a lista é montada a partir da tabela Client)
    await registrarCliente(prisma, store.id, name, phone);

    res.status(201).json(order);
  } catch (error) {
    console.error(error);
    if (require('../utils/databaseErrors').isBookingConflict(error)) return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro horário.' });
    res.status(500).json({ error: 'Erro ao criar agendamento' });
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

    const updated = await withStoreLock(store.id, async () => {
      const current = await prisma.order.findUnique({ where: { id: order.id } });
      if (!current) return null;
      if (current.status === 'cancelled' && status !== 'cancelled' && current.scheduledAt) {
        const iso = current.scheduledAt.toISOString();
        const slots = await getAvailableSlots(prisma, store.id, iso.slice(0, 10), current.productId,
          current.professionalId, current.reservedDurationMinutes ?? current.durationOverride);
        if (!slots.includes(iso.slice(11, 16))) return null;
      }
      return prisma.order.update({ where: { id: order.id }, data: { status }, include: { product: true } });
    });
    if (!updated) return res.status(409).json({ error: 'Este horário não está mais disponível para reativar o agendamento.' });

    // A status change remains saved if notification fails; expose acceptance separately.
    let notification = { status: 'not_requested' };
    try {
      let msg = '';
      const statusLabel = { confirmed: 'confirmado', completed: 'concluído', cancelled: 'cancelado' }[status];
      if (status === 'confirmed') {
        msg = `✅ Olá, ${updated.customerName}! Seu pedido *#${updated.id}* de *${updated.product?.name || 'produto'}* foi *confirmado* pela loja.`;
      } else if (status === 'completed') {
        msg = `🎉 Olá, ${updated.customerName}! Seu pedido *#${updated.id}* de *${updated.product?.name || 'produto'}* foi *concluído*. Obrigado pela preferência!`;
      } else if (status === 'cancelled') {
        msg = `❌ Olá, ${updated.customerName}. Seu pedido *#${updated.id}* de *${updated.product?.name || 'produto'}* foi *cancelado* pela loja.`;
      }

      if (msg && updated.customerPhone) {
        if (store.officialPhoneId || store.botPhoneId && store.botToken) {
          const params = [updated.customerName, updated.id, updated.product?.name || 'produto', statusLabel];
          const result = await require('../services/officialWhatsApp').sendOrderUpdate(store, updated.customerPhone, msg, params);
          notification = { status: 'accepted', messageId: result.id };
        } else {
          const result = await sendMessageToCustomer(store.id, updated.customerPhone, msg);
          notification = result === false ? { status: 'failed' } : { status: 'accepted' };
        }
      }
    } catch (e) {
      notification = { status: 'failed', error: e.metaCode >= 132000 && e.metaCode <= 132016 ? e.message : 'Não foi possível enviar a notificação. O status do pedido foi salvo.' };
      console.error('Erro ao notificar cliente via WhatsApp:', e.message);
    }

    res.json({ ...updated, notification });
  } catch (error) {
    console.error(error);
    if (require('../utils/databaseErrors').isBookingConflict(error)) return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro horário.' });
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
