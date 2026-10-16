// Source must be an explicitly supplied, frozen copy. Output contains counts only.
const fs = require('node:fs');
const { PrismaClient: SQLiteClient, Prisma } = require('@prisma/client');
const { PrismaClient: PostgresClient } = require('../generated/postgres');
const tables = ['User','Store','Category','Product','Professional','BlockedSlot','Client','Order',
  'WhatsAppSignupState','WhatsAppInbox','WhatsAppConversation','WhatsAppDelivery','WhatsAppWorkerLease',
  'DirectoryMunicipality','ServiceTag','ProductServiceTag','DirectoryListing','DirectoryListingService','DirectoryReport','DirectoryAudit','DirectoryQuota',
  'DirectoryFavorite','PublicBooking','DirectoryReview'];
const accessor = n => n[0].toLowerCase()+n.slice(1);
async function run() {
  if (!process.argv.includes('--ack-frozen-copy') || !process.env.SOURCE_SQLITE_URL?.startsWith('file:') || !/^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '')) throw new Error('Exige cópia SQLite congelada explícita, destino PostgreSQL e --ack-frozen-copy');
  const source = new SQLiteClient({ datasources: { db: { url: process.env.SOURCE_SQLITE_URL } } });
  const target = new PostgresClient();
  try {
    // The source copy must first be upgraded with SQLite db push --skip-generate,
    // never change the live database here. No identities/sessions are copied.
    const manifest = {};
    await target.$transaction(async tx => {
      for (const table of tables) {
        const key=accessor(table);
        if (await tx[key].count()) throw new Error(`Destino não vazio: ${table}`);
      }
      for (const table of tables) {
        const key=accessor(table),rows=await source[key].findMany();
        for(let i=0;i<rows.length;i+=250) await tx[key].createMany({data:rows.slice(i,i+250)});
        const count=await tx[key].count(); if(count!==rows.length) throw new Error(`Contagem divergente: ${table}`);
        manifest[table]=count;
        const model=Prisma.dmmf.datamodel.models.find(m=>m.name===table);
        if(model.fields.some(f=>f.name==='id'&&f.type==='Int'&&f.isId)) {
          // Identifiers come exclusively from the constant tables list above.
          await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), COALESCE((SELECT MAX(id) FROM "${table}"),1), EXISTS(SELECT 1 FROM "${table}"))`);
        }
      }
    },{timeout:300000,maxWait:10000});
    fs.writeFileSync(process.env.MIGRATION_MANIFEST || 'migration-counts.json', JSON.stringify({at:new Date().toISOString(),counts:manifest},null,2));
    console.log('Importação transacional concluída; valide invariantes e mídias antes da virada.');
  } finally { await source.$disconnect(); await target.$disconnect(); }
}
run().catch(e=>{ console.error('Importação interrompida:', e.code || e.message); process.exitCode=1; });
