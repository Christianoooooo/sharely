const { asyncRouter } = require('../utils/asyncRouter');
const router = asyncRouter();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { logAudit } = require('../utils/audit');
const { validateEmail } = require('../utils/validateEmail');
const mailer = require('../utils/mailer');
const ldap = require('../utils/ldap');
const { broadcast } = require('../ws');
const { establishSession } = require('../middleware/auth');

// A valid bcrypt hash of a random value, compared against when no user is found
// so login timing does not reveal whether a username exists.
const DUMMY_HASH = '$2a$12$BfEoN1iE7LMZ4o0prU0P6OaawVLCVurgrJemsAm6.ZlJmTJYrvA9i';

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
  const dbUser = await User.findById(req.session.user.id).select('username role avatarExt embedMode email emailVerified language');
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
      language: dbUser.language || 'en',
    },
  });
});

async function finishLogin(req, res, user) {
  await establishSession(req, user);
  await logAudit(req, 'login');
  res.json({
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarExt ? `/api/user/avatar/${user._id}` : null,
      email: user.email || null,
      emailVerified: user.emailVerified || false,
      language: user.language || 'en',
    },
  });
}

// Creates a local record the first time a user authenticates via LDAP, so folders,
// quotas, roles and sessions have something to hang off. The local password is a
// random placeholder the user never learns, which keeps them on the directory.
async function provisionLdapUser(username, identity) {
  if (username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(username)) return null;
  // The first account must be the admin created by the token-protected install setup.
  if (await User.countDocuments() === 0) return null;
  // Directories usually match case-insensitively; a name differing only in case from an
  // existing account would be a second account or a look-alike of someone else's.
  if (await User.exists({ username }).collation({ locale: 'en', strength: 2 })) return null;
  const userData = {
    username,
    password: crypto.randomBytes(32).toString('hex'),
    role: 'user',
    authProvider: 'ldap',
    ldapDn: identity.dn,
  };
  const email = (identity.email || '').toLowerCase().trim();
  // Adopt the directory address only if no other account holds it, so the unique
  // email index cannot block the login.
  if (email && email.includes('@') && !(await User.findOne({ email }))) {
    userData.email = email;
    userData.emailVerified = true;
  }
  try {
    const user = await User.create(userData);
    broadcast('stats:invalidate', {}, (c) => c.isAdmin);
    return user;
  } catch (err) {
    console.error('Failed to provision LDAP user:', err.message);
    return null;
  }
}

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  // Non-strings would reach the LDAP filter unescaped and the user query as operators.
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = await User.findOne({ username });

  // Local accounts authenticate only against their local password; the directory
  // never governs a username that already belongs to a local account.
  if (user && user.isActive && user.authProvider !== 'ldap') {
    if (await user.comparePassword(password)) {
      return finishLogin(req, res, user);
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Existing LDAP accounts, and usernames with no local account, fall through to
  // the directory when it is configured.
  if (ldap.isConfigured() && (!user || user.authProvider === 'ldap')) {
    // A deactivated account stays locked out even if the directory would accept it.
    if (user && !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    let identity;
    try {
      identity = await ldap.authenticate(username, password);
    } catch (err) {
      console.error('LDAP authentication error:', err.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (identity) {
      // The directory DN, not the typed username, decides which account this is.
      let ldapUser = user && user.ldapDn === identity.dn ? user : await User.findOne({ ldapDn: identity.dn });
      const isNew = !ldapUser;
      if (isNew) ldapUser = await provisionLdapUser(username, identity);
      if (!ldapUser || !ldapUser.isActive) return res.status(401).json({ error: 'Invalid credentials' });
      if (isNew) await logAudit(req, 'register', { provider: 'ldap' });
      return finishLogin(req, res, ldapUser);
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // No local match and no applicable directory: spend comparable time hashing so a
  // missing/inactive user is indistinguishable from a wrong password.
  await bcrypt.compare(password, DUMMY_HASH);
  return res.status(401).json({ error: 'Invalid credentials' });
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
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, dashes and underscores' });
  }
  // Directory names stay reserved for their LDAP owners, who would otherwise be locked out.
  try {
    if (await ldap.isDirectoryUsername(username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
  } catch (err) {
    console.error('LDAP username check failed:', err.message);
    return res.status(503).json({ error: 'Directory unavailable, please try again later' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }

  const trimmedEmail = (email || '').toLowerCase().trim();
  if (mailer.isConfigured() && !trimmedEmail) {
    return res.status(400).json({ error: 'Email address required' });
  }
  if (trimmedEmail) {
    if (!(await validateEmail(trimmedEmail)).valid) {
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
  // The first (admin) account is created only via the token-protected install setup.
  if (await User.countDocuments() === 0) {
    return res.status(403).json({ error: 'Installation required' });
  }
  const role = 'user';

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
    mailer.sendEmailVerificationEmail(trimmedEmail, username, verifyUrl, user.language || 'en').catch((err) => {
      console.error('Failed to send verification email on register:', err.message);
    });
    await establishSession(req, user);
    await logAudit(req, 'register');
    broadcast('stats:invalidate', {}, (c) => c.isAdmin);
    return res.status(201).json({
      user: { id: user._id, username: user.username, role: user.role, avatarUrl: null, email: user.email, emailVerified: false, language: user.language || 'en' },
    });
  }

  const user = await User.create(userData);
  await establishSession(req, user);
  await logAudit(req, 'register');
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  res.status(201).json({
    user: { id: user._id, username: user.username, role: user.role, avatarUrl: null, language: user.language || 'en' },
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
  broadcast('user:updated', { id: user._id.toString(), emailVerified: true }, (c) => c.isAdmin);
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
    // LDAP accounts have no usable local password, so a reset must never issue one
    // for them — it would let them bypass the directory.
    if (user && user.isActive && user.authProvider !== 'ldap' && user.email && user.emailVerified) {
      const plaintext = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
      user.passwordResetToken = hash;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const resetUrl = `${process.env.BASE_URL || ''}/auth/reset-password?token=${plaintext}`;
      mailer.sendPasswordResetEmail(user.email, user.username, resetUrl, user.language || 'en').catch((err) => {
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
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();
  await logAudit(req, 'reset_password', { username: user.username });
  res.json({ success: true });
});

module.exports = router;
