// Registro automático de clientes.
//
// A tela "Clientes" lê a tabela Client e promete ao lojista que ela é
// "preenchida automaticamente", mas NENHUM caminho de criação de pedido
// gravava nela — a lista ficava permanentemente vazia para todas as lojas.
// Este helper é chamado por todos os pontos que criam Order: painel,
// bot Baileys e bot da WhatsApp Cloud API.
//
// O telefone é gravado EXATAMENTE como fica em Order.customerPhone. A rota
// GET /api/clients cruza os dois por igualdade de string para montar o último
// pedido e o total — normalizar aqui quebraria esse cruzamento com os pedidos
// já existentes.

async function registrarCliente(prisma, storeId, nome, telefone) {
  try {
    if (typeof telefone !== 'string') return null;
    const phone = telefone.trim();
    if (!phone) return null;

    const name = (typeof nome === 'string' && nome.trim())
      ? nome.trim().slice(0, 120)
      : 'Cliente';

    return await prisma.client.upsert({
      where: { storeId_phone: { storeId, phone } },
      // Em pedidos seguintes, o nome mais recente prevalece
      update: { name },
      create: { storeId, name, phone },
    });
  } catch (error) {
    // Falhar aqui nunca pode impedir o pedido de ser registrado
    console.error('Não foi possível registrar o cliente:', error.message);
    return null;
  }
}

module.exports = { registrarCliente };
