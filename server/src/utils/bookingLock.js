// Serializa "revalidar disponibilidade + gravar pedido" por loja.
//
// Sem isso existe um TOCTOU real: dois pedidos simultâneos para o mesmo horário
// consultam getAvailableSlots antes de qualquer um gravar, ambos veem o slot
// livre e ambos criam o agendamento (comprovado em teste: 2 pedidos, 201/201).
//
// A aplicação roda num único processo Node com SQLite, então uma fila em
// memória por loja fecha a janela por completo. Se um dia houver mais de um
// processo servindo a mesma base, isto precisa virar um lock no banco.
const filas = new Map();

function withStoreLock(storeId, fn) {
  if (!Number.isSafeInteger(Number(storeId)) || Number(storeId) < 1) throw new Error('Loja inválida');
  if (/^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '')) {
    const prisma = require('../lib/prisma');
    const context = require('../lib/transactionContext');
    const current = context.getStore();
    if (current) {
      if (current.storeId !== Number(storeId)) throw new Error('Transação entre lojas não permitida');
      return fn();
    }
    return prisma.$root.$transaction(async client => {
      // A transaction-scoped database lock works across processes and releases
      // on rollback/crash. READ COMMITTED sees writes after the lock is acquired.
      await client.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(713901, ${Number(storeId)}::integer)`;
      return context.run({ client, storeId: Number(storeId) }, fn);
    }, { maxWait: 5000, timeout: 15000, isolationLevel: 'ReadCommitted' });
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Agenda de produção exige PostgreSQL');
  const chave = String(storeId);
  const anterior = filas.get(chave) || Promise.resolve();

  const execucao = anterior.then(fn);

  // A fila nunca rejeita: um erro numa reserva não pode travar as seguintes.
  const proximo = execucao.then(() => {}, () => {});
  filas.set(chave, proximo);
  proximo.then(() => {
    // Libera a chave quando ninguém mais está esperando, para o Map não crescer.
    if (filas.get(chave) === proximo) filas.delete(chave);
  });

  return execucao;
}

module.exports = { withStoreLock };
