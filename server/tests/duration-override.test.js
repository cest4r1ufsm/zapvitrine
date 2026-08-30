// Duração personalizada por atendimento.
//
// O profissional pode julgar que um serviço específico precisa de mais tempo
// que o padrão cadastrado. O tempo escolhido tem de valer em TODA a cadeia:
// na busca de horários, na revalidação ao gravar, e na ocupação que esse
// atendimento passa a exercer sobre os próximos.
const { criarRunner, criarBancoTemporario, proximaSegunda } = require('./helpers');

const banco = criarBancoTemporario(); // antes de carregar o Prisma

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const AV = require('../src/utils/availability');

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
  console.log('\n=== Duração personalizada por atendimento ===');

  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/routes/orders'));
  app.use('/api/availability', require('../src/routes/availability'));

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
  const has = (lista, h) => Array.isArray(lista) && lista.includes(h);

  try {
    const user = await prisma.user.create({
      data: { email: `dur-${Date.now()}@exemplo.com`, password: await bcrypt.hash('x', 4), name: 'D', emailVerified: true },
    });
    const store = await prisma.store.create({
      data: {
        userId: user.id, name: 'Loja Duracao', slug: 'dur-' + Date.now(), phone: '11999999999',
        schedulingConfig: JSON.stringify(CONFIG_AGENDA),
      },
    });
    // Serviço de 30min sem intervalo
    const servico = await prisma.product.create({
      data: { storeId: store.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0, active: true },
    });
    TOKEN = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    console.log('\n-- A busca de horários respeita a duração pedida --');
    let r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${servico.id}`);
    const padrao = r.body?.slots || [];
    check('sem duração informada, usa o padrão do serviço (último slot 17:30)',
      padrao[padrao.length - 1] === '17:30', 'último: ' + padrao[padrao.length - 1]);

    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${servico.id}&duration=120`);
    const longo = r.body?.slots || [];
    check('com 120min, o último slot recua para 16:00',
      longo[longo.length - 1] === '16:00', 'último: ' + longo[longo.length - 1]);
    check('com 120min ainda sobram horários', longo.length > 0, 'lista vazia');

    console.log('\n-- Validação da duração --');
    for (const [nome, valor] of [['zero', '0'], ['negativa', '-30'], ['texto', 'abc'], ['acima do limite', '2000']]) {
      const rr = await req('GET', `/availability/slots?date=${DATA}&serviceId=${servico.id}&duration=${valor}`);
      check(`duração ${nome} recusada com 400`, rr.status === 400, `status ${rr.status}`);
    }
    r = await req('POST', '/orders/manual', {
      productId: servico.id, customerName: 'X', customerPhone: '11', date: DATA, time: '10:00', duration: 0,
    });
    check('agendar com duração 0 devolve 400', r.status === 400, `status ${r.status}`);

    console.log('\n-- Um atendimento estendido ocupa o tempo maior --');
    r = await req('POST', '/orders/manual', {
      productId: servico.id, customerName: 'Cliente Longo', customerPhone: '11988887777',
      date: DATA, time: '10:00', duration: 90,
    });
    check('agendamento de 90min criado', r.status === 201, `status ${r.status} ${JSON.stringify(r.body)?.slice(0, 180)}`);
    check('durationOverride gravado', r.body?.durationOverride === 90, 'valor: ' + r.body?.durationOverride);

    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${servico.id}`);
    const depois = r.body?.slots || [];
    check('10:00 ocupado', !has(depois, '10:00'), depois.join(','));
    check('10:30 ocupado pelo tempo estendido', !has(depois, '10:30'), depois.join(','));
    check('11:00 ocupado pelo tempo estendido', !has(depois, '11:00'), depois.join(','));
    check('11:30 livre novamente (10:00 + 90min = 11:30)', has(depois, '11:30'), depois.join(','));
    check('09:30 continua livre (termina 10:00, só encosta)', has(depois, '09:30'), depois.join(','));

    console.log('\n-- Não dá para agendar por cima do tempo estendido --');
    r = await req('POST', '/orders/manual', {
      productId: servico.id, customerName: 'Invasor', customerPhone: '11955554444',
      date: DATA, time: '11:00',
    });
    check('agendar às 11:00 devolve 409', r.status === 409, `status ${r.status}`);

    console.log('\n-- Duração menor que o padrão também vale --');
    r = await req('POST', '/orders/manual', {
      productId: servico.id, customerName: 'Cliente Rapido', customerPhone: '11933332222',
      date: DATA, time: '11:30', duration: 15,
    });
    check('agendamento de 15min criado', r.status === 201, `status ${r.status}`);
    check('durationOverride de 15min gravado', r.body?.durationOverride === 15, 'valor: ' + r.body?.durationOverride);

    console.log('\n-- Sem alteração, não grava override --');
    r = await req('POST', '/orders/manual', {
      productId: servico.id, customerName: 'Cliente Padrao', customerPhone: '11922221111',
      date: DATA, time: '14:00', duration: 30, // igual ao padrão do serviço
    });
    check('agendamento com a duração padrão criado', r.status === 201, `status ${r.status}`);
    check('durationOverride fica nulo quando igual ao padrão',
      r.body?.durationOverride === null, 'valor: ' + r.body?.durationOverride);

    console.log('\n-- O intervalo do serviço continua somando --');
    const comBuffer = await prisma.product.create({
      data: { storeId: store.id, name: 'Com Intervalo', price: 60, duration: 30, bufferTime: 30, active: true },
    });
    r = await req('POST', '/orders/manual', {
      productId: comBuffer.id, customerName: 'Buffer', customerPhone: '11911110000',
      date: DATA, time: '15:00', duration: 60,
    });
    check('agendamento com override 60 + intervalo 30 criado', r.status === 201, `status ${r.status}`);
    const slotsBuffer = (await req('GET', `/availability/slots?date=${DATA}&serviceId=${servico.id}`)).body?.slots || [];
    check('16:00 ocupado (15:00 + 60min de atendimento + 30min de intervalo = 16:30)',
      !has(slotsBuffer, '16:00'), slotsBuffer.join(','));
    check('16:30 livre novamente', has(slotsBuffer, '16:30'), slotsBuffer.join(','));

    console.log('\n-- A grade da agenda recebe o campo --');
    r = await req('GET', `/orders/agenda?start=${DATA}&end=${DATA}`);
    const longoNaAgenda = Array.isArray(r.body) ? r.body.find(o => o.customerName === 'Cliente Longo') : null;
    check('o pedido estendido aparece na agenda', !!longoNaAgenda, 'nao apareceu');
    check('a agenda expõe durationOverride (a grade desenha a altura com ele)',
      longoNaAgenda?.durationOverride === 90, 'valor: ' + longoNaAgenda?.durationOverride);

    console.log('\n-- Compatibilidade: pedidos antigos sem override --');
    const semOverride = await AV.getAvailableSlots(prisma, store.id, DATA, servico.id, null);
    check('o motor continua funcionando com pedidos sem override',
      Array.isArray(semOverride) && semOverride.length > 0, 'lista vazia');

    return resumo('Duração personalizada');
  } finally {
    await prisma.$disconnect();
    server.close();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
