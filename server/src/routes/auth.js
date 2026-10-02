const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { loginLimiter, registerLimiter, makeEmailLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// Instâncias separadas: cada rota de e-mail tem o seu próprio balde de 3/h
const resendVerificationLimiter = makeEmailLimiter();
const forgotPasswordLimiter = makeEmailLimiter();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
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

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, emailVerificationToken, emailVerified: false },
    });

    // Create default store
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    await prisma.store.create({
      data: {
        userId: user.id,
        name: `Loja de ${name}`,
        slug: slug + '-' + user.id,
        phone: '',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
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
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Verify email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
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
    console.error(error);
    res.status(500).json({ error: 'Erro ao verificar e-mail' });
  }
});

// Resend verification email
router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
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
    console.error(error);
    res.status(500).json({ error: 'Erro ao reenviar e-mail' });
  }
});

// Forgot password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
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
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// Excluir conta: apaga usuário, loja e tudo ligado a ela (cascade no banco),
// desconecta o WhatsApp, cancela a assinatura do Stripe e remove as imagens.
// Exigido pela Play Store para apps com criação de conta.
router.delete('/account', auth, loginLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || !(await bcrypt.compare(password, req.user.password))) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    const store = await prisma.store.findUnique({
      where: { userId: req.user.id },
      include: { products: { select: { imageUrl: true } } },
    });

    if (store) {
      // require tardio evita ciclo de dependência (whatsapp → premium → prisma)
      const { stopSession } = require('../services/whatsapp');
      await stopSession(store.id).catch((err) => console.error('Excluir conta: WhatsApp', err.message));

      if (store.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(store.stripeSubscriptionId)
          .catch((err) => console.error('Excluir conta: Stripe', err.message));
      }

      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      const files = [store.logoUrl, store.bannerUrl, ...store.products.map((p) => p.imageUrl)];
      for (const url of files) {
        if (!url || !url.startsWith('/uploads/')) continue;
        fs.rm(path.join(uploadsDir, path.basename(url)), { force: true }, () => {});
      }
    }

    await prisma.user.delete({ where: { id: req.user.id } });
    res.json({ success: true, message: 'Conta excluída.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
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
      const { botToken, stripeCustomerId, stripeSubscriptionId, playPurchaseToken, ...rest } = store;
      safeStore = rest;
    }

    res.json({ user, store: safeStore });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

module.exports = router;
