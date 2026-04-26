const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { logAudit } = require('../utils/audit');

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

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const dbUser = await User.findById(req.session.user.id).select('username role avatarExt embedMode');
  if (!dbUser) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    user: {
      id: dbUser._id,
      username: dbUser.username,
      role: dbUser.role,
      avatarUrl: dbUser.avatarExt ? `/api/user/avatar/${dbUser._id}` : null,
      embedMode: dbUser.embedMode || 'embed',
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
  const { username, password, confirmPassword } = req.body;
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
  const exists = await User.findOne({ username });
  if (exists) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const count = await User.countDocuments();
  const role = count === 0 ? 'admin' : 'user';
  const user = await User.create({ username, password, role });
  req.session.user = { id: user._id, username: user.username, role: user.role };
  await logAudit(req, 'register');
  res.status(201).json({
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      avatarUrl: null,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  await logAudit(req, 'logout');
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
