const express = require('express');
const { auth } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { startSession, stopSession, getSessionStatus } = require('../services/whatsapp');

const router = express.Router();

// Start WhatsApp session (generate QR code)
router.post('/connect', auth, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    const result = await startSession(store.id);
    res.json(result);
  } catch (error) {
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
