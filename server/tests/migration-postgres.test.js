const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
if (!process.env.TEST_MIGRATION_POSTGRES_URL || process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Requires a separate empty disposable TEST_MIGRATION_POSTGRES_URL');
const { PrismaClient: Source } = require('@prisma/client');
const { PrismaClient: Target } = require('../generated/postgres');
function command(args, env) {
  const result = spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
}
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agt-import-test-'));
  const sourceUrl = 'file:' + path.join(directory, 'frozen.db').replaceAll('\\', '/');
  await fs.writeFile(path.join(directory, 'frozen.db'), '');
  const source = new Source({ datasources: { db: { url: sourceUrl } } });
  const target = new Target({ datasources: { db: { url: process.env.TEST_MIGRATION_POSTGRES_URL } } });
  let user;
  try {
    assert.equal(await target.user.count(), 0, 'Use a separate EMPTY migration-test database');
    command([require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], { DATABASE_URL: sourceUrl });
    user = await source.user.create({ data: { email: 'migration@test.invalid', name: 'Synthetic migration', password: 'not-a-credential', emailVerified: true,
      store: { create: { name: 'Synthetic store', slug: 'synthetic-migration', phone: '11999999999' } } }, include: { store: true } });
    const product = await source.product.create({ data: { storeId: user.store.id, name: 'Cut', price: 27.9, duration: 45 } });
    await source.order.create({ data: { storeId: user.store.id, productId: product.id, customerName: 'Synthetic', customerPhone: '11999999999', scheduledAt: new Date('2030-01-04T10:00:00Z'), totalPrice: 27.9 } });
    await source.$disconnect();
    command([path.join(__dirname, '../scripts/import-sqlite.js'), '--ack-frozen-copy'], {
      SOURCE_SQLITE_URL: sourceUrl, DATABASE_URL: process.env.TEST_MIGRATION_POSTGRES_URL,
      MIGRATION_MANIFEST: path.join(directory, 'manifest.json'),
    });
    const imported = await target.order.findFirst();
    assert.equal(imported.scheduledAt.toISOString(), '2030-01-04T10:00:00.000Z');
    assert.equal(imported.priceCents, 2790);
    assert.equal(imported.reservedDurationMinutes, 45);
    assert.equal((await target.user.findUnique({ where: { id: user.id } })).email, user.email);
    const another = await target.user.create({ data: { email: 'sequence@test.invalid', name: 'Sequence', password: 'not-a-credential' } });
    assert.ok(another.id > user.id, 'Sequences advanced after explicit imported IDs');
    await target.user.delete({ where: { id: another.id } });
    const duplicate = spawnSync(process.execPath, [path.join(__dirname, '../scripts/import-sqlite.js'), '--ack-frozen-copy'], {
      env: { ...process.env, SOURCE_SQLITE_URL: sourceUrl, DATABASE_URL: process.env.TEST_MIGRATION_POSTGRES_URL }, encoding: 'utf8',
    });
    assert.notEqual(duplicate.status, 0, 'Import must refuse an existing destination');
    assert.equal(await target.order.count(), 1, 'Refused import preserved prior data');
    console.log('PASS SQLite -> PostgreSQL migration: IDs, times, cents, snapshots, sequences and refusal of nonempty destination');
  } finally {
    if (user) await target.user.deleteMany({ where: { email: 'migration@test.invalid' } });
    await source.$disconnect(); await target.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
