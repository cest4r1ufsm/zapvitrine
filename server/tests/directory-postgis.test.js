'use strict';

// Run ONLY against a disposable, migrated PostGIS database with the PostgreSQL
// Prisma client generated. Never points at DATABASE_URL by default.
if (!process.env.TEST_POSTGRES_URL) {
  console.log('SKIP directory PostGIS integration: TEST_POSTGRES_URL not configured');
  process.exit(0);
}
if (process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Set TEST_POSTGRES_DISPOSABLE=yes for the isolated migrated test database');
process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
process.env.NODE_ENV = 'production';
const assert = require('node:assert/strict');
const {
  randomUUID
} = require('node:crypto');
const prisma = require('../src/lib/prisma');
const {
  search,
  clusters
} = require('../src/modules/directory/search');
(async () => {
  let user;
  try {
    const marker = randomUUID();
    user = await prisma.user.create({
      data: {
        email: `${marker}@directory-test.invalid`,
        password: 'test-no-login',
        name: 'PostGIS test',
        emailVerified: true,
        store: {
          create: {
            name: 'Teste',
            slug: `test-${marker}`,
            phone: '11999999999'
          }
        }
      },
      include: {
        store: true
      }
    });
    await prisma.directoryListing.create({
      data: {
        publicId: marker,
        storeId: user.store.id,
        name: 'Teste spatial',
        phone: '11999999999',
        storeSlug: user.store.slug,
        address: 'Private 123',
        municipalityCode: '3550308',
        city: 'São Paulo',
        uf: 'SP',
        latitude: -23.55123,
        longitude: -46.63123,
        publicLatitude: -23.55,
        publicLongitude: -46.63,
        locationPrecision: 'approximate',
        timeZone: 'America/Sao_Paulo',
        status: 'published',
        consentAt: new Date(),
        coordinatesConfirmedAt: new Date(),
        services: {
          create: {
            slug: 'penteado'
          }
        }
      }
    });
    let result = await search(prisma, {
      lat: '-23.55',
      lng: '-46.63',
      radiusKm: '1',
      service: 'penteado'
    });
    assert(result.items.some(i => i.publicId === marker && i.distanceKm === 0 && i.address === null));
    result = await search(prisma, {
      lat: '-23.55',
      lng: '-46.63',
      radiusKm: '1',
      service: "'; DROP TABLE User; --"
    });
    assert.equal(result.items.length, 0);
    result = await search(prisma, {
      municipalityCode: '3550308',
      openNow: 'true'
    });
    assert(!result.items.some(i => i.publicId === marker));
    const agg = await clusters(prisma, {
      bbox: '-46.64,-23.56,-46.62,-23.54'
    });
    assert(agg.items.some(i => i.count > 0));
    const {
      isOpen
    } = require('../src/modules/directory/domain');
    const weekly = JSON.stringify({
      1: [{
        start: '22:00',
        end: '02:00'
      }]
    });
    for (const [zone, instant, exceptions] of [['America/Sao_Paulo', '2026-10-13T04:00:00Z', '{}'], ['America/Sao_Paulo', '2026-10-13T04:00:00Z', '{"2026-10-13":[]}'], ['America/Manaus', '2026-10-13T04:00:00Z', '{}'], ['America/Noronha', '2026-10-13T04:00:00Z', '{}']]) {
      const result = await prisma.$queryRaw`SELECT agt_directory_is_open(${weekly}::jsonb,${exceptions}::jsonb,${zone}::text,${new Date(instant)}::timestamptz) AS open`;
      assert.equal(result[0].open, isOpen({
        hoursJson: weekly,
        holidayHoursJson: exceptions,
        timeZone: zone
      }, new Date(instant)));
    }
    const indexes = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename='DirectoryListing' AND indexdef ILIKE '%gist%'`;
    assert(indexes.length >= 2, 'Both public geography and geometry GiST indexes required');
    console.log('PASS directory PostGIS: real spatial radius, privacy, SQL parameterization, local hours, clusters and index presence');
  } finally {
    if (user) await prisma.user.delete({
      where: {
        id: user.id
      }
    });
    await prisma.$disconnect();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
