'use strict';

const express = require('express');
const {
  randomUUID,
  createHash
} = require('crypto');
const prisma = require('../../lib/prisma');
const {
  auth,
  adminOnly
} = require('../../middleware/auth');
const {
  withStoreLock
} = require('../../utils/bookingLock');
const {
  getAvailableSlots,
  buildScheduledAt,
  isValidDateStr,
  isValidHHMM,
  formatDateBR
} = require('../../utils/availability');
const D = require('./domain');
const {
  quota
} = require('./providers');
const router = express.Router();
const include = {
  order: {
    include: {
      product: {
        select: {
          name: true
        }
      }
    }
  },
  listing: {
    select: {
      publicId: true,
      name: true,
      storeId: true
    }
  },
  review: {
    select: {
      id: true,
      status: true
    }
  }
};
function view(b) {
  return {
    id: b.id,
    listingPublicId: b.listing.publicId,
    storeName: b.listing.name,
    productName: b.order.product?.name || 'Serviço',
    date: b.order.scheduledAt?.toISOString().slice(0, 10),
    time: b.order.scheduledAt?.toISOString().slice(11, 16),
    timeZone: b.timeZone,
    status: b.order.status,
    totalPrice: b.order.totalPrice,
    reviewed: !!b.review,
    reviewStatus: b.review?.status || null
  };
}
const wrap = fn => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    if (!e.status && (e.code === 'P2034' || e.code === '23P01' || e.meta?.code === '23P01' || String(e.message || '').includes('booking_no_overlap'))) {
      e.status = 409;
      e.message = 'Horário indisponível. Atualize a agenda.';
    }
    if (!e.status) console.error('directory consumer operation failed', e.code || e.name);
    res.status(e.status || 500).json({
      error: e.status ? e.message : 'Não foi possível concluir esta operação'
    });
  }
};
async function publicListing(publicId, db = prisma) {
  const row = await db.directoryListing.findFirst({
    where: {
      publicId,
      status: 'published',
      store: {
        active: true
      }
    },
    include: {
      store: {
        select: {
          userId: true
        }
      }
    }
  });
  if (!row) D.fail('Perfil não encontrado', 404);
  return row;
}
function appointmentInput(b) {
  const productId = D.num(b.productId, 1, 2147483647, 'Serviço');
  const professionalId = b.professionalId === null || b.professionalId === undefined || b.professionalId === '' ? null : D.num(b.professionalId, 1, 2147483647, 'Profissional');
  if (!Number.isInteger(productId) || professionalId !== null && !Number.isInteger(professionalId)) D.fail('Serviço ou profissional inválido');
  if (!isValidDateStr(b.date)) D.fail('Data inválida');
  const days = (Date.parse(b.date.trim() + 'T12:00:00Z') - Date.now()) / 86400000;
  if (days < -2 || days > 180) D.fail('Escolha uma data nos próximos 180 dias');
  return {
    productId,
    professionalId,
    date: b.date.trim()
  };
}
async function service(db, row, b) {
  if (!row.onlineBookingEnabled) D.fail('Este negócio recebe agendamentos pelo contato do perfil', 422);
  const p = await db.product.findFirst({
    where: {
      id: b.productId,
      storeId: row.storeId,
      active: true
    }
  });
  if (!p) D.fail('Serviço não encontrado', 404);
  if (b.professionalId !== null && !(await db.professional.findFirst({
    where: {
      id: b.professionalId,
      storeId: row.storeId,
      active: true
    }
  }))) D.fail('Profissional não encontrado', 404);
  return p;
}
function withinPublicHours(row, date, time, product) {
  const duration = (product.duration || 30) + (product.bufferTime || 0);
  if (duration < 1 || duration > 1440) return false;
  const start = buildScheduledAt(date, time).getTime();
  for (let minute = 0; minute < duration; minute++) {
    const d = new Date(start + minute * 60000).toISOString();
    if (!D.isOpenLocal(row, d.slice(0, 10), d.slice(11, 16))) return false;
  }
  return true;
}
async function transaction(storeId, fn) {
  return withStoreLock(storeId, () => /^postgres(ql)?:/.test(process.env.DATABASE_URL || '') ? fn(prisma) : prisma.$transaction(fn));
}
router.get('/me/favorites', auth, wrap(async (req, res) => {
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 10000, 'Página'));
  const rows = await prisma.directoryFavorite.findMany({
    where: {
      userId: req.user.id,
      listing: {
        status: 'published',
        store: {
          active: true
        }
      }
    },
    include: {
      listing: {
        include: {
          services: true,
          store: {
            select: D.publicStoreSelect
          }
        }
      }
    },
    take: 51,
    skip: offset,
    orderBy: {
      createdAt: 'desc'
    }
  });
  res.json({
    items: rows.slice(0, 50).map(r => D.project(r.listing)),
    hasMore: rows.length > 50
  });
}));
router.put('/me/favorites/:publicId', auth, wrap(async (req, res) => {
  const row = await publicListing(req.params.publicId);
  await quota(prisma, `favorite:${req.user.id}`, 100, 86400000);
  await prisma.directoryFavorite.upsert({
    where: {
      userId_listingId: {
        userId: req.user.id,
        listingId: row.id
      }
    },
    create: {
      userId: req.user.id,
      listingId: row.id
    },
    update: {}
  });
  res.json({
    saved: true
  });
}));
router.delete('/me/favorites/:publicId', auth, wrap(async (req, res) => {
  const row = await prisma.directoryListing.findUnique({
    where: {
      publicId: req.params.publicId
    },
    select: {
      id: true
    }
  });
  if (row) await prisma.directoryFavorite.deleteMany({
    where: {
      userId: req.user.id,
      listingId: row.id
    }
  });
  res.json({
    saved: false
  });
}));
router.get('/directory/listings/:publicId/availability', wrap(async (req, res) => {
  const row = await publicListing(req.params.publicId),
    b = appointmentInput(req.query);
  const product = await service(prisma, row, b);
  const slots = (await getAvailableSlots(prisma, row.storeId, b.date, b.productId, b.professionalId)).filter(time => withinPublicHours(row, b.date, time, product));
  const professionals = await prisma.professional.findMany({
    where: {
      storeId: row.storeId,
      active: true
    },
    select: {
      id: true,
      name: true
    },
    take: 100
  });
  res.json({
    slots,
    professionals,
    timeZone: row.timeZone
  });
}));
router.post('/directory/listings/:publicId/bookings', auth, wrap(async (req, res) => {
  if (!req.user.emailVerified) D.fail('Verifique seu e-mail para agendar', 403);
  const b = appointmentInput(req.body);
  if (!isValidHHMM(req.body.time)) D.fail('Horário inválido');
  const time = req.body.time.trim(),
    phone = D.text(req.body.customerPhone, 10, 20, 'Telefone').replace(/\D/g, '');
  if (!/^\d{10,13}$/.test(phone)) D.fail('Telefone inválido');
  const key = D.text(req.body.idempotencyKey, 16, 80, 'Identificador da reserva');
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) D.fail('Identificador da reserva inválido');
  const hash = createHash('sha256').update(JSON.stringify([req.params.publicId, b.productId, b.professionalId, b.date, time, phone])).digest('hex');
  const existing = await prisma.publicBooking.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: req.user.id,
        idempotencyKey: key
      }
    },
    include
  });
  if (existing) {
    if (existing.requestHash !== hash) D.fail('Identificador reutilizado com outra reserva', 409);
    return res.json({
      booking: view(existing)
    });
  }
  const row = await publicListing(req.params.publicId);
  if (row.store.userId === req.user.id) D.fail('Use a agenda do negócio para registrar seus próprios atendimentos', 403);
  await quota(prisma, `booking:${req.user.id}`, 20, 86400000);
  let booking;
  try {
    booking = await transaction(row.storeId, async db => {
      const repeated = await db.publicBooking.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: req.user.id,
            idempotencyKey: key
          }
        },
        include
      });
      if (repeated) {
        if (repeated.requestHash !== hash) D.fail('Identificador reutilizado', 409);
        return repeated;
      }
      const current = await publicListing(row.publicId, db),
        product = await service(db, current, b);
      const slots = await getAvailableSlots(db, current.storeId, b.date, product.id, b.professionalId);
      if (!slots.includes(time) || !withinPublicHours(current, b.date, time, product)) D.fail('Horário indisponível. Escolha outro horário.', 409);
      let assignedProfessional = b.professionalId;
      if (assignedProfessional === null) {
        const professionals = await db.professional.findMany({
          where: {
            storeId: current.storeId,
            active: true
          },
          select: {
            id: true
          },
          orderBy: {
            id: 'asc'
          }
        });
        for (const p of professionals) {
          if ((await getAvailableSlots(db, current.storeId, b.date, product.id, p.id)).includes(time)) {
            assignedProfessional = p.id;
            break;
          }
        }
        if (professionals.length && assignedProfessional === null) D.fail('Horário indisponível', 409);
      }
      const order = await db.order.create({
        data: {
          storeId: current.storeId,
          productId: product.id,
          professionalId: assignedProfessional,
          customerName: req.user.name,
          customerPhone: phone,
          scheduledAt: buildScheduledAt(b.date, time),
          scheduledTime: `${formatDateBR(b.date)} ${time}`,
          status: 'pending',
          totalPrice: product.price,
          priceCents: Math.round(product.price * 100),
          reservedDurationMinutes: product.duration,
          reservedBufferMinutes: product.bufferTime || 0
        }
      });
      await db.client.upsert({
        where: {
          storeId_phone: {
            storeId: current.storeId,
            phone
          }
        },
        create: {
          storeId: current.storeId,
          phone,
          name: req.user.name
        },
        update: {}
      });
      return db.publicBooking.create({
        data: {
          id: randomUUID(),
          userId: req.user.id,
          orderId: order.id,
          listingId: current.id,
          idempotencyKey: key,
          requestHash: hash,
          timeZone: current.timeZone
        },
        include
      });
    });
  } catch (e) {
    if (e.code === 'P2002') D.fail('Esta reserva já foi recebida. Atualize a lista.', 409);
    throw e;
  }
  res.status(201).json({
    booking: view(booking)
  });
}));
router.get('/me/bookings', auth, wrap(async (req, res) => {
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 10000, 'Página'));
  const rows = await prisma.publicBooking.findMany({
    where: {
      userId: req.user.id
    },
    include,
    take: 51,
    skip: offset,
    orderBy: {
      createdAt: 'desc'
    }
  });
  res.json({
    items: rows.slice(0, 50).map(view),
    hasMore: rows.length > 50
  });
}));
router.post('/me/bookings/:id/cancel', auth, wrap(async (req, res) => {
  const booking = await prisma.publicBooking.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include
  });
  if (!booking) D.fail('Reserva não encontrada', 404);
  await transaction(booking.listing.storeId, async db => {
    const changed = await db.order.updateMany({
      where: {
        id: booking.orderId,
        status: {
          in: ['pending', 'confirmed']
        }
      },
      data: {
        status: 'cancelled'
      }
    });
    if (!changed.count) {
      const current = await db.order.findUnique({
        where: {
          id: booking.orderId
        }
      });
      if (current?.status !== 'cancelled') D.fail('Este atendimento não pode ser cancelado', 409);
    }
  });
  res.json({
    booking: view(await prisma.publicBooking.findUnique({
      where: {
        id: booking.id
      },
      include
    }))
  });
}));
router.post('/me/bookings/:id/review', auth, wrap(async (req, res) => {
  const rating = D.num(req.body.rating, 1, 5, 'Nota');
  if (!Number.isInteger(rating)) D.fail('Nota inválida');
  const text = D.text(req.body.text, 10, 1500, 'Avaliação');
  const booking = await prisma.publicBooking.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id,
      order: {
        status: 'completed'
      }
    },
    include: {
      listing: {
        include: {
          store: {
            select: {
              userId: true
            }
          }
        }
      }
    }
  });
  if (!booking || booking.listing.store.userId === req.user.id) D.fail('Avaliações exigem um atendimento seu concluído', 403);
  try {
    await prisma.directoryReview.create({
      data: {
        id: randomUUID(),
        bookingId: booking.id,
        listingId: booking.listingId,
        rating,
        text
      }
    });
  } catch (e) {
    if (e.code === 'P2002') D.fail('Este atendimento já foi avaliado', 409);
    throw e;
  }
  res.status(201).json({
    status: 'pending'
  });
}));
router.get('/directory/listings/:publicId/reviews', wrap(async (req, res) => {
  const listing = await publicListing(req.params.publicId),
    offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 10000, 'Página'));
  const rows = await prisma.directoryReview.findMany({
    where: {
      listingId: listing.id,
      status: 'published'
    },
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      response: true,
      responseStatus: true
    },
    take: 21,
    skip: offset,
    orderBy: {
      createdAt: 'desc'
    }
  });
  const stats = await prisma.directoryReview.aggregate({
    where: {
      listingId: listing.id,
      status: 'published'
    },
    _avg: {
      rating: true
    },
    _count: {
      rating: true
    }
  });
  res.json({
    items: rows.slice(0, 20).map(({
      responseStatus,
      ...r
    }) => ({
      ...r,
      response: responseStatus === 'published' ? r.response : null
    })),
    hasMore: rows.length > 20,
    average: stats._avg.rating,
    count: stats._count.rating
  });
}));
router.get('/admin/directory/reviews', auth, adminOnly, wrap(async (req, res) => {
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 10000, 'Página'));
  const rows = await prisma.directoryReview.findMany({
    where: {
      OR: [{
        status: 'pending'
      }, {
        responseStatus: 'pending'
      }]
    },
    select: {
      id: true,
      rating: true,
      text: true,
      status: true,
      response: true,
      responseStatus: true,
      createdAt: true,
      listing: {
        select: {
          publicId: true,
          name: true
        }
      }
    },
    take: 101,
    skip: offset,
    orderBy: {
      createdAt: 'asc'
    }
  });
  res.json({
    items: rows.slice(0, 100),
    hasMore: rows.length > 100
  });
}));
router.post('/admin/directory/reviews/:id/moderate', auth, adminOnly, wrap(async (req, res) => {
  const action = req.body.action;
  if (!['publish', 'reject', 'publish-response', 'reject-response'].includes(action)) D.fail('Ação inválida');
  const reason = D.text(req.body.reason ?? '', action.startsWith('reject') ? 5 : 0, 1000, 'Motivo');
  await prisma.$transaction(async tx => {
    const row = await tx.directoryReview.findUnique({
      where: {
        id: req.params.id
      }
    });
    if (!row) D.fail('Avaliação não encontrada', 404);
    const response = action.endsWith('response'),
      field = response ? 'responseStatus' : 'status';
    const changed = await tx.directoryReview.updateMany({
      where: {
        id: row.id,
        [field]: 'pending'
      },
      data: {
        [field]: action.startsWith('publish') ? 'published' : 'rejected',
        moderationReason: reason || null
      }
    });
    if (!changed.count) D.fail('Avaliação já analisada', 409);
    await tx.directoryAudit.create({
      data: {
        id: randomUUID(),
        listingId: row.listingId,
        actorId: req.user.id,
        action: `review-${action}`,
        reason
      }
    });
  });
  res.json({
    moderated: true
  });
}));
router.get('/me/reviews', auth, wrap(async (req, res) => {
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 10000, 'Página'));
  const rows = await prisma.directoryReview.findMany({
    where: {
      status: 'published',
      listing: {
        store: {
          userId: req.user.id
        }
      }
    },
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      response: true,
      responseStatus: true
    },
    take: 51,
    skip: offset,
    orderBy: {
      createdAt: 'desc'
    }
  });
  res.json({
    items: rows.slice(0, 50),
    hasMore: rows.length > 50
  });
}));
router.post('/me/reviews/:id/respond', auth, wrap(async (req, res) => {
  const response = D.text(req.body.response, 5, 1500, 'Resposta');
  const row = await prisma.directoryReview.findFirst({
    where: {
      id: req.params.id,
      status: 'published',
      listing: {
        store: {
          userId: req.user.id
        }
      }
    }
  });
  if (!row) D.fail('Avaliação não encontrada', 404);
  await prisma.directoryReview.update({
    where: {
      id: row.id
    },
    data: {
      response,
      responseStatus: 'pending'
    }
  });
  res.json({
    status: 'pending'
  });
}));
router.get('/me/favorites/:publicId', auth, wrap(async (req, res) => {
  const listing = await prisma.directoryListing.findUnique({ where: { publicId: req.params.publicId }, select: { id: true } });
  const favorite = listing ? await prisma.directoryFavorite.findUnique({ where: { userId_listingId: { userId: req.user.id, listingId: listing.id } }, select: { userId: true } }) : null;
  res.json({ saved: !!favorite });
}));
module.exports = router;

