// Preenche a tabela Client a partir dos pedidos já existentes.
//
// Nenhum caminho de criação de pedido gravava em Client, então a tela
// "Clientes" ficou vazia desde sempre. As novas gravações já são automáticas;
// este script recupera o histórico que ficou para trás.
//
// Uso:  node scripts/backfill-clients.js         (aplica)
//       node scripts/backfill-clients.js --dry   (só mostra o que faria)
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { registrarCliente } = require('../src/utils/clients');

const prisma = new PrismaClient();
const simulacao = process.argv.includes('--dry');

async function main() {
  const pedidos = await prisma.order.findMany({
    orderBy: { createdAt: 'asc' }, // o nome mais recente prevalece no fim
    select: { storeId: true, customerName: true, customerPhone: true },
  });

  console.log(`${pedidos.length} pedido(s) encontrado(s).`);

  // Deduplica por loja+telefone mantendo o nome do pedido mais recente
  const mapa = new Map();
  for (const p of pedidos) {
    if (typeof p.customerPhone !== 'string' || !p.customerPhone.trim()) continue;
    mapa.set(`${p.storeId}:${p.customerPhone.trim()}`, p);
  }

  console.log(`${mapa.size} cliente(s) distinto(s) a registrar.\n`);

  let criados = 0;
  for (const p of mapa.values()) {
    const existente = await prisma.client.findUnique({
      where: { storeId_phone: { storeId: p.storeId, phone: p.customerPhone.trim() } },
    });

    if (simulacao) {
      console.log(`  ${existente ? '=' : '+'} loja ${p.storeId} | ${p.customerName} | ${p.customerPhone}`);
      if (!existente) criados++;
      continue;
    }

    await registrarCliente(prisma, p.storeId, p.customerName, p.customerPhone);
    if (!existente) criados++;
    console.log(`  ${existente ? 'atualizado' : 'criado'}: loja ${p.storeId} | ${p.customerName} | ${p.customerPhone}`);
  }

  const total = await prisma.client.count();
  console.log(`\n${simulacao ? '[simulação] ' : ''}${criados} cliente(s) novo(s). Total na tabela: ${simulacao ? '(inalterado) ' : ''}${total}.`);
}

main()
  .catch((e) => { console.error('Falhou:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
