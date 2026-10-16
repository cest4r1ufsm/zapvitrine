'use strict';

if (!process.env.TEST_POSTGRES_URL) {
  console.log('SKIP directory benchmark: TEST_POSTGRES_URL absent');
  process.exit(0);
}
if (process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Disposable PostgreSQL acknowledgement required');
process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
const {
    randomUUID
  } = require('node:crypto'),
  {
    performance
  } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const prisma = require('../src/lib/prisma');
(async () => {
  const rollback = new Error('ROLLBACK_SYNTHETIC_DATA');
  let report;
  try {
    await prisma.$transaction(async tx => {
      const marker = 'benchmark-' + randomUUID();
      await tx.$executeRaw`WITH users AS (INSERT INTO "User" (email,password,name) SELECT ${marker}||'-'||g||'@invalid.test','unused',${marker} FROM generate_series(1,10000) g RETURNING id), stores AS (INSERT INTO "Store" ("userId",name,slug,phone,"updatedAt") SELECT id,${marker},${marker}||'-'||id,'11999999999',now() FROM users RETURNING id,slug), points AS (SELECT id,slug,row_number() OVER() AS n FROM stores) INSERT INTO "DirectoryListing" ("publicId","storeId",name,phone,"storeSlug",address,"municipalityCode",city,uf,latitude,longitude,"publicLatitude","publicLongitude","timeZone",status,"consentAt","coordinatesConfirmedAt","updatedAt") SELECT ${marker}||'-'||id,id,${marker},'11999999999',slug,'Synthetic','3550308','Synthetic','SP',CASE WHEN n<=1000 THEN -23.55+(n%100)::float/1000 ELSE -33+(n%3800)::float/100 END,CASE WHEN n<=1000 THEN -46.63+((n*37)%100)::float/1000 ELSE -73+((n*7919)%3900)::float/100 END,CASE WHEN n<=1000 THEN -23.55+(n%100)::float/1000 ELSE -33+(n%3800)::float/100 END,CASE WHEN n<=1000 THEN -46.63+((n*37)%100)::float/1000 ELSE -73+((n*7919)%3900)::float/100 END,'America/Sao_Paulo','published',now(),now(),now() FROM points`;
      await tx.$executeRaw`ANALYZE "DirectoryListing"`;
      const plan = await tx.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM "DirectoryListing" WHERE status='published' AND ST_DWithin("publicGeo",ST_SetSRID(ST_MakePoint(-46.63,-23.55),4326)::geography,10000) ORDER BY ST_Distance("publicGeo",ST_SetSRID(ST_MakePoint(-46.63,-23.55),4326)::geography) LIMIT 20`;
      assert.equal(plan[0]['QUERY PLAN'][0].Plan['Actual Rows'], 20, 'Benchmark must return real candidates');
      const serialized = JSON.stringify(plan);
      assert(serialized.includes('DirectoryListing_publicGeo_gist'), 'Planner must use real spatial GiST index without disabling seqscan');
      const timings = [];
      for (let i = 0; i < 40; i++) {
        const started = performance.now();
        await tx.$queryRaw`SELECT id FROM "DirectoryListing" WHERE status='published' AND ST_DWithin("publicGeo",ST_SetSRID(ST_MakePoint(${-46.63 + i % 5 / 500},${-23.55 + i % 5 / 500}),4326)::geography,10000) ORDER BY ST_Distance("publicGeo",ST_SetSRID(ST_MakePoint(${-46.63 + i % 5 / 500},${-23.55 + i % 5 / 500}),4326)::geography) LIMIT 20`;
        timings.push(performance.now() - started);
      }
      timings.sort((a, b) => a - b);
      report = {
        syntheticListings: 10000,
        queries: 40,
        p50Ms: Number(timings[19].toFixed(2)),
        p95Ms: Number(timings[37].toFixed(2)),
        maxMs: Number(timings[39].toFixed(2)),
        spatialIndexUsed: true,
        explain: plan[0]['QUERY PLAN'][0]
      };
      throw rollback;
    }, {
      timeout: 60000
    });
  } catch (e) {
    if (e !== rollback) throw e;
  } finally {
    await prisma.$executeRaw`ANALYZE "DirectoryListing"`;
    await prisma.$disconnect();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
