// Regressão, isolamento entre lojas e concorrência.
//
// Estes testes existem porque a auditoria encontrou dois defeitos que as suítes
// anteriores não pegavam: agendamento para profissional desativado (compromisso
// invisível ao motor) e corrida entre revalidar a disponibilidade e gravar o
// pedido (duas requisições simultâneas criavam dois agendamentos no mesmo slot).
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
  console.log('\n=== Regressão, isolamento e concorrência ===');

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

  const h = token => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token });
  const criarLoja = async (sufixo, comConfig = false) => {
    const u = await prisma.user.create({
      data: { email: `r${sufixo}-${Date.now()}@exemplo.com`, password: await bcrypt.hash('x', 4), name: 'R', emailVerified: true },
    });
    const s = await prisma.store.create({
      data: {
        userId: u.id, name: 'L' + sufixo, slug: `l-${sufixo}-${Date.now()}`, phone: '11999999999',
        ...(comConfig ? { schedulingConfig: JSON.stringify(CONFIG_AGENDA) } : {}),
      },
    });
    return { u, s, token: jwt.sign({ userId: u.id }, process.env.JWT_SECRET) };
  };

  try {
    const A = await criarLoja('a');
    const B = await criarLoja('b');
    const TOKEN = A.token;
    const STORE = A.s;
    async function req(metodo, url, corpo) {
      const r = await fetch(BASE + url, { method: metodo, headers: h(TOKEN), body: corpo ? JSON.stringify(corpo) : undefined });
      let json = null;
      try { json = await r.json(); } catch { /* sem corpo */ }
      return { status: r.status, body: json };
    }
    const SERVICO = await prisma.product.create({
      data: { storeId: STORE.id, name: 'Corte', price: 50, duration: 30, bufferTime: 0 },
    });

    console.log('\n-- Regressão: o que já funcionava continua funcionando --');
    let r = await req('PUT', '/store', {
      name: 'Novo Nome', description: 'desc', phone: '11888887777',
      address: 'Rua X', themeColor: '#123456', businessHours: 'Seg-Sex 9h',
    });
    check('PUT /store ainda salva os campos antigos',
      r.status === 200 && r.body?.name === 'Novo Nome' && r.body?.themeColor === '#123456' && r.body?.businessHours === 'Seg-Sex 9h',
      `status ${r.status}`);

    const cat = await prisma.category.create({ data: { storeId: STORE.id, name: 'Cabelo' } });
    r = await req('PUT', '/products/' + SERVICO.id, { name: 'Corte Novo', price: 77.5, categoryId: cat.id, active: false });
    check('PUT /products ainda atualiza nome, preco, categoria e active',
      r.status === 200 && r.body?.name === 'Corte Novo' && r.body?.price === 77.5 && r.body?.categoryId === cat.id && r.body?.active === false,
      `status ${r.status}`);
    check('PUT /products nao zera duration quando o campo nao e enviado', r.body?.duration === 30, 'virou ' + r.body?.duration);
    await req('PUT', '/products/' + SERVICO.id, { active: true });

    r = await req('POST', '/products', { name: 'Sem duracao', price: 10 });
    check('POST /products sem duration usa o default 30', r.status === 201 && r.body?.duration === 30, 'dur ' + r.body?.duration);
    check('POST /products sem bufferTime usa o default 0', r.body?.bufferTime === 0, 'buffer ' + r.body?.bufferTime);

    r = await req('GET', '/orders');
    check('GET /orders mantem o formato {orders,total,pages}',
      r.status === 200 && Array.isArray(r.body?.orders) && typeof r.body?.total === 'number', `status ${r.status}`);
    r = await req('GET', '/orders/stats');
    check('GET /orders/stats intacto', r.status === 200 && typeof r.body?.pending === 'number', `status ${r.status}`);

    await req('PUT', '/store', { schedulingConfig: JSON.stringify(CONFIG_AGENDA) });
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: null, customerName: 'Reg', customerPhone: '11', date: DATA, time: '09:00' });
    check('agendamento manual funciona', r.status === 201, `status ${r.status}`);
    const orderId = r.body?.id;
    r = await req('PATCH', `/orders/${orderId}/status`, { status: 'confirmed' });
    check('PATCH /orders/:id/status intacto', r.status === 200 && r.body?.status === 'confirmed', `status ${r.status}`);
    r = await req('PATCH', `/orders/${orderId}/status`, { status: 'invalido' });
    check('status invalido continua recusado', r.status === 400, `status ${r.status}`);

    console.log('\n-- Isolamento entre lojas nas rotas novas --');
    const blocoAlheio = await prisma.blockedSlot.create({ data: { storeId: B.s.id, date: DATA, isFullDay: true } });
    r = await req('PATCH', '/blocked-slots/' + blocoAlheio.id, { isFullDay: false, startTime: '10:00', endTime: '11:00' });
    check('PATCH em bloqueio de outra loja devolve 404', r.status === 404, `status ${r.status}`);
    check('bloqueio da outra loja nao foi alterado',
      (await prisma.blockedSlot.findUnique({ where: { id: blocoAlheio.id } })).isFullDay === true, 'foi modificado');
    r = await req('DELETE', '/blocked-slots/' + blocoAlheio.id);
    check('DELETE em bloqueio de outra loja devolve 404', r.status === 404, `status ${r.status}`);

    const proAlheio = await prisma.professional.create({ data: { storeId: B.s.id, name: 'Alheio', active: true } });
    const meuBloco = await prisma.blockedSlot.create({ data: { storeId: STORE.id, date: DATA, isFullDay: true } });
    r = await req('PATCH', '/blocked-slots/' + meuBloco.id, { professionalId: proAlheio.id });
    check('PATCH nao aceita profissional de outra loja', r.status === 400 || r.status === 404, `status ${r.status}`);
    r = await req('POST', '/orders/manual', { productId: SERVICO.id, professionalId: proAlheio.id, customerName: 'X', customerPhone: '1', date: DATA, time: '14:00' });
    check('agendamento nao aceita profissional de outra loja', r.status === 404 || r.status === 400, `status ${r.status}`);
    await prisma.blockedSlot.delete({ where: { id: meuBloco.id } });

    r = await req('GET', `/orders/agenda?start=${DATA}&end=${DATA}`);
    check('a agenda nao vaza pedidos de outra loja',
      !(Array.isArray(r.body) && r.body.some(o => o.storeId !== STORE.id)), 'vazou pedido de outro tenant');

    console.log('\n-- Profissional desativado --');
    const C = await criarLoja('c', true);
    const servC = await prisma.product.create({ data: { storeId: C.s.id, name: 'S', price: 10, duration: 30, bufferTime: 0 } });
    const ativo = await prisma.professional.create({ data: { storeId: C.s.id, name: 'Ativo', active: true } });
    const inativo = await prisma.professional.create({ data: { storeId: C.s.id, name: 'Inativo', active: false } });

    check('loja com um profissional ativo gera horarios',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, null)).length > 0, 'nenhum horario');
    await prisma.blockedSlot.create({ data: { storeId: C.s.id, date: DATA, isFullDay: true, professionalId: ativo.id } });
    check('unico ativo de folga esvazia a busca "qualquer" (inativo nao conta)',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, null)).length === 0, 'ofereceu horarios');
    await prisma.professional.update({ where: { id: inativo.id }, data: { active: true } });
    check('ativar o segundo profissional traz a agenda de volta',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, null)).length > 0, 'continua vazia');
    await prisma.professional.update({ where: { id: inativo.id }, data: { active: false } });

    check('consultar profissional inativo nao oferece horarios',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, inativo.id)).length === 0, 'ofereceu horarios');
    check('profissional inexistente nao oferece horarios',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, 99999999)).length === 0, 'ofereceu horarios');
    check('profissional de outra loja nao oferece horarios',
      (await AV.getAvailableSlots(prisma, C.s.id, DATA, servC.id, proAlheio.id)).length === 0, 'ofereceu horarios');

    let rr = await fetch(BASE + `/availability/slots?date=${DATA}&serviceId=${servC.id}&professionalId=${inativo.id}`, { headers: h(C.token) });
    let bb = await rr.json();
    check('a rota devolve lista vazia para profissional inativo',
      rr.status === 200 && (bb.slots || []).length === 0, JSON.stringify(bb.slots));

    rr = await fetch(BASE + '/orders/manual', {
      method: 'POST', headers: h(C.token),
      body: JSON.stringify({ productId: servC.id, professionalId: inativo.id, customerName: 'X', customerPhone: '1', date: DATA, time: '10:00' }),
    });
    bb = await rr.json();
    check('agendar para profissional desativado e recusado com mensagem clara',
      rr.status === 400 && /desativado/i.test(bb.error || ''), `status ${rr.status} ${JSON.stringify(bb)}`);
    check('nenhum pedido fantasma foi criado',
      (await prisma.order.count({ where: { storeId: C.s.id, professionalId: inativo.id } })) === 0, 'pedido criado');

    console.log('\n-- Concorrência --');
    const D = await criarLoja('d', true);
    const servD = await prisma.product.create({ data: { storeId: D.s.id, name: 'S', price: 10, duration: 30, bufferTime: 0 } });
    const corpo = t => JSON.stringify({ productId: servD.id, professionalId: null, customerName: 'C', customerPhone: '1', date: DATA, time: t });
    const enviar = (token, body) => fetch(BASE + '/orders/manual', { method: 'POST', headers: h(token), body });

    const respostas = await Promise.all(Array.from({ length: 10 }, () => enviar(D.token, corpo('11:00'))));
    const status = respostas.map(x => x.status);
    check('10 requisicoes simultaneas no mesmo horario criam apenas 1 pedido',
      (await prisma.order.count({ where: { storeId: D.s.id, scheduledAt: AV.buildScheduledAt(DATA, '11:00') } })) === 1,
      'status: ' + status.join(','));
    check('as 9 perdedoras recebem 409 (nao 500)',
      status.filter(s => s === 201).length === 1 && status.filter(s => s === 409).length === 9, status.join(','));

    const distintos = await Promise.all(['13:00', '13:30', '14:00', '14:30', '15:00'].map(t => enviar(D.token, corpo(t))));
    check('horarios distintos em paralelo sao todos aceitos',
      distintos.every(x => x.status === 201), distintos.map(x => x.status).join(','));

    await enviar(D.token, corpo('11:00')); // recusa proposital
    check('a fila da loja continua viva depois de uma recusa',
      (await enviar(D.token, corpo('16:00'))).status === 201, 'fila travou');

    const E = await criarLoja('e', true);
    const servE = await prisma.product.create({ data: { storeId: E.s.id, name: 'S', price: 10, duration: 30, bufferTime: 0 } });
    const [rD, rE] = await Promise.all([
      enviar(D.token, corpo('17:00')),
      enviar(E.token, JSON.stringify({ productId: servE.id, professionalId: null, customerName: 'C', customerPhone: '1', date: DATA, time: '17:00' })),
    ]);
    check('lojas diferentes no mesmo horario nao se bloqueiam',
      rD.status === 201 && rE.status === 201, `${rD.status} / ${rE.status}`);

    return resumo('Regressão, isolamento e concorrência');
  } finally {
    await prisma.$disconnect();
    server.close();
    banco.remover();
  }
};

if (require.main === module) {
  module.exports().then(r => { process.exitCode = r.fail ? 1 : 0; });
}
