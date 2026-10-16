const crypto = require('crypto');
const prisma = require('../lib/prisma');

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-agt_session' : 'agt_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });

function readToken(req) {
  const entries = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName()}=`));
  if (entries.length !== 1) return null;
  const value = entries[0].slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function allowedOrigins() {
  const origins = [process.env.APP_URL];
  if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:5007', 'http://127.0.0.1:5007', 'http://localhost:5008', 'http://127.0.0.1:5008');
  return origins.filter(Boolean).map(value => { try { return new URL(value).origin; } catch { return null; } }).filter(Boolean);
}

function trustedOrigin(req) {
  return typeof req.headers.origin === 'string' && allowedOrigins().includes(req.headers.origin);
}

// Auth forms must also reject login CSRF, before a session exists.
function requireTrustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!trustedOrigin(req)) return res.status(403).json({ error: 'Origem da solicitação não autorizada' });
  next();
}

function validCsrf(req, session) {
  const token = req.headers['x-csrf-token'];
  return trustedOrigin(req) && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    && crypto.timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(session.csrfHash, 'hex'));
}

async function createSession(req, res, userId, verifiedPasswordHash) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = csrfForToken(token);
  const previous = readToken(req);
  await prisma.$transaction(async tx => {
    // Serialize against password resets; a login checked before a reset cannot
    // create a fresh session afterwards using the previous password.
    const validUser = await tx.user.updateMany({
      where: { id: userId, password: verifiedPasswordHash, emailVerified: true },
      data: { emailVerified: true },
    });
    if (!validUser.count) throw new Error('AUTH_CHANGED');
    if (previous) await tx.authSession.deleteMany({ where: { id: digest(previous) } });
    await tx.authSession.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    await tx.authSession.create({ data: { id: digest(token), userId, csrfHash: digest(csrfToken), expiresAt: new Date(Date.now() + TTL_MS) } });
  });
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: TTL_MS });
  return csrfToken;
}

function csrfForToken(token) { return crypto.createHmac('sha256', token).update('agt-csrf-v1').digest('hex'); }

function clearSessionCookie(res) { res.clearCookie(cookieName(), cookieOptions()); }
module.exports = { digest, readToken, validCsrf, createSession, csrfForToken, clearSessionCookie, requireTrustedOrigin, cookieName };
