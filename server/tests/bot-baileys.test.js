// End-to-end do bot Baileys (services/whatsapp.js), o bot que roda por QR code.
//
// Foi o arquivo mais alterado da correção: o passo de horário em texto livre foi
// substituído por escolha guiada. O teste conduz a conversa chamando o handler
// real com um socket falso — nenhuma sessão de WhatsApp é aberta.
//
// Fluxo real da conversa:
//   menu -> [1] catálogo -> [n] produto -> nome -> [1] agendar
//        -> [n] profissional -> [n] data -> [n] horário -> [1] sem observações
const { criarRunner, criarBancoTemporario, proximaSegunda } = require('./helpers');

const banco = criarBancoTemporario(); // antes de carregar o Prisma

const prisma = require('../src/lib/prisma');
const AV = require('../src/utils/availability');
const { __test } = require('../src/services/whatsapp');

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

// "2026-09-07" -> "07/09", como o bot exibe na lista de datas
const rotuloBR = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Descobre o número da opção cuja linha contém `alvo`
function numeroDaOpcao(texto, alvo) {
  const linha = texto.split('\n').find(l => l.includes(alvo));
  if (!linha) return null;
  const m = linha.match(/\*(\d+)/);
  return m ? m[1] : null;
}

module.exports = async function run() {
  console.log('\n=== Bot Baileys / QR code (end-to-end) ===');

  if (!__test?.handleIncomingMessage) {
    check('services/whatsapp.js expõe o ponto de teste', false, '__test ausente');
    return resumo('Bot Baileys');
  }
  const { handleIncomingMessage, conversations } = __test;

  const enviadas = [];
  const socket = {
    user: { id: '5511000000000:1@s.whatsapp.net' },
    sendMessage: async (to, conteudo) => { enviadas.push(conteudo.text || ''); },
  };
  const TELEFONE = '5511999990000@s.whatsapp.net';

  try {
    const user = await prisma.user.create({
      data: { email: `bail-${Date.now()}@exemplo.com`, password: 'x', name: 'B', emailVerified: true },
    });
    const store = await prisma.store.create({
      data: {
        userId: user.id, name: 'Salao Teste', slug: 'bail-' + Date.now(), phone: '11999999999',
        schedulingConfig: JSON.stringify(CONFIG_AGENDA),
      },
    });
    const servico = await prisma.product.create({
      data: { storeId: store.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0, active: true },
    });
    const profissional = await prisma.professional.create({
      data: { storeId: store.id, name: 'Ana', active: true },
    });

    // Intervalo de almoço do lojista, só nesta data
    await prisma.blockedSlot.create({
      data: { storeId: store.id, date: DATA, isFullDay: false, startTime: '12:00', endTime: '13:00', reason: 'Almoço' },
    });

    const passo = () => conversations.get(`${store.id}:${TELEFONE}`)?.step;
    async function falar(texto) {
      const antes = enviadas.length;
      await handleIncomingMessage(store.id, socket, TELEFONE, texto, { key: {} });
      return enviadas.slice(antes).join('\n');
    }

    console.log('\n-- Navegação até o agendamento --');
    await falar('menu');
    let r = await falar('1');
    check('catálogo é exibido', passo() === 'choose_product', 'passo: ' + passo());
    const numProduto = numeroDaOpcao(r, 'Corte') || '1';
    await falar(numProduto);
    check('produto escolhido, bot pede o nome', passo() === 'ask_name', 'passo: ' + passo());
    await falar('Maria Silva');
    check('nome aceito, bot pergunta o tipo', passo() === 'ask_type', 'passo: ' + passo());

    r = await falar('1'); // agendar
    check('bot pergunta o profissional', passo() === 'choose_professional', 'passo: ' + passo());
    check('lista os profissionais ativos', /Ana/.test(r), 'sem profissionais: ' + r.slice(0, 200));

    const numProf = numeroDaOpcao(r, 'Ana') || '1';
    r = await falar(numProf);
    check('bot oferece DATAS (não texto livre)', passo() === 'choose_date', 'passo: ' + passo());
    const listaDatas = r;
    check('as datas vêm em formato de calendário', /\d{2}\/\d{2}/.test(listaDatas),
      'sem datas: ' + listaDatas.slice(0, 250));

    console.log('\n-- O intervalo de almoço reduz a contagem do dia --');
    const linhaData = listaDatas.split('\n').find(l => l.includes(rotuloBR(DATA)));
    check('a data com break aparece na lista', !!linhaData, 'data ausente: ' + listaDatas.slice(0, 300));
    const qtd = linhaData && linhaData.match(/(\d+)\s+hor/);
    check('o dia com break oferece menos horários que um dia cheio (18)',
      qtd && Number(qtd[1]) === 16, 'linha: ' + linhaData);

    console.log('\n-- Horários do dia com break --');
    const numData = numeroDaOpcao(listaDatas, rotuloBR(DATA));
    check('consegui localizar a opção da data', !!numData, 'nao achei o numero');
    r = await falar(numData);
    const listaHorarios = r;
    check('bot apresenta a lista de horários', passo() === 'choose_time', 'passo: ' + passo());
    check('12:00 NÃO é oferecido (dentro do break)', !listaHorarios.includes('12:00'),
      'ofereceu bloqueado: ' + listaHorarios.slice(0, 350));
    check('12:30 NÃO é oferecido (dentro do break)', !listaHorarios.includes('12:30'),
      'ofereceu bloqueado: ' + listaHorarios.slice(0, 350));
    check('13:00 é oferecido (logo após o break)', listaHorarios.includes('13:00'),
      'nao ofereceu 13:00: ' + listaHorarios.slice(0, 350));

    console.log('\n-- Texto livre recusado --');
    const pedidosAntes = await prisma.order.count({ where: { storeId: store.id } });
    r = await falar('sábado de manhã');
    check('bot não aceita horário digitado livremente',
      passo() === 'choose_time' && (/não entendi/i.test(r) || /\d{2}:\d{2}/.test(r)),
      'passo: ' + passo() + ' resposta: ' + r.slice(0, 200));
    check('nenhum pedido criado a partir do texto livre',
      (await prisma.order.count({ where: { storeId: store.id } })) === pedidosAntes, 'pedido criado');

    console.log('\n-- Conclusão do pedido --');
    const numHorario = numeroDaOpcao(listaHorarios, '13:00') || '1';
    r = await falar(numHorario);
    check('horário aceito, bot pergunta observações', passo() === 'ask_notes', 'passo: ' + passo());
    r = await falar('1'); // sem observações
    check('bot confirma o pedido', /pedido/i.test(r), 'sem confirmação: ' + r.slice(0, 250));
    check('a confirmação mostra data e horário', /13:00/.test(r), 'sem horário na confirmação');

    const pedido = await prisma.order.findFirst({ where: { storeId: store.id }, orderBy: { id: 'desc' } });
    check('pedido criado no banco', !!pedido, 'nenhum pedido');
    check('scheduledAt GRAVADO (antes ficava sempre nulo)', !!pedido?.scheduledAt, 'scheduledAt: ' + pedido?.scheduledAt);
    check('scheduledAt na data escolhida',
      pedido?.scheduledAt && pedido.scheduledAt.toISOString().slice(0, 10) === DATA, 'data: ' + pedido?.scheduledAt);
    check('horário gravado é 13:00', pedido?.scheduledAt && pedido.scheduledAt.getUTCHours() === 13,
      'hora: ' + pedido?.scheduledAt);
    check('professionalId gravado', pedido?.professionalId === profissional.id,
      'professionalId: ' + pedido?.professionalId);
    check('scheduledTime legível preenchido', !!pedido?.scheduledTime, 'vazio');

    const restantes = await AV.getAvailableSlots(prisma, store.id, DATA, servico.id, profissional.id);
    check('o horário agendado sai da disponibilidade',
      !restantes.includes('13:00'), '13:00 ainda em: ' + restantes.join(','));

    console.log('\n-- Fluxo de entrega não regrediu --');
    const TEL2 = '5511888880000@s.whatsapp.net';
    const falar2 = async t => {
      const n = enviadas.length;
      await handleIncomingMessage(store.id, socket, TEL2, t, { key: {} });
      return enviadas.slice(n).join('\n');
    };
    await falar2('menu');
    const cat2 = await falar2('1');
    await falar2(numeroDaOpcao(cat2, 'Corte') || '1');
    await falar2('Joao Entrega');
    await falar2('2'); // entrega
    await falar2('Rua das Flores, 123');
    await falar2('1'); // sem observações
    const entrega = await prisma.order.findFirst({
      where: { storeId: store.id, customerName: 'Joao Entrega' }, orderBy: { id: 'desc' },
    });
    check('pedido de entrega continua sendo criado', !!entrega, 'nao criado');
    check('entrega mantém scheduledAt nulo (comportamento original)',
      entrega && entrega.scheduledAt === null, 'scheduledAt: ' + entrega?.scheduledAt);
    check('entrega guarda o endereço', !!entrega?.customerAddress, 'endereco vazio');

    console.log('\n-- Robustez --');
    check('mensagem vazia não derruba o handler',
      await (async () => { try { await falar(''); return true; } catch { return false; } })(), 'lançou');
    check('loja inexistente não derruba o handler',
      await (async () => {
        try { await handleIncomingMessage(99999999, socket, TELEFONE, 'oi', { key: {} }); return true; }
        catch { return false; }
      })(), 'lançou');

    return resumo('Bot Baileys');
  } finally {
    await prisma.$disconnect();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
