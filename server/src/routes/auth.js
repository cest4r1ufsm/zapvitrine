const express = require('express');
const bcrypt = require('bcryptjs');
const { createSession, csrfForToken, readToken, clearSessionCookie, requireTrustedOrigin } = require('../services/session');
const crypto = require('crypto');
const { removeImage } = require('../services/objectStorage');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { loginLimiter, registerLimiter, makeEmailLimiter } = require('../middleware/rateLimits');

const router = express.Router();
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(requireTrustedOrigin);

// Instâncias separadas: cada rota de e-mail tem o seu próprio balde de 3/h
const resendVerificationLimiter = makeEmailLimiter();
const forgotPasswordLimiter = makeEmailLimiter();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, accountType = 'business' } = req.body;
    if (!['business', 'consumer'].includes(accountType)) return res.status(400).json({ error: 'Tipo de conta invalido' });

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || Buffer.byteLength(password) > 72 || typeof name !== 'string' || !name.trim() || name.length > 120) {
      return res.status(400).json({ error: 'Preencha todos os campos' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailVerificationToken = generateToken();

    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: { email, password: hashedPassword, name, role: accountType, emailVerificationToken, emailVerified: false },
      });
      if (accountType === 'business') await tx.store.create({
        data: { userId: created.id, name: `Loja de ${name}`, slug: `${slug}-${created.id}`, phone: '', trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
      return created;
    });

    // Send verification email (non-blocking: log errors but don't fail)
    sendVerificationEmail(email, name, emailVerificationToken).catch((err) => {
      console.error('Erro ao enviar e-mail de verificação:', err.message);
    });

    res.status(201).json({
      requiresVerification: true,
      message: 'Conta criada com sucesso! Verifique seu e-mail para ativar a conta.',
    });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Este e-mail já está cadastrado' });
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || !email || email.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: 'Preencha todos os campos' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'E-mail ou senha incorretos' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'E-mail não confirmado',
        requiresVerification: true,
        email: user.email,
      });
    }

    const csrfToken = await createSession(req, res, user.id, user.password);

    res.json({
      csrfToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Verify email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token, emailVerified: false },
    });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou já utilizado' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });

    res.json({ success: true, message: 'E-mail confirmado com sucesso!' });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao verificar e-mail' });
  }
});

// Resend verification email
router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== 'string' || !email || email.length > 254) {
      return res.status(400).json({ error: 'Informe o e-mail' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to avoid email enumeration
    if (!user || user.emailVerified) {
      return res.json({ message: 'Se o e-mail existir, um novo link foi enviado.' });
    }

    const emailVerificationToken = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken },
    });

    sendVerificationEmail(email, user.name, emailVerificationToken).catch((err) => {
      console.error('Erro ao reenviar e-mail:', err.message);
    });

    res.json({ message: 'E-mail de confirmação reenviado!' });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao reenviar e-mail' });
  }
});

// Forgot password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== 'string' || !email || email.length > 254) {
      return res.status(400).json({ error: 'Informe o e-mail' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to avoid email enumeration
    if (user) {
      const passwordResetToken = generateToken();
      const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken, passwordResetExpires },
      });

      sendPasswordResetEmail(email, user.name, passwordResetToken).catch((err) => {
        console.error('Erro ao enviar e-mail de reset:', err.message);
      });
    }

    res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de redefinição.' });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const consumed = await prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordResetToken: token, passwordResetExpires: { gt: new Date() } },
        data: { password: hashedPassword, passwordResetToken: null, passwordResetExpires: null },
      });
      if (changed.count) await tx.authSession.deleteMany({ where: { userId: user.id } });
      return changed.count;
    });
    if (!consumed) return res.status(400).json({ error: 'Token inválido ou já utilizado' });
    clearSessionCookie(res);

    res.json({ success: true, message: 'Senha redefinida com sucesso!' });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// Excluir conta: apaga usuário, loja e tudo ligado a ela (cascade no banco),
