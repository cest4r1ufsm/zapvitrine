const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { digest, readToken, validCsrf } = require('../services/session');

const auth = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (token) {
      const session = await prisma.authSession.findUnique({ where: { id: digest(token) }, include: { user: true } });
      if (!session || session.expiresAt <= new Date() || !session.user.emailVerified) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validCsrf(req, session)) return res.status(403).json({ error: 'Solicitação inválida. Atualize a página e tente novamente.' });
      req.user = session.user;
      req.authSession = session;
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }
    // Isolated legacy fixtures only. No production compatibility bypass.
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_LEGACY_TEST_AUTH === 'true') {
      const bearer = req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (bearer) {
        let decoded;
        try { decoded = jwt.verify(bearer, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
        catch { return res.status(401).json({ error: 'Acesso não autorizado' }); }
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (user) { req.user = user; return next(); }
      }
    }
    return res.status(401).json({ error: 'Acesso não autorizado' });
  } catch {
    return res.status(503).json({ error: 'Não foi possível verificar sua sessão. Tente novamente.' });
  }
};
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
};
module.exports = { auth, adminOnly };
