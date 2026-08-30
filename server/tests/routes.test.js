// Testes de integração das rotas de agenda: Express real, Prisma real, sobre
// uma CÓPIA descartável de prisma/dev.db. Nada aqui toca o banco do projeto.
const { criarRunner, criarBancoTemporario, proximaSegunda } = require('./helpers');

const banco = criarBancoTemporario(); // precisa vir antes de carregar o Prisma

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const DATA = proximaSegunda();
const { check, resumo } = criarRunner();

const CONFIG_AGENDA = {
  slotInterval: 30,
  hours: {
    sunday:    { active: false, open: '09:00', close: '18:00' },
    monday:    { active: true,  open: '08:00', close: '20:00' },
    tuesday:   { active: true,  open: '09:00', close: '18:00' },
    wednesday: { active: true,  open: '09:00', close: '18:00' },
    thursday:  { active: true,  open: '09:00', close: '18:00' },
    friday:    { active: true,  open: '09:00', close: '18:00' },
    saturday:  { active: true,  open: '09:00', close: '13:00' },
  },
};

module.exports = async function run() {
  console.log('\n=== Rotas de agenda (integração HTTP) ===');

  const app = express();
  app.use(express.json());
  app.use('/api/store', require('../src/routes/store'));
  app.use('/api/products', require('../src/routes/products'));
  app.use('/api/blocked-slots', require('../src/routes/blocked-slots'));
  app.use('/api/availability', require('../src/routes/availability'));
  app.use('/api/orders', require('../src/routes/orders'));
  app.use('/api/professionals', require('../src/routes/professionals'));

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const BASE = 'http://127.0.0.1:' + server.address().port + '/api';

  let TOKEN;
  const cabecalhos = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN });
  async function req(metodo, url, corpo) {
    const r = await fetch(BASE + url, {
      method: metodo, headers: cabecalhos(),
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch { /* resposta sem corpo */ }
    return { status: r.status, body: json };
  }

  const criarLoja = async (sufixo) => {
    const u = await prisma.user.create({
      data: { email: `t${sufixo}-${Date.now()}@exemplo.com`, password: await bcrypt.hash('x', 4), name: 'T', emailVerified: true },
    });
    const s = await prisma.store.create({
      data: { userId: u.id, name: 'Loja ' + sufixo, slug: `loja-${sufixo}-${Date.now()}`, phone: '11999999999' },
    });
    return { u, s, token: jwt.sign({ userId: u.id }, process.env.JWT_SECRET) };
  };

  try {
    const A = await criarLoja('a');
    const B = await criarLoja('b');
    TOKEN = A.token;
    const STORE = A.s;
    const SERVICO = await prisma.product.create({
      data: { storeId: STORE.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0 },
    });
    const PRO = await prisma.professional.create({ data: { storeId: STORE.id, name: 'Joao', active: true } });

    console.log('\n-- Configuração de agenda persiste --');
    let r = await req('PUT', '/store', { name: 'Loja A', schedulingConfig: JSON.stringify(CONFIG_AGENDA) });
    check('PUT /store aceita schedulingConfig', r.status === 200, `status ${r.status}`);
    const salva = await prisma.store.findUnique({ where: { id: STORE.id } });
    check('schedulingConfig chega ao banco', !!salva.schedulingConfig, 'continua nulo');
    check('segunda gravada como 08:00-20:00',
      JSON.parse(salva.schedulingConfig).hours.monday.open === '08:00', salva.schedulingConfig);

    r = await req('PUT', '/store', { schedulingConfig: JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, open: '19:00', close: '09:00' } } }) });
    check('abertura depois do fechamento e recusada', r.status === 400, `status ${r.status}`);
    r = await req('PUT', '/store', { schedulingConfig: JSON.stringify({ slotInterval: 30, hours: { monday: { active: true, open: '09:00' } } }) });
    check('dia ativo sem fechamento e recusado', r.status === 400, `status ${r.status}`);
    r = await req('PUT', '/store', { name: 'Loja A2' });
    check('PUT sem schedulingConfig preserva a config',
      !!(await prisma.store.findUnique({ where: { id: STORE.id } })).schedulingConfig, 'a config foi apagada');

    console.log('\n-- Duração e intervalo do serviço persistem --');
    r = await req('POST', '/products', { name: 'Barba', price: 40, duration: 45, bufferTime: 15 });
    check('POST /products aceita duration e bufferTime', r.status === 201, `status ${r.status}`);
    check('duration persistido', r.body?.duration === 45, 'veio ' + r.body?.duration);
    check('bufferTime persistido', r.body?.bufferTime === 15, 'veio ' + r.body?.bufferTime);
    const prodId = r.body?.id;
    r = await req('PUT', '/products/' + prodId, { bufferTime: 20 });
    check('PUT /products atualiza bufferTime', r.body?.bufferTime === 20, 'veio ' + r.body?.bufferTime);
    check('PUT /products preserva duration nao enviado', r.body?.duration === 45, 'veio ' + r.body?.duration);
    r = await req('POST', '/products', { name: 'X', price: 10, duration: 0 });
    check('duration 0 e recusado', r.status === 400, `status ${r.status}`);
    r = await req('POST', '/products', { name: 'X', price: 10, bufferTime: -5 });
    check('bufferTime negativo e recusado', r.status === 400, `status ${r.status}`);

    console.log('\n-- Validação de bloqueios --');
    const invalidos = [
      ['intervalo invertido', { date: DATA, isFullDay: false, startTime: '13:00', endTime: '12:00' }],
      ['fim vazio', { date: DATA, isFullDay: false, startTime: '12:00', endTime: '' }],
      ['sem horarios', { date: DATA, isFullDay: false }],
      ['inicio igual ao fim', { date: DATA, isFullDay: false, startTime: '12:00', endTime: '12:00' }],
      ['hora malformada', { date: DATA, isFullDay: false, startTime: '9h', endTime: '10h' }],
      ['data em formato brasileiro', { date: '07/09/2026', isFullDay: true }],
      ['recorrente com data', { date: DATA, isRecurring: true, isFullDay: true }],
      ['dia da semana capitalizado', { date: 'Monday', isRecurring: true, isFullDay: true }],
      ['data inexistente', { date: '2026-02-30', isFullDay: true }],
    ];
    for (const [nome, corpo] of invalidos) {
      const rr = await req('POST', '/blocked-slots', corpo);
      check(`bloqueio "${nome}" recusado com 400`, rr.status === 400, `status ${rr.status}`);
    }

    r = await req('POST', '/blocked-slots', { date: DATA, isFullDay: false, startTime: '12:00', endTime: '13:00', reason: 'Almoco' });
    check('break valido criado', r.status === 201, `status ${r.status}`);
    const breakId = r.body?.id;
    r = await req('POST', '/blocked-slots', { date: DATA, isFullDay: false, startTime: '12:00', endTime: '13:00', reason: 'Almoco' });
    check('break duplicado recusado com 409', r.status === 409, `status ${r.status}`);
    r = await req('DELETE', '/blocked-slots/abc');
    check('id nao numerico devolve 400 (nao 500)', r.status === 400, `status ${r.status}`);

    console.log('\n-- O break realmente remove horários --');
    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${SERVICO.id}`);
    const grade = r.body?.slots || [];
    check('rota responde 200', r.status === 200, `status ${r.status}`);
    check('grade comeca no horario configurado (08:00)', grade[0] === '08:00', 'primeiro: ' + grade[0]);
    check('12:00 bloqueado', !grade.includes('12:00'), grade.join(','));
    check('12:30 bloqueado', !grade.includes('12:30'), grade.join(','));
    check('13:00 livre', grade.includes('13:00'), grade.join(','));
    check('11:30 livre (apenas encosta no break)', grade.includes('11:30'), grade.join(','));

    console.log('\n-- Agendamento manual --');
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: null, customerName: 'Cliente A', customerPhone: '11988887777', date: DATA, time: '12:00' });
    check('agendar dentro do break devolve 409', r.status === 409, `status ${r.status}`);
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: null, customerName: 'Cliente A', customerPhone: '11988887777', date: DATA, time: '10:00', notes: 'teste' });
    check('agendar em horario livre devolve 201', r.status === 201, `status ${r.status} ${JSON.stringify(r.body)?.slice(0, 160)}`);
    const orderId = r.body?.id;
    check('scheduledAt gravado', !!r.body?.scheduledAt, 'ficou nulo');
    check('scheduledAt aponta para 10:00 BRT',
      r.body?.scheduledAt && new Date(r.body.scheduledAt).getUTCHours() === 10, String(r.body?.scheduledAt));
    check('resposta traz o produto', !!r.body?.product, 'sem product');
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: null, customerName: 'Cliente B', customerPhone: '11977776666', date: DATA, time: '10:00' });
    check('overbooking no mesmo horario devolve 409', r.status === 409, `status ${r.status}`);
    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${SERVICO.id}`);
    check('horario agendado sai da disponibilidade', !(r.body?.slots || []).includes('10:00'), (r.body?.slots || []).join(','));
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: null, customerName: 'C', customerPhone: '1', date: DATA, time: '25:99' });
    check('horario malformado devolve 400', r.status === 400, `status ${r.status}`);
    r = await req('POST', '/orders/manual', { productId: 999999, professionalId: null, customerName: 'C', customerPhone: '1', date: DATA, time: '10:30' });
    check('servico inexistente devolve 404', r.status === 404, `status ${r.status}`);

    console.log('\n-- Grade da agenda --');
    r = await req('GET', `/orders/agenda?start=${DATA}&end=${DATA}`);
    check('GET /orders/agenda responde 200', r.status === 200, `status ${r.status}`);
    check('devolve um array (a UI faz Array.isArray)', Array.isArray(r.body), 'tipo ' + typeof r.body);
    check('inclui o pedido criado', Array.isArray(r.body) && r.body.some(o => o.id === orderId), 'pedido ausente');
    const item = Array.isArray(r.body) ? r.body.find(o => o.id === orderId) : null;
    check('item traz product.duration (a grade dimensiona por ele)', item?.product?.duration === 30, String(item?.product?.duration));
    check('item traz o campo professional', item && 'professional' in item, 'chave ausente');
    r = await req('GET', '/orders/agenda?start=xx&end=yy');
    check('datas invalidas devolvem 400', r.status === 400, `status ${r.status}`);
    r = await req('GET', `/orders/agenda?start=${DATA}&end=2020-01-01`);
    check('fim antes do inicio devolve 400', r.status === 400, `status ${r.status}`);

    console.log('\n-- Bloqueio recorrente --');
    r = await req('POST', '/blocked-slots', { date: 'monday', isRecurring: true, isFullDay: false, startTime: '15:00', endTime: '16:00' });
    check('break recorrente criado', r.status === 201, `status ${r.status}`);
    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${SERVICO.id}`);
    check('recorrente bloqueia 15:00', !(r.body?.slots || []).includes('15:00'), (r.body?.slots || []).join(','));

    console.log('\n-- Listagem e edição de bloqueios --');
    r = await req('GET', '/blocked-slots');
    check('lista os bloqueios', Array.isArray(r.body) && r.body.length >= 2, 'retorno inesperado');
    r = await req('GET', `/blocked-slots?professionalId=${PRO.id}`);
    check('filtro por profissional inclui os globais', Array.isArray(r.body) && r.body.length >= 2, 'globais sumiram');
    r = await req('GET', '/blocked-slots?professionalId=abc');
    check('professionalId invalido devolve 400 (nao 500)', r.status === 400, `status ${r.status}`);
    r = await req('PATCH', '/blocked-slots/' + breakId, { startTime: '12:00', endTime: '14:00' });
    check('PATCH edita o break', r.status === 200, `status ${r.status}`);
    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${SERVICO.id}`);
    check('break ampliado bloqueia 13:30', !(r.body?.slots || []).includes('13:30'), (r.body?.slots || []).join(','));
    r = await req('PATCH', '/blocked-slots/' + breakId, { startTime: '15:00', endTime: '14:00' });
    check('PATCH invertido devolve 400', r.status === 400, `status ${r.status}`);

    console.log('\n-- Isolamento entre lojas --');
    const proAlheio = await prisma.professional.create({ data: { storeId: B.s.id, name: 'Alheio', active: true } });
    const servAlheio = await prisma.product.create({ data: { storeId: B.s.id, name: 'Alheio', price: 99, duration: 90 } });
    r = await req('POST', '/blocked-slots', { date: DATA, isFullDay: true, professionalId: proAlheio.id });
    check('bloqueio com profissional de outra loja recusado', r.status === 400 || r.status === 404, `status ${r.status}`);
    check('nada gravado apontando para a outra loja',
      !(await prisma.blockedSlot.findFirst({ where: { storeId: STORE.id, professionalId: proAlheio.id } })), 'registro cross-tenant criado');
    r = await req('GET', `/availability/slots?date=${DATA}&serviceId=${servAlheio.id}`);
    check('servico de outra loja nao gera horarios', r.status === 200 && (r.body?.slots || []).length === 0, JSON.stringify(r.body?.slots));
    r = await req('POST', '/orders/manual', { productId: servAlheio.id, professionalId: null, customerName: 'X', customerPhone: '1', date: DATA, time: '10:30' });
    check('agendar servico de outra loja devolve 404', r.status === 404, `status ${r.status}`);

    return resumo('Rotas de agenda');
  } finally {
    await prisma.$disconnect();
    server.close();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
