const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'jvpxavier044@gmail.com';
  const password = 'Senha1234!';
  const name = 'João Vitor';

  console.log(`Checking if user ${email} already exists...`);
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log('User already exists! Updating verification and password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        emailVerified: true,
      },
    });
    console.log('User updated successfully:', updatedUser.email);
    return;
  }

  console.log('Creating new user...');
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      emailVerified: true,
      role: 'business',
    },
  });

  console.log('Creating default store...');
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const store = await prisma.store.create({
    data: {
      userId: user.id,
      name: `Loja de ${name}`,
      slug: `${slug}-${user.id}`,
      phone: '',
    },
  });

  console.log('User and store created successfully!');
  console.log('Email:', user.email);
  console.log('Password:', password);
}

main()
  .catch((e) => {
    console.error('Error running script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
