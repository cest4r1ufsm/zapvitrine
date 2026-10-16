// Executor das suítes. Cada arquivo roda num processo próprio porque os testes
// de rota precisam apontar DATABASE_URL para uma cópia descartável do banco
// antes de o Prisma ser carregado.
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['Diagnóstico seguro de integrações', 'integration-readiness.test.js'],
  ['Stripe: reconciliação e isolamento de assinaturas', 'stripe-reconciliation.test.js'],
  ['Optional Stripe provider', 'billing-optional.test.js'],
  ['Configuração segura e fusos nacionais', 'platform.test.js'],
  ['Imagens: decodificação e remoção segura', 'storage.test.js'],
  ['Migração de imagens existentes', 'media-migration.test.js'],
  ['Diretório, favoritos e reservas públicas', 'directory.test.js'],
  ...(process.env.TEST_POSTGRES_URL && process.env.TEST_POSTGRES_DISPOSABLE === 'yes' ? [
    ['PostgreSQL: concorrência e transações', 'platform-postgres.test.js'],
    ['Clientes PostgreSQL: ranking e isolamento HTTP', 'clients-postgres.test.js'],
    ['PostGIS: pesquisa geográfica real', 'directory-postgis.test.js'],
    ['Reservas públicas entre dois processos', 'directory-consumer-postgres.test.js'],
    ['Workers paralelos por salão', 'inbox-postgres.test.js'],
    ['Inicialização com banco real', 'startup-smoke.test.js'],
  ] : []),
  ['Revocable sessions and CSRF', 'session-security.test.js'],
  ['WhatsApp oficial: autorização, assinatura e durabilidade', 'official-whatsapp.test.js'],
  ['Motor de disponibilidade (unidade)', 'availability.test.js'],
  ['Rotas de agenda (integração)', 'routes.test.js'],
  ['Regressão, isolamento e concorrência', 'regression.test.js'],
  ['Bot WhatsApp Cloud API (E2E)', 'bot.test.js'],
  ['Bot Baileys / QR code (E2E)', 'bot-baileys.test.js'],
  ['Conexão WhatsApp: QR e código (unidade)', 'whatsapp-sessions.test.js'],
  ['Rotas de conexão WhatsApp (HTTP isolado)', 'whatsapp-routes.test.js'],
  ['Registro automático de clientes', 'clients.test.js'],
  ['Duração personalizada', 'duration-override.test.js'],
  ['Google Play Billing e exclusão de conta', 'play.test.js'],
];

let falhou = false;
if (!process.env.TEST_POSTGRES_URL) console.log('PostgreSQL/PostGIS não executados: forneça TEST_POSTGRES_URL e TEST_POSTGRES_DISPOSABLE=yes para a validação de produção.');
const resultados = [];

for (const [titulo, arquivo] of SUITES) {
  console.log(`\n\n########## ${titulo} ##########`);
  const r = spawnSync(process.execPath, [path.join(__dirname, arquivo)], {
    stdio: 'inherit',
    env: process.env,
  });
  const ok = r.status === 0;
  if (!ok) falhou = true;
  resultados.push({ titulo, ok });
}

console.log('\n\n================= RESUMO =================');
for (const { titulo, ok } of resultados) {
  console.log(`  ${ok ? 'PASSOU' : 'FALHOU'}  ${titulo}`);
}
console.log('=========================================');

if (falhou) {
  console.log('\nHa suites com falha. Nao suba para producao antes de resolver.');
  process.exit(1);
}
console.log('\nTodas as suites passaram.');
