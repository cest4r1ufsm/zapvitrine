const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'prisma/schema.prisma'), 'utf8');
const schema = source.replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "../generated/postgres"');
const target = path.join(base, 'prisma/schema.postgresql.prisma');
fs.writeFileSync(target, schema);
const env = { ...process.env, DATABASE_URL: process.env.POSTGRES_BUILD_URL || 'postgresql://build:build@localhost:5432/build' };
function prisma(args) {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { cwd: base, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Falha no preparo PostgreSQL: ' + result.stderr);
  return result.stdout;
}
prisma(['validate', '--schema', target]);
if (process.argv.includes('--baseline')) {
  const sql = prisma(['migrate', 'diff', '--from-empty', '--to-schema-datamodel', target, '--script']);
  fs.mkdirSync(path.join(base, 'prisma/postgresql'), { recursive: true });
  fs.writeFileSync(path.join(base, 'prisma/postgresql/001-baseline.sql'), sql);
}
if (!process.argv.includes('--schema-only')) prisma(['generate', '--schema', target]);
console.log(`Schema PostgreSQL preparado${process.argv.includes('--schema-only') ? '' : ' e client gerado'}. Nenhum banco foi modificado.`);
