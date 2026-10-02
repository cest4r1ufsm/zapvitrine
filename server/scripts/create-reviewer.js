// Cria (ou atualiza) a conta que o revisor do Google Play usa para entrar no app.
// E-mail já confirmado e premium liberado, para o revisor ver tudo sem pagar.
//
// Uso no servidor:  node scripts/create-reviewer.js <email> <senha>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Uso: node scripts/create-reviewer.js <email> <senha com 8+ caracteres>');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, emailVerified: true, emailVerificationToken: null },
    create: { email, password: hashed, name: 'Revisor Google Play', emailVerified: true },
  });

  const premium = {
    subscriptionStatus: 'active',
    subscriptionSource: 'manual',
    plan: 'premium',
  };
  await prisma.store.upsert({
    where: { userId: user.id },
    update: premium,
    create: {
      userId: user.id,
      name: 'Studio Demonstração',
      slug: `studio-demonstracao-${user.id}`,
      phone: '',
      ...premium,
    },
  });

  console.log(`Conta de revisão pronta: ${email}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
