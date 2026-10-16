// Explicit, resumable migration of existing /uploads references to shared media.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

async function migrateMedia(db, { root, apply = false, convert, remove }) {
  if (!root || !path.isAbsolute(root)) throw new Error('Informe um diretório absoluto de uploads congelados');
  const directory = await fs.realpath(root);
  const jobs = [];
  for (const [model, fields] of [['store', ['logoUrl', 'bannerUrl']], ['product', ['imageUrl']]]) {
    const records = await db[model].findMany({ select: Object.fromEntries(['id', ...fields].map(field => [field, true])) });
    for (const row of records) for (const field of fields) {
      const url = row[field];
      if (!url?.startsWith('/uploads/')) continue;
      const filename = url.slice('/uploads/'.length);
      if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) throw new Error('Referência de mídia inválida; reconcilie antes de migrar');
      const input = await fs.realpath(path.join(directory, filename));
      const relative = path.relative(directory, input);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !(await fs.stat(input)).isFile()) throw new Error('Mídia fora do diretório autorizado');
      jobs.push({ model, id: row.id, field, url, input });
    }
  }
  if (!apply) return { pending: jobs.length, migrated: 0, dryRun: true };
  if (!convert || !remove) throw new Error('Conversor e limpeza de mídia obrigatórios');
  let migrated = 0;
  for (const job of jobs) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'agt-media-migration-'));
    let output;
    try {
      const filename = crypto.randomUUID() + path.extname(job.input);
      const input = path.join(temporary, filename);
      await fs.copyFile(job.input, input);
      output = await convert({ path: input, filename });
      if (!output.url?.startsWith('https://')) throw new Error('Migração exige mídia compartilhada HTTPS');
      const result = await db[job.model].updateMany({ where: { id: job.id, [job.field]: job.url }, data: { [job.field]: output.url } });
      if (!result.count) await remove(output.url);
      else migrated++;
    } catch (error) {
      // An uncertain DB commit could reference output: retain it for reconciliation,
      // never remove an object that might already be serving users.
      throw error;
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }
  return { pending: jobs.length - migrated, migrated, dryRun: false };
}

if (require.main === module) {
  const db = require('../src/lib/prisma');
  const apply = process.argv.includes('--apply');
  Promise.resolve().then(() => {
    if (apply && (!process.argv.includes('--ack-frozen-copy') || process.env.MEDIA_STORAGE !== 's3' || !/^postgres(?:ql)?:/.test(process.env.DATABASE_URL || ''))) throw new Error('Aplicação exige --ack-frozen-copy, PostgreSQL e MEDIA_STORAGE=s3');
    return migrateMedia(db, {
      root: process.env.SOURCE_UPLOADS_DIRECTORY,
      apply,
      convert: require('../src/utils/processImage').processImage,
      remove: require('../src/services/objectStorage').removeImage,
    });
  }).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error('Migração de mídia interrompida:', error.code || error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
module.exports = { migrateMedia };
