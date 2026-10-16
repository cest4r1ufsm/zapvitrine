const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { migrateMedia } = require('../scripts/migrate-media');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agt-media-fixture-'));
  const row = { id: 1, logoUrl: '/uploads/existing.png', bannerUrl: null };
  const db = {
    store: {
      findMany: async () => [row],
      updateMany: async ({ where, data }) => {
        assert.equal(where.logoUrl, row.logoUrl);
        Object.assign(row, data); return { count: 1 };
      },
    },
    product: { findMany: async () => [] },
  };
  try {
    await assert.rejects(migrateMedia(db, { root }), { code: 'ENOENT' });
    await fs.writeFile(path.join(root, 'existing.png'), 'synthetic-image');
    assert.deepEqual(await migrateMedia(db, { root }), { pending: 1, migrated: 0, dryRun: true });
    let calls = 0;
    const options = { root, apply: true,
      convert: async file => { calls++; assert.equal(await fs.readFile(file.path, 'utf8'), 'synthetic-image'); return { url: 'https://media.test/public/synthetic.webp' }; },
      remove: async () => { throw new Error('should not remove referenced object'); },
    };
    assert.equal((await migrateMedia(db, options)).migrated, 1);
    assert.equal((await migrateMedia(db, options)).migrated, 0);
    assert.equal(calls, 1, 'Resuming skips already migrated URLs');
    assert.equal(await fs.readFile(path.join(root, 'existing.png'), 'utf8'), 'synthetic-image', 'Original frozen copy preserved');
    row.logoUrl = '/uploads/../outside.png';
    await assert.rejects(migrateMedia(db, { root }), /inválida/);
    console.log('PASS media migration: dry-run, missing-file preflight, resumability, preserved source, traversal rejection');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
