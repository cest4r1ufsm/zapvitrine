// Testes de unidade do motor de disponibilidade (sem banco, sem rede).
//
// Cobre a queixa original do cliente — "os breaks entre atendimentos bugam" —
// e as classes de defeito que a causavam: bloqueio inválido aceito em silêncio,
// configuração de horário parcial derrubando a rota com 500, e vazamento de
// agenda entre profissionais.
const AV = require('../src/utils/availability');
const { criarRunner, criarPrismaFalso, configPadrao, proximaSegunda } = require('./helpers');

const DATA = proximaSegunda();
const { check, naoLanca, resumo } = criarRunner();

function slots(opts = {}, profId = null) {
  const prisma = criarPrismaFalso({
    store: { id: 1, schedulingConfig: 'cfg' in opts ? opts.cfg : configPadrao() },
    service: { id: 1, storeId: 1, duration: opts.duration ?? 30, bufferTime: opts.buffer ?? 0 },
    professionals: opts.professionals || [],
    blocks: (opts.blocks || []).map((b, i) => ({
      id: i + 1, storeId: 1, professionalId: null, isFullDay: false,
      isRecurring: false, date: DATA, startTime: null, endTime: null, ...b,
    })),
    orders: (opts.orders || []).map(o => ({
      storeId: 1, professionalId: null, status: 'confirmed',
      product: { duration: 30, bufferTime: 0 }, ...o,
    })),
  });
  return AV.getAvailableSlots(prisma, 1, DATA, 1, profId);
}

const tem = (lista, horario) => Array.isArray(lista) && lista.includes(horario);

