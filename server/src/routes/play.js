const express = require('express');
const { auth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Compra feita no app Android: o servidor confere no Google antes de liberar.
// `playBilling` é null quando a conta de serviço do Google não está configurada.
function createPlayRoutes(playBilling) {
  const router = express.Router();

  router.post('/verify', auth, async (req, res) => {
    if (!playBilling) {
      return res.status(503).json({ error: 'Pagamento pelo Google Play indisponível no momento.' });
    }
    try {
      const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

      const updated = await playBilling.verify(store.id, req.body || {});
      res.json({
        subscriptionStatus: updated.subscriptionStatus,
        subscriptionSource: updated.subscriptionSource,
        subscriptionExpiresAt: updated.subscriptionExpiresAt,
      });
    } catch (error) {
      console.error('[Play] verify:', error.message);
      const known = error.status && error.status < 500;
      res.status(known ? error.status : 502).json({
        error: known ? error.message : 'Não foi possível confirmar a compra agora. Use "Restaurar compra" em instantes.',
      });
    }
  });

  return router;
}

module.exports = { createPlayRoutes };
