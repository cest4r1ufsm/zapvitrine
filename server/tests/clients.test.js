// Registro automático de clientes.
//
// Bug relatado pelo lojista: agendou para "valeria" pelo painel e ela não
// apareceu na tela de Clientes. Causa: NENHUM caminho de criação de pedido
// gravava na tabela Client — a lista ficava vazia para todas as lojas, apesar
// de a UI prometer que era "preenchida automaticamente".
const { criarRunner, criarBancoTemporario, proximaSegunda } = require('./helpers');

const banco = criarBancoTemporario(); // antes de carregar o Prisma

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { registrarCliente } = require('../src/utils/clients');

const DATA = proximaSegunda();
const { check, resumo } = criarRunner();

const CONFIG_AGENDA = {
  slotInterval: 30,
  hours: {
    sunday:    { active: false, open: '09:00', close: '18:00' },
    monday:    { active: true,  open: '09:00', close: '18:00' },
    tuesday:   { active: true,  open: '09:00', close: '18:00' },
    wednesday: { active: true,  open: '09:00', close: '18:00' },
    thursday:  { active: true,  open: '09:00', close: '18:00' },
    friday:    { active: true,  open: '09:00', close: '18:00' },
    saturday:  { active: true,  open: '09:00', close: '13:00' },
  },
};

module.exports = async function run() {
  console.log('\n=== Registro automático de clientes ===');

  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/routes/orders'));
  app.use('/api/clients', require('../src/routes/clients'));

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const BASE = 'http://127.0.0.1:' + server.address().port + '/api';

  let TOKEN;
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN });
  async function req(metodo, rota, corpo) {
    const r = await fetch(BASE + rota, { method: metodo, headers: H(), body: corpo ? JSON.stringify(corpo) : undefined });
    let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
    return { status: r.status, body: j };
  }

  try {
    const user = await prisma.user.create({
      data: { email: `cli-${Date.now()}@exemplo.com`, password: await bcrypt.hash('x', 4), name: 'C', emailVerified: true },
    });
    const store = await prisma.store.create({
      data: {
        userId: user.id, name: 'Loja Clientes', slug: 'cli-' + Date.now(), phone: '11999999999',
        schedulingConfig: JSON.stringify(CONFIG_AGENDA),
      },
    });
    const servico = await prisma.product.create({
      data: { storeId: store.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0, active: true },
    });
    const pro = await prisma.professional.create({ data: { storeId: store.id, name: 'Ana', active: true } });
    TOKEN = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    console.log('\n-- Agendamento pelo painel registra o cliente --');
    let r = await req('GET', '/clients');
    check('lista começa vazia', Array.isArray(r.body) && r.body.length === 0, 'já havia clientes');

    r = await req('POST', '/orders/manual', {
      productId: servico.id, professionalId: pro.id, customerName: 'Valeria Souza',
      customerPhone: '44997553688', date: DATA, time: '10:00',
    });
    check('agendamento criado', r.status === 201, `status ${r.status} ${JSON.stringify(r.body)?.slice(0, 150)}`);

    r = await req('GET', '/clients');
    const valeria = Array.isArray(r.body) ? r.body.find(c => c.phone === '44997553688') : null;
    check('cliente aparece na lista logo após o agendamento', !!valeria, 'não apareceu — era exatamente o bug');
    check('nome do cliente correto', valeria?.name === 'Valeria Souza', 'nome: ' + valeria?.name);
    check('a lista traz a contagem de pedidos', valeria?.totalOrders === 1, 'total: ' + valeria?.totalOrders);
    check('a lista traz o último pedido com o serviço',
      valeria?.lastOrder?.product?.name === 'Corte', 'ultimo: ' + JSON.stringify(valeria?.lastOrder?.product));
    check('a lista traz o profissional do último pedido',
      valeria?.lastOrder?.professional?.name === 'Ana', 'profissional: ' + JSON.stringify(valeria?.lastOrder?.professional));

    console.log('\n-- Histórico do cliente --');
    r = await req('GET', '/clients/44997553688/history');
    check('histórico responde 200', r.status === 200, `status ${r.status}`);
    check('histórico traz o pedido', Array.isArray(r.body?.orders) && r.body.orders.length === 1,
      JSON.stringify(r.body)?.slice(0, 150));

    console.log('\n-- Segundo agendamento do mesmo cliente não duplica --');
    r = await req('POST', '/orders/manual', {
      productId: servico.id, professionalId: pro.id, customerName: 'Valeria S. Souza',
      customerPhone: '44997553688', date: DATA, time: '14:00',
    });
    check('segundo agendamento criado', r.status === 201, `status ${r.status}`);
    r = await req('GET', '/clients');
    const doTelefone = Array.isArray(r.body) ? r.body.filter(c => c.phone === '44997553688') : [];
    check('continua existindo UM único registro para o telefone', doTelefone.length === 1,
      doTelefone.length + ' registros duplicados');
    check('contagem de pedidos sobe para 2', doTelefone[0]?.totalOrders === 2, 'total: ' + doTelefone[0]?.totalOrders);
    check('o nome mais recente prevalece', doTelefone[0]?.name === 'Valeria S. Souza', 'nome: ' + doTelefone[0]?.name);

    console.log('\n-- Isolamento entre lojas --');
    const outroUser = await prisma.user.create({
      data: { email: `cli2-${Date.now()}@exemplo.com`, password: 'x', name: 'D', emailVerified: true },
    });
    const outraLoja = await prisma.store.create({
      data: { userId: outroUser.id, name: 'Outra', slug: 'cli2-' + Date.now(), phone: '11888888888' },
    });
    await registrarCliente(prisma, outraLoja.id, 'Cliente Alheio', '44997553688');
    r = await req('GET', '/clients');
    check('cliente de outra loja não vaza na listagem',
      Array.isArray(r.body) && !r.body.some(c => c.name === 'Cliente Alheio'), 'vazou');
    check('mesmo telefone pode existir em lojas diferentes',
      (await prisma.client.count({
        where: { phone: '44997553688', storeId: { in: [store.id, outraLoja.id] } },
      })) === 2, 'esperado 1 registro em cada uma das duas lojas de teste');

    console.log('\n-- Robustez do helper --');
    check('telefone vazio não cria registro',
      (await registrarCliente(prisma, store.id, 'X', '')) === null, 'criou com telefone vazio');
    check('telefone nulo não cria registro',
      (await registrarCliente(prisma, store.id, 'X', null)) === null, 'criou com telefone nulo');
    const semNome = await registrarCliente(prisma, store.id, '', '44900000000');
    check('sem nome, usa um rótulo padrão em vez de falhar', semNome?.name === 'Cliente', 'nome: ' + semNome?.name);
    // loja inexistente viola a chave estrangeira: o helper tem de engolir o erro
    // e devolver null, nunca derrubar a criação do pedido
    let lancou = false;
    let retorno = 'nao-executou';
    try { retorno = await registrarCliente(prisma, 99999999, 'Y', '44900001111'); }
    catch { lancou = true; }
    check('erro de banco não escapa do helper', !lancou, 'lançou exceção');
    check('e o helper devolve null nesse caso', retorno === null, 'retornou: ' + JSON.stringify(retorno));

    return resumo('Registro automático de clientes');
  } finally {
    await prisma.$disconnect();
    server.close();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
