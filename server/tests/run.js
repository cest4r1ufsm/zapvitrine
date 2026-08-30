// Executor das suítes. Cada arquivo roda num processo próprio porque os testes
// de rota precisam apontar DATABASE_URL para uma cópia descartável do banco
// antes de o Prisma ser carregado.
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['Motor de disponibilidade (unidade)', 'availability.test.js'],
  ['Rotas de agenda (integração)', 'routes.test.js'],
  ['Regressão, isolamento e concorrência', 'regression.test.js'],
  ['Bot WhatsApp Cloud API (E2E)', 'bot.test.js'],
  ['Bot Baileys / QR code (E2E)', 'bot-baileys.test.js'],
  ['Registro automático de clientes', 'clients.test.js'],
  ['Duração personalizada', 'duration-override.test.js'],
];

let falhou = false;
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
