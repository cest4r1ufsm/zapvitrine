'use strict';

const {
  Prisma
} = require('@prisma/client');
const {
  num,
  fail,
  distanceKm,
  project,
  publicStoreSelect,
  isOpen
} = require('./domain');
const postgres = () => /^postgres(ql)?:/.test(process.env.DATABASE_URL || '');
function searchParams(q) {
  if (q.municipalityCode !== undefined && (typeof q.municipalityCode !== 'string' || !/^\d{7}$/.test(q.municipalityCode))) fail('Município inválido');
  if (q.service !== undefined && (typeof q.service !== 'string' || q.service.length > 80)) fail('Serviço inválido');
  if (q.openNow !== undefined && !['true', 'false'].includes(q.openNow)) fail('Filtro de horário inválido');
  const limit = Math.trunc(num(q.limit ?? 20, 1, 50, 'Limite')),
    offset = Math.trunc(num(q.offset ?? 0, 0, 1000, 'Página'));
  const hasLocation = q.lat !== undefined || q.lng !== undefined;
  const lat = hasLocation ? num(q.lat, -90, 90, 'Latitude') : null,
    lng = hasLocation ? num(q.lng, -180, 180, 'Longitude') : null;
  if (!hasLocation && !/^\d{7}$/.test(q.municipalityCode || '')) fail('Informe sua localização ou selecione um município');
  const radius = num(q.radiusKm ?? 10, 1, 100, 'Raio');
  const minPrice = q.minPrice === undefined ? null : num(q.minPrice, 0, 100000, 'Preço mínimo');
  const maxPrice = q.maxPrice === undefined ? null : num(q.maxPrice, 0, 100000, 'Preço máximo');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) fail('Faixa de preço inválida');
  return {
    limit,
    offset,
    lat,
    lng,
    radius,
    minPrice,
    maxPrice
  };
}
function sqlFilters(q, p) {
  const clauses = [Prisma.sql`l.status = 'published'`, Prisma.sql`EXISTS (SELECT 1 FROM "Store" s WHERE s.id=l."storeId" AND s.active=true)`];
  if (q.openNow === 'true') clauses.push(Prisma.sql`agt_directory_is_open(l."hoursJson"::jsonb,l."holidayHoursJson"::jsonb,l."timeZone",CURRENT_TIMESTAMP)`);
  if (q.municipalityCode) clauses.push(Prisma.sql`l."municipalityCode"=${q.municipalityCode}`);
  if (q.service) clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM "DirectoryListingService" ds WHERE ds."listingId"=l.id AND ds.slug=${q.service})`);
  if (p.minPrice !== null || p.maxPrice !== null) clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM "Product" prod WHERE prod."storeId"=l."storeId" AND prod.active=true AND ${q.service ? Prisma.sql`EXISTS(SELECT 1 FROM "ProductServiceTag" pst WHERE pst."productId"=prod.id AND pst.slug=${q.service})` : Prisma.sql`TRUE`} AND prod.price >= ${p.minPrice ?? 0} AND prod.price <= ${p.maxPrice ?? 100000})`);
  return clauses;
}
async function search(db, q) {
  const p = searchParams(q);
  let rows;
  const productFilter = {
    active: true,
    ...(q.service ? {
      directoryServices: {
        some: {
          slug: q.service
        }
      }
    } : {}),
    ...(p.minPrice !== null || p.maxPrice !== null ? {
      price: {
        ...(p.minPrice !== null ? {
          gte: p.minPrice
        } : {}),
        ...(p.maxPrice !== null ? {
          lte: p.maxPrice
        } : {})
      }
    } : {})
  };
  const storeSelect = {
    ...publicStoreSelect,
    products: {
      ...publicStoreSelect.products,
      where: productFilter
    }
  };
  const where = {
    status: 'published',
    store: {
      active: true
    },
    ...(q.municipalityCode ? {
      municipalityCode: q.municipalityCode
    } : {}),
    ...(q.service ? {
      services: {
        some: {
          slug: q.service
        }
      }
    } : {})
  };
  if (p.minPrice !== null || p.maxPrice !== null) where.store.products = {
    some: {
      active: true,
      ...(q.service ? {
        directoryServices: {
          some: {
            slug: q.service
          }
        }
      } : {}),
      price: {
        ...(p.minPrice !== null ? {
          gte: p.minPrice
        } : {}),
        ...(p.maxPrice !== null ? {
          lte: p.maxPrice
        } : {})
      }
    }
  };
  if (postgres()) {
    const clauses = sqlFilters(q, p);
    const point = p.lat === null ? null : Prisma.sql`ST_SetSRID(ST_MakePoint(${p.lng},${p.lat}),4326)::geography`;
    if (point) clauses.push(Prisma.sql`ST_DWithin(l."publicGeo",${point},${p.radius * 1000})`);
    const ids = await db.$queryRaw(Prisma.sql`SELECT l.id${point ? Prisma.sql`, ST_Distance(l."publicGeo",${point})/1000 AS distance` : Prisma.sql`, NULL AS distance`} FROM "DirectoryListing" l WHERE ${Prisma.join(clauses, ' AND ')} ORDER BY ${point ? Prisma.sql`distance, l."publicId"` : Prisma.sql`l."publicId"`} LIMIT ${p.limit + 1} OFFSET ${p.offset}`);
    const records = await db.directoryListing.findMany({
      where: {
        ...where,
        id: {
          in: ids.map(r => r.id)
        }
      },
      include: {
        services: true,
        store: {
          select: storeSelect
        }
      }
    });
    rows = ids.map(id => ({
      row: records.find(r => r.id === id.id),
      distance: id.distance === null ? undefined : Number(id.distance)
    })).filter(r => r.row);
  } else {
    if (process.env.NODE_ENV === 'production') fail('Busca geográfica exige PostgreSQL em produção', 503);
    if (p.lat !== null) {
      const delta = p.radius / 110;
      const lngDelta = Math.min(180, delta / Math.max(.01, Math.cos(p.lat * Math.PI / 180)));
      where.publicLatitude = {
        gte: p.lat - delta,
        lte: p.lat + delta
      };
      where.publicLongitude = {
        gte: p.lng - lngDelta,
        lte: p.lng + lngDelta
      };
    }
    const records = await db.directoryListing.findMany({
      where,
      include: {
        services: true,
        store: {
          select: storeSelect
        }
      },
      take: 2001,
      orderBy: {
        publicId: 'asc'
      }
    });
    if (records.length > 2000) fail('Use PostgreSQL para este volume de resultados', 503);
    rows = records.filter(row => q.openNow !== 'true' || isOpen(row)).map(row => ({
      row,
      distance: p.lat === null ? undefined : distanceKm(p.lat, p.lng, row.publicLatitude, row.publicLongitude)
    })).filter(r => r.distance === undefined || r.distance <= p.radius).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.row.publicId.localeCompare(b.row.publicId)).slice(p.offset, p.offset + p.limit + 1);
  }
  return {
    items: rows.slice(0, p.limit).map(r => project(r.row, r.distance)),
    hasMore: rows.length > p.limit
  };
}
async function clusters(db, q) {
  const b = String(q.bbox || '').split(',');
  if (b.length !== 4) fail('Informe a área do mapa');
  const [west, south, east, north] = b.map((v, i) => num(v, i % 2 ? -90 : -180, i % 2 ? 90 : 180, 'Área'));
  if (west >= east || south >= north) fail('Área inválida');
  const cell = Math.max((east - west) / 30, (north - south) / 30, .005);
  const p = searchParams({
    ...q,
    lat: '0',
    lng: '0'
  });
  const clauses = sqlFilters(q, p);
  if (postgres()) {
    const items = await db.$queryRaw(Prisma.sql`SELECT AVG(l."publicLatitude") AS lat, AVG(l."publicLongitude") AS lng, COUNT(*)::int AS count FROM "DirectoryListing" l WHERE ${Prisma.join(clauses, ' AND ')} AND ST_Intersects(l."publicGeo"::geometry,ST_MakeEnvelope(${west},${south},${east},${north},4326)) GROUP BY floor(l."publicLongitude"/${cell}),floor(l."publicLatitude"/${cell}) LIMIT 1024`);
    return {
      items,
      truncated: items.length === 1024
    };
  }
  if (process.env.NODE_ENV === 'production') fail('Busca geográfica exige PostgreSQL em produção', 503);
  const where = {
    status: 'published',
    store: {
      active: true
    },
    ...(q.municipalityCode ? {
      municipalityCode: q.municipalityCode
    } : {}),
    ...(q.service ? {
      services: {
        some: {
          slug: q.service
        }
      }
    } : {}),
    publicLatitude: {
      gte: south,
      lte: north
    },
    publicLongitude: {
      gte: west,
      lte: east
    }
  };
  if (p.minPrice !== null || p.maxPrice !== null) where.store.products = {
    some: {
      active: true,
      ...(q.service ? {
        directoryServices: {
          some: {
            slug: q.service
          }
        }
      } : {}),
      price: {
        ...(p.minPrice !== null ? {
          gte: p.minPrice
        } : {}),
        ...(p.maxPrice !== null ? {
          lte: p.maxPrice
        } : {})
      }
    }
  };
  const candidates = await db.directoryListing.findMany({
    where,
    select: {
      publicLatitude: true,
      publicLongitude: true,
      hoursJson: true,
      holidayHoursJson: true,
      timeZone: true
    },
    take: 2001
  });
  if (candidates.length > 2000) fail('Use PostgreSQL para este volume de resultados', 503);
  const rows = candidates.filter(row => q.openNow !== 'true' || isOpen(row));
  if (rows.length > 2000) fail('Use PostgreSQL para este volume de resultados', 503);
  const buckets = new Map();
  for (const r of rows) {
    const k = `${Math.floor(r.publicLatitude / cell)}:${Math.floor(r.publicLongitude / cell)}`;
    const x = buckets.get(k) || {
      lat: 0,
      lng: 0,
      count: 0
    };
    x.lat += r.publicLatitude;
    x.lng += r.publicLongitude;
    x.count++;
    buckets.set(k, x);
  }
  return {
    items: [...buckets.values()].map(x => ({
      lat: x.lat / x.count,
      lng: x.lng / x.count,
      count: x.count
    })),
    truncated: false
  };
}
module.exports = {
  search,
  clusters,
  postgres
};