// desconecta o WhatsApp, cancela a assinatura do Stripe e remove as imagens.
// Exigido pela Play Store para apps com criação de conta.
router.delete('/account', auth, loginLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72 || !(await bcrypt.compare(password, req.user.password))) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    const store = await prisma.store.findUnique({
      where: { userId: req.user.id },
      include: { products: { select: { imageUrl: true } } },
    });

    if (store) {
      if (store.stripeSubscriptionId && store.subscriptionSource !== 'play') {
        if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Não foi possível confirmar o cancelamento da assinatura. Tente novamente antes de excluir a conta.' });
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try { await stripe.subscriptions.cancel(store.stripeSubscriptionId); }
        catch (err) {
          // A deleted Stripe resource is already canceled; other failures must
          // preserve the account so its owner can still manage billing.
          if (err.code !== 'resource_missing') return res.status(502).json({ error: 'Não foi possível cancelar a assinatura. Sua conta foi preservada; tente novamente.' });
        }
      }
      // Invalidate authorization before stopping sessions or cancelling billing.
      // Workers re-check the store before effects; new inbound events are ignored.
      await prisma.store.update({ where: { id: store.id }, data: {
        active: false, botEnabled: false, officialStatus: 'disconnected', officialToken: null,
      } });
      // require tardio evita ciclo de dependência (whatsapp → premium → prisma)
      const { stopSession } = require('../services/whatsapp');
      await stopSession(store.id).catch((err) => console.error('Excluir conta: WhatsApp', err.message));

      const files = [store.logoUrl, store.bannerUrl, ...store.products.map((p) => p.imageUrl)];
      for (const url of files) {
        if (url) await removeImage(url);
      }
    }

    await prisma.$transaction(async tx => {
      // Consumer booking history is owned by salons, but must not retain the
      // deleted account's contact fields. Cancel future reservations atomically.
      await tx.order.updateMany({
        where: { publicBooking: { is: { userId: req.user.id } }, scheduledAt: { gt: new Date() }, status: { in: ['pending', 'confirmed'] } },
        data: { status: 'cancelled' },
      });
      await tx.order.updateMany({
        where: { publicBooking: { is: { userId: req.user.id } } },
        data: { customerName: 'Conta excluída', customerPhone: '', customerAddress: null, notes: null },
      });
      await tx.directoryReport.deleteMany({ where: { userId: req.user.id } });
      await tx.directoryAudit.updateMany({ where: { actorId: req.user.id }, data: { actorId: 0 } });
      if (store) {
        await tx.whatsAppSignupState.deleteMany({ where: { storeId: store.id } });
        await tx.whatsAppInbox.deleteMany({ where: { storeId: store.id } });
        await tx.whatsAppDelivery.deleteMany({ where: { storeId: store.id } });
        await tx.whatsAppConversation.deleteMany({ where: { OR: [
          { id: { startsWith: `${store.id}:` } }, { id: { startsWith: `baileys:${store.id}:` } },
        ] } });
      }
      await tx.whatsAppWorkerLease.deleteMany({ where: { id: `signup:${req.user.id}` } });
      await tx.user.delete({ where: { id: req.user.id } });
    });
    res.json({ success: true, message: 'Conta excluída.' });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    if (req.authSession) await prisma.authSession.deleteMany({ where: { id: req.authSession.id } });
    clearSessionCookie(res);
    res.json({ success: true });
  } catch { res.status(503).json({ error: 'Não foi possível encerrar a sessão. Tente novamente.' }); }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
    });
    const store = await prisma.store.findUnique({ where: { userId: req.user.id } });

    // Nunca enviar segredos/ids internos ao navegador
    let safeStore = null;
    if (store) {
      const { botToken, botWebhookToken, officialToken, stripeCustomerId, stripeSubscriptionId, playPurchaseToken, ...rest } = store;
      safeStore = { ...rest, timeZone: await require('../utils/timeZone').storeTimeZone(prisma, store.id) };
    }

    res.json({ user, store: safeStore, csrfToken: req.authSession ? csrfForToken(readToken(req)) : undefined });
  } catch (error) {
    console.error('Auth operation failed', { code: error.code || 'INTERNAL_ERROR' });
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

module.exports = router;
