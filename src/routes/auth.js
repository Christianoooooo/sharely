const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { logAudit } = require('../utils/audit');
const mailer = require('../utils/mailer');

// env var takes precedence; falls back to SiteSettings.allowRegistration
async function allowRegistration() {
  if (process.env.ALLOW_REGISTRATION === 'false') return false;
  if (process.env.ALLOW_REGISTRATION === 'true') return true;
  const s = await SiteSettings.get();
  return s.allowRegistration !== false;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts, please try again later.' },
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const dbUser = await User.findById(req.session.user.id).select('username role avatarExt embedMode email emailVerified');
  if (!dbUser) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    user: {
      id: dbUser._id,
      username: dbUser.username,
      role: dbUser.role,
      avatarUrl: dbUser.avatarExt ? `/api/user/avatar/${dbUser._id}` : null,
      embedMode: dbUser.embedMode || 'embed',
      email: dbUser.email || null,
      emailVerified: dbUser.emailVerified || false,
    },
  });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = await User.findOne({ username });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await user.comparePassword(password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = { id: user._id, username: user.username, role: user.role };
  await logAudit(req, 'login');
  res.json({
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarExt ? `/api/user/avatar/${user._id}` : null,
    },
  });
});

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  if (!await allowRegistration()) {
    return res.status(403).json({ error: 'Registration is disabled' });
  }
  const { username, password, confirmPassword, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3–32 characters' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }

  const trimmedEmail = (email || '').toLowerCase().trim();
  if (mailer.isConfigured()) {
    if (!trimmedEmail) {
      return res.status(400).json({ error: 'Email address required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || trimmedEmail.length > 254) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const emailExists = await User.findOne({ email: trimmedEmail });
    if (emailExists) {
      return res.status(409).json({ error: 'Email already in use' });
    }
  }

  const exists = await User.findOne({ username });
  if (exists) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const count = await User.countDocuments();
  const role = count === 0 ? 'admin' : 'user';

  const userData = { username, password, role };
  if (trimmedEmail) {
    const plaintext = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
    userData.email = trimmedEmail;
    userData.emailVerified = false;
    userData.emailVerificationToken = hash;
    userData.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await User.create(userData);
    const verifyUrl = `${process.env.BASE_URL || ''}/api/auth/verify-email?token=${plaintext}`;
    mailer.sendEmailVerificationEmail(trimmedEmail, username, verifyUrl).catch((err) => {
      console.error('Failed to send verification email on register:', err.message);
    });
    req.session.user = { id: user._id, username: user.username, role: user.role };
    await logAudit(req, 'register');
    return res.status(201).json({
      user: { id: user._id, username: user.username, role: user.role, avatarUrl: null, email: user.email, emailVerified: false },
    });
  }

  const user = await User.create(userData);
  req.session.user = { id: user._id, username: user.username, role: user.role };
  await logAudit(req, 'register');
  res.status(201).json({
    user: { id: user._id, username: user.username, role: user.role, avatarUrl: null },
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  await logAudit(req, 'logout');
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/smtp-enabled — public flag, no secrets exposed
router.get('/smtp-enabled', (_req, res) => {
  res.json({ enabled: mailer.isConfigured() });
});

// GET /api/auth/verify-email?token=<hex>
router.get('/verify-email', authLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.redirect(`${process.env.BASE_URL || ''}/settings?emailVerified=error`);
  }
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationToken: hash,
    emailVerificationExpires: { $gt: Date.now() },
  });
  if (!user) {
    return res.redirect(`${process.env.BASE_URL || ''}/settings?emailVerified=error`);
  }
  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpires = null;
  await user.save();
  await logAudit(req, 'verify_email', { username: user.username });
  res.redirect(`${process.env.BASE_URL || ''}/settings?emailVerified=success`);
});

// GET /api/auth/verify-reset-token?token=<hex>
router.get('/verify-reset-token', authLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.json({ valid: false });
  }
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hash,
    passwordResetExpires: { $gt: Date.now() },
  });
  res.json({ valid: Boolean(user) });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.json({ success: true });
  }
  try {
    const user = await User.findOne({ username: username.trim() });
    if (user && user.isActive && user.email && user.emailVerified) {
      const plaintext = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
      user.passwordResetToken = hash;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const resetUrl = `${process.env.BASE_URL || ''}/auth/reset-password?token=${plaintext}`;
      mailer.sendPasswordResetEmail(user.email, user.username, resetUrl).catch((err) => {
        console.error('Failed to send password reset email:', err.message);
      });
      await logAudit(req, 'forgot_password', { username: user.username });
    }
  } catch (err) {
    console.error('forgot-password error:', err.message);
  }
  res.json({ success: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
  if (!newPassword || newPassword.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hash,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
  user.password = newPassword;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();
  await logAudit(req, 'reset_password', { username: user.username });
  res.json({ success: true });
});

module.exports = router;
