// Backfill de trial: seta trialEndsAt = agora + 7 dias em toda store que ainda
// não tem trialEndsAt e não é assinante ativa.
// Rodar a partir de server/:  node scripts/backfill-trial.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/lib/prisma');

async function main() {
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await prisma.store.updateMany({
    where: {
      trialEndsAt: null,
      subscriptionStatus: { not: 'active' },
    },
    data: { trialEndsAt },
  });

  console.log(`Backfill concluído: ${result.count} loja(s) atualizada(s) com trialEndsAt = ${trialEndsAt.toISOString()}`);
}

main()
  .catch((err) => {
    console.error('Erro no backfill:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
