require('dotenv').config();
require('./lib/productionConfig').validateProductionConfig();
const prisma = require('./lib/prisma');
const crypto = require('node:crypto');
const owner = crypto.randomUUID();
let closing = false;
let timer;
let inboxTimer;
let maintenanceInFlight;

async function withLease(id, fn) {
  const now = new Date();
  const expiresAt = new Date(Date.now() + 15 * 60000);
  await prisma.whatsAppWorkerLease.upsert({ where: { id }, create: { id, owner: 'unclaimed', expiresAt: new Date(0) }, update: {} });
  const claimed = await prisma.whatsAppWorkerLease.updateMany({ where: { id, expiresAt: { lt: now } }, data: { owner, expiresAt } });
  if (!claimed.count) return;
  const renew = setInterval(() => prisma.whatsAppWorkerLease.updateMany({ where: { id, owner }, data: { expiresAt: new Date(Date.now() + 15 * 60000) } })
    .catch(() => console.error('Worker lease renewal unavailable')), 60000);
  try { await fn(); }
  finally {
    clearInterval(renew);
    await prisma.whatsAppWorkerLease.deleteMany({ where: { id, owner } });
  }
}

function maintenance() {
  if (closing || maintenanceInFlight) return maintenanceInFlight;
  maintenanceInFlight = withLease('maintenance:national', async () => {
    await prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.directoryQuota.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const { loadServiceAccount, createServiceAccountToken, createPlayBilling } = require('./services/playBilling');
    const account = loadServiceAccount();
    if (account) await createPlayBilling({
      prisma,
      getAccessToken: createServiceAccountToken({ serviceAccount: account }),
      onExpired: async storeId => {
        await prisma.store.updateMany({ where: { id: storeId }, data: { botEnabled: false } });
      },
    }).refreshDue();
  }).finally(() => { maintenanceInFlight = undefined; });
  return maintenanceInFlight;
}

async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  clearInterval(inboxTimer);
  const deadline = setTimeout(() => process.exit(1), 50000);
  deadline.unref();
  try {
    await Promise.allSettled([require('./routes/webhook').stopInboxWorker(), maintenanceInFlight]);
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(0);
  } catch { process.exit(1); }
}

(async () => {
  await require('./lib/databaseReadiness').verifyDatabase(prisma);
  inboxTimer = await require('./routes/webhook').startInboxWorker();
  if (closing) { clearInterval(inboxTimer); return; }
  await maintenance();
  if (!closing) timer = setInterval(() => maintenance()?.catch(error => console.error('Worker maintenance failed', error.code || error.name)), 30 * 60000);
  console.log('Worker iniciado');
})().catch(async error => {
  console.error('Worker startup failed', error.code || error.name);
  clearInterval(inboxTimer);
  await prisma.$disconnect();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
