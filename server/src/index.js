const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// ── Guard de inicialização: nunca subir com JWT_SECRET ausente/fraco/padrão ──
const OLD_DEFAULT_JWT_SECRET = 'zapvitrine-secret-key-change-in-production-2026';
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET === OLD_DEFAULT_JWT_SECRET
) {
  console.error(
    'FATAL: JWT_SECRET ausente, com menos de 32 caracteres ou igual ao valor padrão antigo. ' +
    'Gere um segredo forte (node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))") e configure no .env.'
  );
  process.exit(1);
}

if (!process.env.META_APP_SECRET) {
  console.warn(
    '⚠️  META_APP_SECRET não configurado — o webhook da WhatsApp Cloud API está SEM validação de assinatura. ' +
    'Configure o App Secret da Meta no .env para ativar a validação.'
  );
}

const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/store');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const ordersRoutes = require('./routes/orders');
const whatsappRoutes = require('./routes/whatsapp');
const billingRoutes = require('./routes/billing');
const stripeWebhookRoutes = require('./routes/stripe-webhook');
const professionalsRoutes = require('./routes/professionals');
const blockedSlotsRoutes = require('./routes/blocked-slots');
const clientsRoutes = require('./routes/clients');
const availabilityRoutes = require('./routes/availability');
const { restoreSessions } = require('./services/whatsapp');
const { apiLimiter } = require('./middleware/rateLimits');

const app = express();
const PORT = process.env.PORT || 3001;

// Atrás de 1 proxy reverso (nginx no VPS) — necessário para o rate limit ver o IP real
app.set('trust proxy', 1);

// Headers de segurança. CSP compatível com a SPA (React inline styles, WebGL, imagens locais)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// CORS restrito: produção + origens locais usadas pelo Vite neste workspace.
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:5007',
  'http://127.0.0.1:5007',
  'http://localhost:5008',
  'http://127.0.0.1:5008',
].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

// Webhook da Stripe TEM que vir ANTES do express.json() para não converter o Buffer para Object
app.use('/api/webhook/stripe', stripeWebhookRoutes);

// rawBody é necessário para validar a assinatura HMAC do webhook da Meta (Cloud API)
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Uploads: nosniff + CSP inerte impedem que um arquivo malicioso execute como página
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
    },
  })
);

// Teto geral de requisições na API (webhooks têm validação própria de assinatura e ficam de fora)
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes); // Webhook da WhatsApp Cloud API (Meta)
app.use('/api/orders', ordersRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/professionals', professionalsRoutes);
app.use('/api/blocked-slots', blockedSlotsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/availability', availabilityRoutes);

// Serve React client build in production
const clientPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientPath));

// SPA fallback — all non-API routes serve index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  const indexPath = path.join(clientPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

app.use((err, req, res, next) => {
  // Corpo JSON malformado (express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição' });
  }

  // Erros do multer (upload): mensagem amigável em vez de 500
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo muito grande. Máximo 5MB.'
        : 'Erro no upload do arquivo. Tente novamente.';
    return res.status(400).json({ error: message });
  }

  // Filtro de tipo de arquivo do upload (fileFilter lança com esta mensagem)
  if (typeof err.message === 'string' && err.message.startsWith('Tipo de arquivo não suportado')) {
    return res.status(400).json({ error: err.message });
  }

  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 AGTgestor API rodando em http://localhost:${PORT}`);
  // Restore WhatsApp sessions
  restoreSessions().catch(err => console.error('Error restoring sessions:', err));
});
