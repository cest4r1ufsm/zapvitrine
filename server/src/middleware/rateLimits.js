const rateLimit = require('express-rate-limit');

const message = { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' };

// Login: 5 tentativas FALHAS / 15 min por IP (anti brute-force de senha).
// Logins bem-sucedidos não contam — não pune escritórios/NAT com vários usuários legítimos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message,
});

// Registro: 10 contas / hora por IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

// Emails (forgot-password, resend-verification): 3 / hora por IP —
// protege a caixa de terceiros e a cota diária do Brevo.
// Factory: cada rota recebe a SUA instância (balde próprio) — antes a mesma instância
// era compartilhada entre as duas rotas e o limite de 3/h somava as duas.
function makeEmailLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message,
  });
}

// Teto geral da API: 2000 req / 15 min por IP.
// Calibrado para o polling legítimo do painel (/whatsapp/status a cada 3s ≈ 300 req/15min
// só nesse endpoint — o teto antigo de 300 era estourado por uso normal).
// Webhooks (Stripe/Meta) ficam de fora: têm burst legítimo e validação própria de assinatura.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: (req) => req.path.startsWith('/webhook'),
});

module.exports = { loginLimiter, registerLimiter, makeEmailLimiter, apiLimiter };
