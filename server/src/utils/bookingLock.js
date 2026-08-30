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
