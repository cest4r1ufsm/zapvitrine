// Explicit operator command. Never runs automatically when the API starts.
require('dotenv').config();
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function migrate(url = process.env.DATABASE_URL) {
  if (!/^postgres(?:ql)?:/.test(url || '')) throw new Error('DATABASE_URL deve apontar para PostgreSQL');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(713900)');
    await client.query('CREATE TABLE IF NOT EXISTS agt_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of fs.readdirSync(path.join(__dirname, '../prisma/postgresql')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, '../prisma/postgresql', name), 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('SELECT checksum FROM agt_schema_migrations WHERE name=$1', [name]);
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== hash) throw new Error(`Migration já aplicada foi alterada: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout='10s'");
        await client.query(sql);
        await client.query('INSERT INTO agt_schema_migrations(name,checksum) VALUES($1,$2)', [name, hash]);
        await client.query('COMMIT');
        console.log(`Aplicada: ${name}`);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    }
  } finally { await client.end(); }
}
if (require.main === module) {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply depois do backup e ensaio');
  migrate().catch(e => { console.error('Migração interrompida:', e.code || e.message); process.exitCode=1; });
}
module.exports = { migrate };
