const express = require('express');
const { auth } = require('../middleware/auth');
const { requirePremium } = require('../middleware/premium');
const prisma = require('../lib/prisma');
const { startSession, stopSession, getSessionStatus } = require('../services/whatsapp');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.store.id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de conexão. Aguarde alguns minutos e tente novamente.', code: 'CONNECTION_RATE_LIMITED' },
});

// Respostas contêm segredos efêmeros e não devem ir para caches HTTP/TWA.
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// QR continua como padrão para clientes antigos. Pairing permite usar o mesmo celular.
router.post('/connect', auth, requirePremium, connectLimiter, async (req, res) => {
  try {
    const result = await startSession(req.store.id, req.body === undefined ? {} : req.body);
    res.json(result);
  } catch (error) {
    if (error.code === 'SUBSCRIPTION_REQUIRED') {
      return res.status(403).json({ error: 'Assinatura necessária para usar este recurso', code: 'SUBSCRIPTION_REQUIRED' });
    }
    if (['INVALID_CONNECTION_METHOD', 'INVALID_CONNECTION_OPTIONS', 'INVALID_PHONE_NUMBER', 'CONNECTION_COOLDOWN', 'CONNECTION_FAILED'].includes(error.code)) {
      return res.status(error.status || 400).json({ error: error.message, code: error.code });
    }
    console.error('Falha ao iniciar sessão WhatsApp.');
    res.status(500).json({ error: 'Erro ao iniciar sessão WhatsApp', code: 'CONNECTION_FAILED' });
  }
});

// Get session status + QR code
router.get('/status', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const status = getSessionStatus(store.id);
    res.json(status);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao obter status' });
  }
});

// Disconnect WhatsApp
router.post('/disconnect', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    await stopSession(store.id);
    res.json({ message: 'WhatsApp desconectado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao desconectar' });
  }
});

module.exports = router;
