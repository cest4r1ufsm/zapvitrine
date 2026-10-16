'use strict';

const express = require('express');
const {
  randomUUID
} = require('crypto');
const prisma = require('../lib/prisma');
const {
  auth,
  adminOnly
} = require('../middleware/auth');
const D = require('../modules/directory/domain');
const {
  search,
  clusters
} = require('../modules/directory/search');
const {
  geocode,
  quota
} = require('../modules/directory/providers');
const router = express.Router();
const wrap = fn => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    if (!e.status) console.error('directory request failed', e.code || e.name);
    res.status(e.status || 500).json({
      error: e.status ? e.message : 'Não foi possível concluir esta operação'
    });
  }
};
const owned = async userId => {
  const store = await prisma.store.findUnique({
    where: {
      userId
    },
    select: {
      id: true,
      slug: true,
      active: true
    }
  });
  if (!store) D.fail('Cadastre seu negócio primeiro', 404);
  return store;
};
const ownerStoreSelect = {
  ...D.publicStoreSelect,
  products: {
    ...D.publicStoreSelect.products,
    take: 1000
  }
};
const listing = storeId => prisma.directoryListing.findUnique({
  where: {
    storeId
  },
  include: {
    services: true,
    store: {
      select: ownerStoreSelect
    }
  }
});
router.get('/directory/services', (req, res) => res.json({
  items: D.SERVICES
}));
router.get('/directory/municipalities', wrap(async (req, res) => {
  const q = D.normalize(D.text(req.query.q ?? '', 0, 80, 'Busca'));
  const uf = req.query.uf;
  if (uf && !D.UF_ZONES[uf]) D.fail('UF inválida');
  const items = await prisma.directoryMunicipality.findMany({
    where: {
      ...(uf ? {
        uf
      } : {}),
      ...(q ? {
        searchName: {
          startsWith: q
        }
      } : {})
    },
    select: {
      code: true,
      name: true,
      uf: true,
      timeZone: true
    },
    take: 50,
    orderBy: {
      name: 'asc'
    }
  });
  res.json({
    items
  });
}));
router.get(['/directory', '/directory/search'], wrap(async (req, res) => res.json(await search(prisma, req.query))));
router.get('/directory/clusters', wrap(async (req, res) => res.json(await clusters(prisma, req.query))));
router.get('/directory/listings/:publicId', wrap(async (req, res) => {
  const row = await prisma.directoryListing.findFirst({
    where: {
      publicId: req.params.publicId,
      status: 'published',
      store: {
        active: true
      }
    },
    include: {
      services: true,
      store: {
        select: D.publicStoreSelect
      }
    }
  });
  if (!row) D.fail('Perfil não encontrado', 404);
  res.json(D.project(row));
}));
router.get('/me/listing', auth, wrap(async (req, res) => res.json({
  listing: D.owner(await listing((await owned(req.user.id)).id))
})));
router.put('/me/listing', auth, wrap(async (req, res) => {
  const store = await owned(req.user.id),
    b = req.body,
    v = D.version(b.version);
  const name = D.text(b.name, 2, 120, 'Nome'),
    description = D.text(b.description ?? '', 0, 1500, 'Descrição'),
    phone = D.text(b.phone, 10, 20, 'Telefone').replace(/\D/g, '');
  if (!/^\d{10,13}$/.test(phone)) D.fail('Telefone inválido');
  const address = D.text(b.address, 5, 250, 'Endereço'),
    neighborhood = D.text(b.neighborhood ?? '', 0, 100, 'Bairro');
  const municipality = await prisma.directoryMunicipality.findUnique({
    where: {
      code: D.text(b.municipalityCode, 7, 7, 'Município')
    }
  });
  if (!municipality) D.fail('Selecione um município válido');
  const latitude = D.num(b.latitude, -34, 6, 'Latitude'),
    longitude = D.num(b.longitude, -74, -28, 'Longitude');
  if (!['exact', 'approximate'].includes(b.locationPrecision)) D.fail('Precisão inválida');
  const timeZone = b.timeZone || municipality.timeZone;
  if (!Object.values(D.UF_ZONES).includes(timeZone) && !['America/Eirunepe', 'America/Santarem', 'America/Noronha'].includes(timeZone)) D.fail('Fuso horário inválido');
  if (!Array.isArray(b.services) || !b.services.length || b.services.length > 16 || b.services.some(s => !D.SERVICES.some(x => x.slug === s))) D.fail('Selecione serviços válidos');
  const productServices = b.productServices ?? [];
  if (!Array.isArray(productServices) || productServices.length > 1000) D.fail('Mapeamento de serviços inválido');
  if (new Set(productServices.map(p => p?.productId)).size !== productServices.length) D.fail('Produto duplicado');
  for (const mapping of productServices) {
    if (!Number.isInteger(mapping?.productId) || !Array.isArray(mapping.services) || mapping.services.length > 16 || mapping.services.some(slug => !D.SERVICES.some(s => s.slug === slug))) D.fail('Mapeamento de serviços inválido');
  }
  const services = [...new Set(b.services)],
    loc = D.publicLocation(latitude, longitude, b.locationPrecision);
  const data = {
    onlineBookingEnabled: b.onlineBookingEnabled === true,
    name,
    description,
    phone,
    address,
    neighborhood,
    municipalityCode: municipality.code,
    city: municipality.name,
    uf: municipality.uf,
    latitude,
    longitude,
    publicLatitude: loc.lat,
    publicLongitude: loc.lng,
    locationPrecision: b.locationPrecision,
    timeZone,
    hoursJson: JSON.stringify(D.hours(b.hours || {})),
    holidayHoursJson: JSON.stringify(D.holidayHours(b.holidayHours || {})),
    coordinatesConfirmedAt: b.coordinatesConfirmed === true ? new Date() : null,
    storeSlug: store.slug,
    consentAt: b.consent === true ? new Date() : null,
    status: 'draft',
    moderationReason: null
  };
  try {
    await prisma.$transaction(async tx => {
      if (/^postgres(ql)?:/.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT pg_advisory_xact_lock(713901, ${store.id}::integer)::text`;
      const ownedProducts = await tx.product.findMany({
        where: {
          id: {
            in: productServices.map(p => p.productId)
          },
          storeId: store.id
        },
        select: {
          id: true
        }
      });
      if (ownedProducts.length !== productServices.length) D.fail('Serviço não pertence ao seu negócio', 403);
      const current = await tx.directoryListing.findUnique({
        where: {
          storeId: store.id
        }
      });
      if ((current?.timeZone || 'America/Sao_Paulo') !== timeZone && (await tx.order.count({
        where: {
          storeId: store.id,
          status: {
            not: 'cancelled'
          },
          scheduledAt: {
            not: null
          }
        }
      }))) D.fail('O fuso não pode ser alterado enquanto existem agendamentos. Contate o suporte para migrar a agenda.', 409);
      if (current?.status === 'suspended') D.fail('Perfil suspenso. Entre em contato com o suporte.', 403);
      let id;
      if (!current) {
        if (v !== 0) D.fail('Perfil alterado. Atualize a página.', 409);
        const created = await tx.directoryListing.create({
          data: {
            ...data,
            storeId: store.id,
            publicId: randomUUID()
          }
        });
        id = created.id;
      } else {
        const changed = await tx.directoryListing.updateMany({
          where: {
            id: current.id,
            version: v
          },
          data: {
            ...data,
            version: {
              increment: 1
            }
          }
        });
        if (!changed.count) D.fail('Perfil alterado. Atualize a página.', 409);
        id = current.id;
        await tx.directoryListingService.deleteMany({
          where: {
            listingId: id
          }
        });
      }
      for (const mapping of productServices) {
        await tx.productServiceTag.deleteMany({
          where: {
            productId: mapping.productId
          }
        });
        for (const slug of new Set(mapping.services)) {
          await tx.serviceTag.upsert({
            where: {
              slug
            },
            create: D.SERVICES.find(t => t.slug === slug),
            update: {
              name: D.SERVICES.find(t => t.slug === slug).name
            }
          });
          await tx.productServiceTag.create({
            data: {
              productId: mapping.productId,
              slug
            }
          });
        }
      }
      for (const slug of services) await tx.directoryListingService.create({
        data: {
          listingId: id,
          slug
        }
      });
      await tx.directoryAudit.create({
        data: {
          id: randomUUID(),
          listingId: id,
          actorId: req.user.id,
          action: 'edit'
        }
      });
    });
  } catch (e) {
    if (e.code === 'P2002') D.fail('Perfil alterado. Atualize a página.', 409);
    throw e;
  }
  res.json({
    listing: D.owner(await listing(store.id))
  });
}));
for (const action of ['submit', 'unpublish']) router.post(`/me/listing/${action}`, auth, wrap(async (req, res) => {
  const store = await owned(req.user.id),
    v = D.version(req.body.version),
    current = await listing(store.id);
  if (!current) D.fail('Perfil não encontrado', 404);
  if (current.status === 'suspended') D.fail('Perfil suspenso. Entre em contato com o suporte.', 403);
  if (action === 'submit' && (!req.user.emailVerified || !current.consentAt || !current.coordinatesConfirmedAt || !store.active || !current.services.length)) D.fail('Verifique seu e-mail e confirme a localização e autorize a publicação do perfil completo', 422);
  if (action === 'submit' && !['draft', 'rejected'].includes(current.status)) D.fail('Perfil já enviado para análise', 409);
  await prisma.$transaction(async tx => {
    const changed = await tx.directoryListing.updateMany({
      where: {
        id: current.id,
        version: v,
        status: current.status
      },
      data: {
        status: action === 'submit' ? 'pending' : 'draft',
        version: {
          increment: 1
        }
      }
    });
    if (!changed.count) D.fail('Perfil alterado. Atualize a página.', 409);
    await tx.directoryAudit.create({
      data: {
        id: randomUUID(),
        listingId: current.id,
        actorId: req.user.id,
        action
      }
    });
  });
  res.json({
    listing: D.owner(await listing(store.id))
  });
}));
router.post('/me/location/resolve', auth, wrap(async (req, res) => {
  if (!req.user.emailVerified) D.fail('Verifique seu e-mail antes de localizar o endereço', 403);
  await owned(req.user.id);
  const municipality = await prisma.directoryMunicipality.findUnique({
    where: {
      code: D.text(req.body.municipalityCode, 7, 7, 'Município')
    }
  });
  if (!municipality) D.fail('Município inválido');
  res.json(await geocode(prisma, req.user.id, D.text(req.body.address, 5, 250, 'Endereço'), municipality));
}));
router.post('/directory/listings/:publicId/reports', auth, wrap(async (req, res) => {
  const reason = D.text(req.body.reason, 10, 1000, 'Motivo');
  const row = await prisma.directoryListing.findFirst({
    where: {
      publicId: req.params.publicId,
      status: 'published'
    }
  });
  if (!row) D.fail('Perfil não encontrado', 404);
  await quota(prisma, `report:${req.user.id}`, 10, 86400000);
  await prisma.directoryReport.upsert({
    where: {
      listingId_userId: {
        listingId: row.id,
        userId: req.user.id
      }
    },
    create: {
      id: randomUUID(),
      listingId: row.id,
      userId: req.user.id,
      reason
    },
    update: {
      reason,
      status: 'open'
    }
  });
  res.status(202).json({
    received: true
  });
}));
router.get('/admin/directory', auth, adminOnly, wrap(async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'published', 'rejected', 'suspended', 'draft'].includes(status)) D.fail('Estado inválido');
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 100000, 'Página'));
  const rows = await prisma.directoryListing.findMany({
    where: {
      status
    },
    include: {
      services: true,
      store: {
        select: D.publicStoreSelect
      }
    },
    take: 101,
    skip: offset,
    orderBy: [{
      updatedAt: 'asc'
    }, {
      id: 'asc'
    }]
  });
  res.json({
    items: rows.slice(0, 100).map(D.owner),
    hasMore: rows.length > 100
  });
}));
router.get('/admin/directory/reports', auth, adminOnly, wrap(async (req, res) => {
  const offset = Math.trunc(D.num(req.query.offset ?? 0, 0, 100000, 'Página'));
  const rows = await prisma.directoryReport.findMany({
    where: {
      status: 'open'
    },
    include: {
      listing: {
        select: {
          publicId: true,
          name: true
        }
      }
    },
    take: 101,
    skip: offset,
    orderBy: [{
      createdAt: 'asc'
    }, {
      id: 'asc'
    }]
  });
  res.json({
    items: rows.slice(0, 100),
    hasMore: rows.length > 100
  });
}));
router.get('/admin/directory/listings/:publicId', auth, adminOnly, wrap(async (req, res) => {
  const row = await prisma.directoryListing.findUnique({
    where: {
      publicId: req.params.publicId
    },
    include: {
      services: true,
      store: {
        select: ownerStoreSelect
      }
    }
  });
  if (!row) D.fail('Perfil não encontrado', 404);
  res.json({
    listing: D.owner(row)
  });
}));
router.post('/admin/directory/reports/:id/resolve', auth, adminOnly, wrap(async (req, res) => {
  const reason = D.text(req.body.reason, 5, 1000, 'Motivo');
  await prisma.$transaction(async tx => {
    const report = await tx.directoryReport.findUnique({
      where: {
        id: req.params.id
      }
    });
    if (!report) D.fail('Denúncia não encontrada', 404);
    const changed = await tx.directoryReport.updateMany({
      where: {
        id: report.id,
        status: 'open'
      },
      data: {
        status: 'reviewed'
      }
    });
    if (!changed.count) D.fail('Denúncia já analisada', 409);
    await tx.directoryAudit.create({
      data: {
        id: randomUUID(),
        listingId: report.listingId,
        actorId: req.user.id,
        action: 'report-resolved',
        reason
      }
    });
  });
  res.json({
    resolved: true
  });
}));
router.post('/admin/directory/:publicId/moderate', auth, adminOnly, wrap(async (req, res) => {
  const {
      action
    } = req.body,
    v = D.version(req.body.version);
  if (!['publish', 'reject', 'suspend'].includes(action)) D.fail('Ação inválida');
  const reason = D.text(req.body.reason ?? '', action === 'publish' ? 0 : 5, 1000, 'Motivo');
  const row = await prisma.directoryListing.findUnique({
    where: {
      publicId: req.params.publicId
    },
    include: {
      store: {
        include: {
          user: {
            select: {
              emailVerified: true
            }
          }
        }
      }
    }
  });
  if (!row) D.fail('Perfil não encontrado', 404);
  if (action === 'publish' && (!['pending', 'suspended'].includes(row.status) || !row.consentAt || !row.coordinatesConfirmedAt || !row.store.active || !row.store.user.emailVerified)) D.fail('Perfil não está apto para publicação', 422);
  await prisma.$transaction(async tx => {
    const changed = await tx.directoryListing.updateMany({
      where: {
        id: row.id,
        version: v
      },
      data: {
        status: {
          publish: 'published',
          reject: 'rejected',
          suspend: 'suspended'
        }[action],
        moderationReason: reason || null,
        version: {
          increment: 1
        }
      }
    });
    if (!changed.count) D.fail('Perfil alterado. Atualize a página.', 409);
    await tx.directoryAudit.create({
      data: {
        id: randomUUID(),
        listingId: row.id,
        actorId: req.user.id,
        action,
        reason
      }
    });
    await tx.directoryReport.updateMany({
      where: {
        listingId: row.id,
        status: 'open'
      },
      data: {
        status: 'reviewed'
      }
    });
  });
  res.json({
    listing: D.owner(await listing(row.storeId))
  });
}));
router.use(require('../modules/directory/consumer'));
module.exports = router;
