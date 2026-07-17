const prisma = require('../lib/prisma');

// Regra única de elegibilidade premium: assinatura ativa OU trial ainda válido.
// (trialEndsAt é opcional no schema — se não existir/for nulo, só assinatura ativa libera)
function isEligible(store) {
  if (!store) return false;
  if (store.subscriptionStatus === 'active') return true;
  if (store.trialEndsAt && new Date(store.trialEndsAt) > new Date()) return true;
  return false;
}

// Exige assinatura ativa (ou trial válido). Deve ser usado APÓS o middleware auth.
// Anexa a store em req.store para a rota não repetir a query.
const requirePremium = async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    if (!isEligible(store)) {
      const trialExpired = !!store.trialEndsAt && new Date(store.trialEndsAt) <= new Date();
      return res.status(403).json({
        error: 'Assinatura necessária para usar este recurso',
        code: trialExpired ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_REQUIRED',
      });
    }

    req.store = store;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao verificar assinatura' });
  }
};

module.exports = { requirePremium, isEligible };
