const express = require('express');
const { auth } = require('../middleware/auth');
const { requirePremium } = require('../middleware/premium');
const prisma = require('../lib/prisma');
const { startSession, stopSession, getSessionStatus } = require('../services/whatsapp');

const router = express.Router();

// Start WhatsApp session (generate QR code) — recurso premium
router.post('/connect', auth, requirePremium, async (req, res) => {
  try {
    const result = await startSession(req.store.id);
    res.json(result);
  } catch (error) {
    if (error.code === 'SUBSCRIPTION_REQUIRED') {
      return res.status(403).json({ error: 'Assinatura necessária para usar este recurso', code: 'SUBSCRIPTION_REQUIRED' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erro ao iniciar sessão WhatsApp' });
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
