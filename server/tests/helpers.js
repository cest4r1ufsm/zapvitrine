// Infraestrutura comum dos testes.
//
// O projeto não tinha suíte de testes. Estas rodam sem rede e sem tocar o
// banco de desenvolvimento: os testes de unidade usam um Prisma falso e os de
// rota usam uma CÓPIA descartável de prisma/dev.db.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_DIR = path.join(__dirname, '..');
const DEV_DB = path.join(SERVER_DIR, 'prisma', 'dev.db');

// ─── mini runner ────────────────────────────────────────────────────────────

function criarRunner() {
  let pass = 0;
  let fail = 0;
  const falhas = [];

  return {
    check(nome, condicao, detalhe) {
      if (condicao) {
        pass++;
        console.log('  ok   ' + nome);
      } else {
        fail++;
        falhas.push(`${nome} :: ${detalhe}`);
        console.log(`  FAIL ${nome}  -> ${detalhe}`);
      }
    },
    async naoLanca(fn) {
      try { await fn(); return true; } catch { return false; }
    },
    resumo(titulo) {
      console.log(`\n---- ${titulo}: ${pass} passaram, ${fail} falharam ----`);
      return { pass, fail, falhas };
    },
  };
}

// ─── banco descartável para os testes de rota ───────────────────────────────

function criarBancoTemporario() {
  if (!fs.existsSync(DEV_DB)) {
    throw new Error(
      `Banco de desenvolvimento não encontrado em ${DEV_DB}.\n` +
      'Rode "npx prisma db push" antes de executar os testes de rota.'
    );
  }
  const destino = path.join(os.tmpdir(), `agtgestor-test-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(DEV_DB, destino);
  process.env.DATABASE_URL = 'file:' + destino.replace(/\\/g, '/');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  return {
    caminho: destino,
    remover() {
      // No Windows o arquivo pode ficar preso até o processo encerrar.
      try { fs.unlinkSync(destino); } catch { /* ignorado de propósito */ }
    },
  };
}

// ─── Prisma falso (testes de unidade do motor de disponibilidade) ───────────

function criarPrismaFalso({ store, service, blocks = [], orders = [], professionals = [] }) {
  const bate = (registro, where = {}) => {
    if (where.storeId !== undefined && registro.storeId !== where.storeId) return false;
    if (where.id !== undefined && registro.id !== where.id) return false;
    if (where.active !== undefined && registro.active !== where.active) return false;
    return true;
  };

  return {
    store: {
      findUnique: async () => store,
      findFirst: async () => store,
    },
    product: {
      findUnique: async ({ where }) => (service && service.id === where.id ? service : null),
      findFirst: async ({ where }) => {
        if (!service) return null;
        if (where.id !== undefined && service.id !== where.id) return null;
        if (where.storeId !== undefined && service.storeId !== where.storeId) return null;
        return service;
      },
    },
    professional: {
      findMany: async ({ where = {} } = {}) => professionals.filter(p => bate(p, where)),
      findFirst: async ({ where = {} } = {}) => professionals.find(p => bate(p, where)) || null,
    },
    blockedSlot: {
      findMany: async ({ where }) => blocks.filter(b => {
        if (b.storeId !== where.storeId) return false;
        if (!where.OR) return true;
        return where.OR.some(c => b.date === c.date && b.isRecurring === c.isRecurring);
      }),
    },
    order: {
      findMany: async ({ where }) => orders.filter(o => {
        if (o.storeId !== where.storeId) return false;
        if (!o.scheduledAt) return false;
        const quando = new Date(o.scheduledAt);
        const janela = where.scheduledAt || {};
        if (janela.gte && quando < janela.gte) return false;
        if (janela.lte && quando > janela.lte) return false;
        if (janela.lt && quando >= janela.lt) return false;
        if (where.status?.notIn?.includes(o.status)) return false;
        if (where.professionalId !== undefined) {
          const alvo = where.professionalId;
          if (alvo === null) { if (o.professionalId !== null) return false; }
          else if (typeof alvo === 'object' && alvo.in) { if (!alvo.in.includes(o.professionalId)) return false; }
          else if (o.professionalId !== alvo) return false;
        }
        return true;
      }),
    },
  };
}

// ─── configuração de agenda padrão dos testes ───────────────────────────────

const HORARIOS_PADRAO = {
  monday:    { active: true,  open: '09:00', close: '18:00' },
  tuesday:   { active: true,  open: '09:00', close: '18:00' },
  wednesday: { active: true,  open: '09:00', close: '18:00' },
  thursday:  { active: true,  open: '09:00', close: '18:00' },
  friday:    { active: true,  open: '09:00', close: '18:00' },
  saturday:  { active: true,  open: '09:00', close: '13:00' },
  sunday:    { active: false, open: '09:00', close: '18:00' },
};

const configPadrao = (extra = {}) =>
  JSON.stringify({ slotInterval: 30, hours: HORARIOS_PADRAO, ...extra });

// Próxima segunda-feira com pelo menos 8 dias de folga, para os testes nunca
// esbarrarem no corte de "hoje + 60 min".
function proximaSegunda() {
  const d = new Date(Date.now() + 8 * 86400000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  SERVER_DIR,
  criarRunner,
  criarBancoTemporario,
  criarPrismaFalso,
  HORARIOS_PADRAO,
  configPadrao,
  proximaSegunda,
};
