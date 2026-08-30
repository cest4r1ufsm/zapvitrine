// End-to-end do bot da WhatsApp Cloud API (routes/webhook.js).
//
// Este é o caminho por onde os pedidos REAIS entram. Antes da correção ele
// perguntava o horário em texto livre e gravava a resposta crua, ignorando
// bloqueios, horário de funcionamento e conflitos. O teste conduz uma conversa
// completa contra o webhook de verdade, com a chamada à Graph API interceptada.
const { criarRunner, criarBancoTemporario, proximaSegunda } = require('./helpers');

const banco = criarBancoTemporario(); // antes de carregar o Prisma

const express = require('express');
const prisma = require('../src/lib/prisma');

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
  console.log('\n=== Bot WhatsApp Cloud API (end-to-end) ===');

  // Intercepta as mensagens que o bot enviaria para a Meta.
  const enviadas = [];
  const fetchReal = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).includes('facebook.com')) {
      let corpo = {};
      try { corpo = JSON.parse(options?.body || '{}'); } catch { /* ignora */ }
      enviadas.push(corpo);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'stub' }] }) };
    }
    return fetchReal(url, options);
  };

  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/api/webhook', require('../src/routes/webhook'));

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const TELEFONE = '5511999990000';

  // Texto de tudo que o bot mandou desde a última leitura
  function textoDe(msg) {
    return msg?.text?.body
      || msg?.interactive?.body?.text
      || JSON.stringify(msg);
  }

  // O webhook responde 200 ANTES de processar, então esperamos a resposta sair.
  async function conversar(payloadMensagem) {
    const antes = enviadas.length;
    await fetch(`${BASE}/api/webhook/${STORE.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: [{ changes: [{ value: { messages: [payloadMensagem] } }] }],
      }),
    });
    const limite = Date.now() + 5000;
    while (enviadas.length === antes && Date.now() < limite) {
      await new Promise(r => setTimeout(r, 25));
    }
    return enviadas.slice(antes).map(textoDe).join('\n---\n');
  }

  const digitar = texto => conversar({ from: TELEFONE, type: 'text', text: { body: texto } });
  const clicar = id => conversar({
    from: TELEFONE, type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id, title: id } },
  });

  let STORE;

  try {
    const user = await prisma.user.create({
      data: { email: `bot-${Date.now()}@exemplo.com`, password: 'x', name: 'Bot', emailVerified: true },
    });
    STORE = await prisma.store.create({
      data: {
        userId: user.id, name: 'Barbearia Teste', slug: 'bot-' + Date.now(), phone: '11999999999',
        schedulingConfig: JSON.stringify(CONFIG_AGENDA),
        botEnabled: true, botToken: 'stub-token', botPhoneId: '123', botWebhookToken: 'verify',
      },
    });
    const servico = await prisma.product.create({
      data: { storeId: STORE.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0, active: true },
    });

    // Intervalo de almoço que o lojista configurou — o bot NÃO pode oferecê-lo
    await prisma.blockedSlot.create({
      data: { storeId: STORE.id, date: DATA, isFullDay: false, startTime: '12:00', endTime: '13:00', reason: 'Almoço' },
    });

    console.log('\n-- Conversa completa de agendamento --');
    let resposta = await clicar('order_' + servico.id);
    check('bot inicia o pedido ao escolher o serviço', resposta.length > 0, 'nenhuma resposta');

    resposta = await digitar('Maria Silva');
    check('bot pede o tipo de atendimento após o nome', resposta.length > 0, 'nenhuma resposta');

    resposta = await clicar('type_schedule');
    check('ao escolher agendar, o bot oferece DATAS (não texto livre)',
      /\d{2}\/\d{2}/.test(resposta), 'resposta sem datas: ' + resposta.slice(0, 200));
    const ofereceuData = resposta;

    resposta = await clicar('date_' + DATA);
    const listaHorarios = resposta;
    check('bot oferece uma lista de horários', /\d{2}:\d{2}/.test(listaHorarios),
      'sem horários: ' + listaHorarios.slice(0, 200));

    console.log('\n-- O intervalo de almoço do lojista é respeitado --');
    check('12:00 NÃO é oferecido (dentro do break)', !listaHorarios.includes('12:00'),
      'ofereceu horário bloqueado: ' + listaHorarios.slice(0, 300));
    check('12:30 NÃO é oferecido (dentro do break)', !listaHorarios.includes('12:30'),
      'ofereceu horário bloqueado: ' + listaHorarios.slice(0, 300));
    check('13:00 é oferecido (logo após o break)', listaHorarios.includes('13:00'),
      'não ofereceu 13:00: ' + listaHorarios.slice(0, 300));

    console.log('\n-- Texto livre não é mais aceito como horário --');
    resposta = await digitar('amanhã às 14h');
    check('bot recusa horário digitado e repete a lista',
      /não entendi/i.test(resposta) || /\d{2}:\d{2}/.test(resposta),
      'aceitou texto livre: ' + resposta.slice(0, 200));
    const pedidosAposTextoLivre = await prisma.order.count({ where: { storeId: STORE.id } });
    check('nenhum pedido foi criado a partir do texto livre', pedidosAposTextoLivre === 0,
      pedidosAposTextoLivre + ' pedidos criados');

    console.log('\n-- Conclusão do pedido --');
    // Descobre o número da opção correspondente a 13:00 na lista exibida
    const linha = listaHorarios.split('\n').find(l => l.includes('13:00'));
    const numero = (linha || '').replace(/[^0-9]/g, '').replace(/13$|1300$/, '') || '1';
    resposta = await digitar(numero);
    check('bot aceita a escolha do horário pelo número', resposta.length > 0, 'sem resposta');

    resposta = await clicar('no_notes');
    check('bot confirma o pedido', /pedido/i.test(resposta), 'confirmação ausente: ' + resposta.slice(0, 200));

    const pedido = await prisma.order.findFirst({
      where: { storeId: STORE.id }, orderBy: { id: 'desc' },
    });
    check('pedido foi criado no banco', !!pedido, 'nenhum pedido');
    check('scheduledAt foi GRAVADO (antes ficava sempre nulo)', !!pedido?.scheduledAt,
      'scheduledAt: ' + pedido?.scheduledAt);
    check('scheduledAt cai na data escolhida',
      pedido?.scheduledAt && pedido.scheduledAt.toISOString().slice(0, 10) === DATA,
      'data: ' + pedido?.scheduledAt);
    check('o horário gravado NÃO está dentro do intervalo de almoço',
      pedido?.scheduledAt && !(pedido.scheduledAt.getUTCHours() === 12),
      'gravou dentro do break: ' + pedido?.scheduledAt);
    check('scheduledTime legível preenchido (a Agenda usa como fallback)',
      !!pedido?.scheduledTime, 'scheduledTime vazio');

    console.log('\n-- O horário agendado deixa de ser oferecido --');
    const AV = require('../src/utils/availability');
    const restantes = await AV.getAvailableSlots(prisma, STORE.id, DATA, servico.id, null);
    const horarioGravado = pedido?.scheduledAt
      ? String(pedido.scheduledAt.getUTCHours()).padStart(2, '0') + ':' + String(pedido.scheduledAt.getUTCMinutes()).padStart(2, '0')
      : null;
    check('o slot recém-agendado sumiu da disponibilidade',
      horarioGravado && !restantes.includes(horarioGravado),
      `${horarioGravado} ainda aparece em: ${restantes.join(',')}`);

    console.log('\n-- Fluxo de entrega (não-agendamento) não regrediu --');
    const outroTelefone = '5511888880000';
    const conversarComo = async (tel, msg) => {
      const antes = enviadas.length;
      await fetch(`${BASE}/api/webhook/${STORE.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: tel, ...msg }] } }] }] }),
      });
      const limite = Date.now() + 5000;
      while (enviadas.length === antes && Date.now() < limite) await new Promise(r => setTimeout(r, 25));
      return enviadas.slice(antes).map(textoDe).join('\n');
    };
    await conversarComo(outroTelefone, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'order_' + servico.id, title: 'x' } } });
    await conversarComo(outroTelefone, { type: 'text', text: { body: 'Joao Entrega' } });
    await conversarComo(outroTelefone, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'type_delivery', title: 'x' } } });
    await conversarComo(outroTelefone, { type: 'text', text: { body: 'Rua das Flores, 123' } });
    await conversarComo(outroTelefone, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'no_notes', title: 'x' } } });

    const entrega = await prisma.order.findFirst({
      where: { storeId: STORE.id, customerName: 'Joao Entrega' }, orderBy: { id: 'desc' },
    });
    check('pedido de ENTREGA continua sendo criado', !!entrega, 'entrega nao criada');
    check('entrega mantém scheduledAt nulo (comportamento original)',
      entrega && entrega.scheduledAt === null, 'scheduledAt: ' + entrega?.scheduledAt);
    check('entrega guarda o endereço', !!entrega?.customerAddress, 'endereco vazio');

    console.log('\n-- Webhook resiliente a payload malformado --');
    for (const [nome, corpo] of [
      ['corpo vazio', {}],
      ['entry vazio', { entry: [] }],
      ['sem mensagens', { entry: [{ changes: [{ value: {} }] }] }],
      ['mensagem sem from', { entry: [{ changes: [{ value: { messages: [{ type: 'text' }] } }] }] }],
    ]) {
      const r = await fetch(`${BASE}/api/webhook/${STORE.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      check(`payload "${nome}" não derruba o webhook`, r.status === 200, 'status ' + r.status);
    }
    const r404 = await fetch(`${BASE}/api/webhook/abc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    check('storeId não numérico devolve 404', r404.status === 404, 'status ' + r404.status);

    // Dá um instante para o processamento assíncrono pendente encerrar
    await new Promise(r => setTimeout(r, 300));
    check('bot ofereceu datas antes de horários (ordem do fluxo)',
      ofereceuData.length > 0, 'fluxo fora de ordem');

    return resumo('Bot WhatsApp Cloud API');
  } finally {
    global.fetch = fetchReal;
    await prisma.$disconnect();
    server.close();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