module.exports = async function run() {
  console.log('\n=== Motor de disponibilidade (unidade) ===');

  console.log('\n-- Breaks entre atendimentos --');
  check('break 12:00-13:00 remove 12:00 e 12:30',
    await slots({ blocks: [{ startTime: '12:00', endTime: '13:00' }] })
      .then(s => !tem(s, '12:00') && !tem(s, '12:30') && tem(s, '13:00') && tem(s, '11:00')),
    'o intervalo deve remover exatamente a faixa coberta');

  check('break 12:00-13:00 mantem 11:30 (encosta, nao sobrepoe)',
    await slots({ blocks: [{ startTime: '12:00', endTime: '13:00' }] }).then(s => tem(s, '11:30')),
    '11:30 + 30min termina exatamente as 12:00');

  check('servico de 60min com break 12:00-13:00 remove 11:30',
    await slots({ duration: 60, blocks: [{ startTime: '12:00', endTime: '13:00' }] })
      .then(s => !tem(s, '11:30') && tem(s, '11:00')),
    '11:30 + 60min invadiria o intervalo');

  check('bufferTime empurra o proximo atendimento',
    await slots({ duration: 30, buffer: 30, blocks: [{ startTime: '12:00', endTime: '13:00' }] })
      .then(s => !tem(s, '11:30')),
    '30min de servico + 30min de intervalo invadem o break');

  check('break recorrente por dia da semana e aplicado',
    await slots({ blocks: [{ date: 'monday', isRecurring: true, startTime: '12:00', endTime: '13:00' }] })
      .then(s => !tem(s, '12:00')),
    'bloqueio recorrente de segunda deve valer em ' + DATA);

  check('dois breaks no mesmo dia somam',
    await slots({ blocks: [{ startTime: '10:00', endTime: '11:00' }, { startTime: '15:00', endTime: '16:00' }] })
      .then(s => !tem(s, '10:00') && !tem(s, '15:00') && tem(s, '11:00') && tem(s, '16:00')),
    'ambos os intervalos devem ser respeitados');

  check('bloqueio de dia inteiro zera a agenda',
    await slots({ blocks: [{ isFullDay: true }] }).then(s => s.length === 0), 'dia todo bloqueado');

  console.log('\n-- Bloqueios malformados nao podem derrubar a rota --');
  const bloqueiosRuins = [
    ['invertido 13:00-12:00', { startTime: '13:00', endTime: '12:00' }],
    ['endTime vazio', { startTime: '12:00', endTime: '' }],
    ['sem horarios', { startTime: null, endTime: null }],
    ['inicio igual ao fim', { startTime: '12:00', endTime: '12:00' }],
    ['formato invalido "9h"', { startTime: '9h', endTime: '10h' }],
  ];
  for (const [nome, bloco] of bloqueiosRuins) {
    check(`bloqueio ${nome} nao lanca excecao`,
      await naoLanca(() => slots({ blocks: [bloco] })), 'lancou excecao');
  }

  console.log('\n-- Configuracao de agenda corrompida nao pode virar 500 --');
  const configsRuins = [
    ['dia ativo sem close', JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, open: '09:00' } } })],
    ['dia ativo sem open', JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, close: '18:00' } } })],
    ['sem a chave hours', JSON.stringify({ slotInterval: 30 })],
    ['hours nulo', JSON.stringify({ slotInterval: 30, hours: null })],
    ['dia nulo', JSON.stringify({ slotInterval: 30, hours: { monday: null } })],
    ['JSON invalido', '{{{nao-json'],
    ['abertura depois do fechamento', JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, open: '19:00', close: '09:00' } } })],
    ['horas invalidas', JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, open: '25:99', close: 'abc' } } })],
    ['slotInterval 0', configPadrao({ slotInterval: 0 })],
    ['slotInterval negativo', configPadrao({ slotInterval: -5 })],
    ['config nula', null],
  ];
  for (const [nome, cfg] of configsRuins) {
    check(`config "${nome}" nao lanca excecao`, await naoLanca(() => slots({ cfg })), 'lancou excecao');
  }

  console.log('\n-- Semantica de profissional --');
  const EQUIPE = [{ id: 5, storeId: 1, active: true }, { id: 6, storeId: 1, active: true }];

  check('folga do unico profissional esvazia a busca "qualquer"',
    await slots({ professionals: [{ id: 5, storeId: 1, active: true }], blocks: [{ isFullDay: true, professionalId: 5 }] }, null)
      .then(s => s.length === 0), 'nao pode oferecer horario sem ninguem disponivel');

  check('com dois profissionais, a folga de um mantem a agenda do outro',
    await slots({ professionals: EQUIPE, blocks: [{ isFullDay: true, professionalId: 5 }] }, null)
      .then(s => s.length > 0), 'o profissional 6 continua livre');

  check('pedido de um profissional nao bloqueia o outro',
    await slots({ professionals: EQUIPE, orders: [{ professionalId: 5, scheduledAt: new Date(DATA + 'T10:00:00.000Z') }] }, null)
      .then(s => tem(s, '10:00')), 'apenas 1 dos 2 esta ocupado');

  check('com os dois ocupados, o horario some',
    await slots({ professionals: EQUIPE, orders: [
      { professionalId: 5, scheduledAt: new Date(DATA + 'T10:00:00.000Z') },
      { professionalId: 6, scheduledAt: new Date(DATA + 'T10:00:00.000Z') },
    ] }, null).then(s => !tem(s, '10:00')), 'equipe inteira ocupada as 10:00');

  check('bloqueio global vale para profissional especifico',
    await slots({ professionals: EQUIPE, blocks: [{ startTime: '12:00', endTime: '13:00', professionalId: null }] }, 5)
      .then(s => !tem(s, '12:00')), 'bloqueio de "todos" deve alcancar o profissional 5');

  check('bloqueio individual nao vaza para outro profissional',
    await slots({ professionals: EQUIPE, blocks: [{ startTime: '12:00', endTime: '13:00', professionalId: 5 }] }, 6)
      .then(s => tem(s, '12:00')), 'bloqueio do 5 nao pode afetar o 6');

  check('pedido legado sem profissional ocupa todos',
    await slots({ professionals: EQUIPE, orders: [{ professionalId: null, scheduledAt: new Date(DATA + 'T10:00:00.000Z') }] }, 5)
      .then(s => !tem(s, '10:00')), 'pedido antigo do bot deve ocupar');

  check('loja sem equipe funciona como recurso unico',
    await slots({ professionals: [], orders: [{ professionalId: null, scheduledAt: new Date(DATA + 'T10:00:00.000Z') }] }, null)
      .then(s => !tem(s, '10:00')), 'sem profissionais, qualquer pedido ocupa');

  check('pedido cancelado libera o horario',
    await slots({ professionals: [], orders: [{ status: 'cancelled', scheduledAt: new Date(DATA + 'T10:00:00.000Z') }] }, null)
      .then(s => tem(s, '10:00')), 'cancelado nao ocupa');

  check('profissional inativo nao recebe horarios',
    await slots({ professionals: [{ id: 5, storeId: 1, active: false }] }, 5).then(s => s.length === 0),
    'agendar para inativo cria compromisso invisivel ao motor');

  check('profissional inexistente nao recebe horarios',
    await slots({ professionals: [{ id: 5, storeId: 1, active: true }] }, 999999).then(s => s.length === 0),
    'id desconhecido deve devolver lista vazia');

  console.log('\n-- Fronteiras e aritmetica --');
  check('nenhum slot ultrapassa o horario de fechamento',
    await slots({ duration: 60 }).then(s => s.every(t => AV.timeToMinutes(t) + 60 <= AV.timeToMinutes('18:00'))),
    'servico de 60min nao pode comecar depois das 17:00');

  check('a grade comeca no horario de abertura',
    await slots().then(s => s[0] === '09:00'), 'primeiro slot deve ser 09:00');

  check('sabado usa o proprio horario (fecha 13:00)',
    await (async () => {
      const prisma = criarPrismaFalso({
        store: { id: 1, schedulingConfig: configPadrao() },
        service: { id: 1, storeId: 1, duration: 30, bufferTime: 0 },
      });
      const sabado = new Date(DATA + 'T12:00:00Z');
      sabado.setUTCDate(sabado.getUTCDate() + 5);
      const s = await AV.getAvailableSlots(prisma, 1, sabado.toISOString().slice(0, 10), 1, null);
      return s.length > 0 && s[s.length - 1] === '12:30';
    })(), 'ultimo slot do sabado deve ser 12:30');

  check('domingo inativo devolve lista vazia',
    await (async () => {
      const prisma = criarPrismaFalso({
        store: { id: 1, schedulingConfig: configPadrao() },
        service: { id: 1, storeId: 1, duration: 30, bufferTime: 0 },
      });
      const domingo = new Date(DATA + 'T12:00:00Z');
      domingo.setUTCDate(domingo.getUTCDate() + 6);
      return (await AV.getAvailableSlots(prisma, 1, domingo.toISOString().slice(0, 10), 1, null)).length === 0;
    })(), 'domingo esta fechado na config padrao');

  check('data malformada degrada em vez de estourar',
    await naoLanca(async () => {
      const prisma = criarPrismaFalso({
        store: { id: 1, schedulingConfig: configPadrao() },
        service: { id: 1, storeId: 1, duration: 30, bufferTime: 0 },
      });
      return AV.getAvailableSlots(prisma, 1, 'xyz', 1, null);
    }), 'data invalida nao pode lancar');

  console.log('\n-- timeToMinutes --');
  check('HH:MM valido', AV.timeToMinutes('12:30') === 750, 'esperado 750');
  check('meia-noite', AV.timeToMinutes('00:00') === 0, 'esperado 0');
  check('entrada invalida vira null (nunca NaN silencioso)', AV.timeToMinutes('9h') === null, 'deve devolver null');
  check('undefined nao lanca', (() => { try { AV.timeToMinutes(undefined); return true; } catch { return false; } })(), 'nao pode lancar');
  check('null nao lanca', (() => { try { AV.timeToMinutes(null); return true; } catch { return false; } })(), 'nao pode lancar');

  console.log('\n-- Isolamento entre lojas --');
  check('servico de outra loja nao gera horarios',
    await (async () => {
      const prisma = criarPrismaFalso({
        store: { id: 1, schedulingConfig: configPadrao() },
        service: { id: 1, storeId: 99, duration: 30, bufferTime: 0 },
      });
      return (await AV.getAvailableSlots(prisma, 1, DATA, 1, null)).length === 0;
    })(), 'produto de outra loja deve devolver lista vazia');

  return resumo('Motor de disponibilidade');
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
