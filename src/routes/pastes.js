const { asyncRouter } = require('../utils/asyncRouter');
const router = asyncRouter();
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const Paste = require('../models/Paste');
const { requireLogin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { lookupLimiter } = require('../middleware/lookupLimiter');

const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3000';

// Paste passwords are often short; only failed attempts count.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});
const MAX_CONTENT = 500000;

function isExpired(paste) {
  return !!(paste.expiresAt && paste.expiresAt < new Date());
}

// Caller may see the full paste: owner, admin, or a verified/no-password paste.
function accessState(req, paste) {
  const user = req.session?.user;
  const isOwner = !!user && (user.id.toString() === paste.owner._id.toString() || user.role === 'admin');
  const verified = Array.isArray(req.session?.verifiedPastes) &&
    req.session.verifiedPastes.includes(paste.shortId);
  const needsPassword = !!paste.password && !verified && !isOwner;
  return { isOwner, needsPassword };
}

// Parse an optional ISO expiry; only accept a valid future date.
function parseExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date > new Date() ? date : null;
}

// ── List own pastes (admin sees all) ────────────────────────────────────────
router.get('/', requireLogin, async (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const filter = isAdmin ? {} : { owner: req.session.user.id };
  const pastes = await Paste.find(filter).sort({ createdAt: -1 }).lean();

  res.json({
    pastes: pastes.map((p) => ({
      shortId: p.shortId,
      title: p.title,
      language: p.language,
      preview: (p.content || '').slice(0, 200),
      isPrivate: p.isPrivate,
      hasPassword: !!p.password,
      views: p.views,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      expired: p.expiresAt ? p.expiresAt < new Date() : false,
    })),
  });
});

// ── Create a paste ──────────────────────────────────────────────────────────
router.post('/', requireLogin, async (req, res) => {
  const { title, content, language, isPrivate, password, expiresAt } = req.body;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Content required' });
  }
  if (content.length > MAX_CONTENT) {
    return res.status(413).json({ error: 'Paste too large' });
  }

  const data = {
    title: (title || '').trim().slice(0, 200),
    content,
    language: (language || 'plaintext').trim().slice(0, 40),
    owner: req.session.user.id,
    isPrivate: !!isPrivate,
    expiresAt: parseExpiry(expiresAt),
  };
  if (password) data.password = await bcrypt.hash(password, 10);

  const paste = await Paste.createUnique(data);
  await logAudit(req, 'paste_create', { shortId: paste.shortId, title: paste.title });

  res.status(201).json({
    shortId: paste.shortId,
    url: `${BASE_URL()}/p/${paste.shortId}`,
  });
});

// ── Verify paste password — stores result in session ────────────────────────
router.post('/:shortId/verify', verifyLimiter, async (req, res) => {
  const paste = await Paste.findOne({ shortId: req.params.shortId });
  if (!paste) return res.status(404).json({ error: 'Paste not found' });
  if (isExpired(paste)) return res.status(410).json({ error: 'expired' });
  if (!paste.password) return res.json({ success: true });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const valid = await bcrypt.compare(password, paste.password);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });

  if (!req.session.verifiedPastes) req.session.verifiedPastes = [];
  if (!req.session.verifiedPastes.includes(req.params.shortId)) {
    req.session.verifiedPastes.push(req.params.shortId);
  }
  res.json({ success: true });
});

// ── Raw text (public — mirrors the view's gating) ───────────────────────────
router.get('/:shortId/raw', lookupLimiter, async (req, res) => {
  const paste = await Paste.findOne({ shortId: req.params.shortId }).populate('owner', 'username');
  if (!paste) return res.status(404).send('Not found');
  if (isExpired(paste)) return res.status(410).send('This paste is no longer available');

  const { isOwner, needsPassword } = accessState(req, paste);
  if (paste.isPrivate && !isOwner) return res.status(404).send('Not found');
  if (needsPassword) return res.status(401).send('Password required');

  // Arbitrary user text: serve as inert text/plain so an HTML/script paste can
  // never execute on our origin (nosniff + sandbox mirror the file serving).
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');
  res.send(paste.content);
});

// ── Get a paste (public — gated by private/password) ────────────────────────
router.get('/:shortId', lookupLimiter, async (req, res) => {
  const paste = await Paste.findOne({ shortId: req.params.shortId }).populate('owner', 'username');
  if (!paste) return res.status(404).json({ error: 'Paste not found' });
  if (isExpired(paste)) return res.status(410).json({ error: 'expired' });

  const { isOwner, needsPassword } = accessState(req, paste);
  // Private pastes are invisible to everyone but the owner/admin — 404 so their
  // existence is not revealed.
  if (paste.isPrivate && !isOwner) return res.status(404).json({ error: 'Paste not found' });

  if (!needsPassword && !isOwner) {
    await Paste.updateOne({ _id: paste._id }, { $inc: { views: 1 } });
  }

  res.json({
    shortId: paste.shortId,
    title: paste.title,
    language: paste.language,
    content: needsPassword ? null : paste.content,
    owner: paste.owner.username,
    isPrivate: paste.isPrivate,
    hasPassword: !!paste.password,
    needsPassword,
    isOwner,
    views: paste.views,
    expiresAt: paste.expiresAt,
    createdAt: paste.createdAt,
    updatedAt: paste.updatedAt,
  });
});

// ── Edit a paste (owner/admin) ──────────────────────────────────────────────
router.patch('/:shortId', requireLogin, async (req, res) => {
  const paste = await Paste.findOne({ shortId: req.params.shortId });
  if (!paste) return res.status(404).json({ error: 'Paste not found' });

  const user = req.session.user;
  const isOwner = paste.owner.toString() === user.id.toString() || user.role === 'admin';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

  const { title, content, language, isPrivate, password, expiresAt } = req.body;
  if (content !== undefined) {
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content required' });
    }
    if (content.length > MAX_CONTENT) return res.status(413).json({ error: 'Paste too large' });
    paste.content = content;
  }
  if (title !== undefined) paste.title = (title || '').trim().slice(0, 200);
  if (language !== undefined) paste.language = (language || 'plaintext').trim().slice(0, 40);
  if (isPrivate !== undefined) paste.isPrivate = !!isPrivate;
  if (expiresAt !== undefined) paste.expiresAt = parseExpiry(expiresAt);
  // password: omitted = unchanged, '' = cleared, non-empty = set.
  if (password !== undefined) {
    paste.password = password ? await bcrypt.hash(password, 10) : null;
  }
  paste.updatedAt = new Date();
  await paste.save();
  await logAudit(req, 'paste_edit', { shortId: paste.shortId });

  res.json({ success: true });
});

// ── Delete a paste (owner/admin) ────────────────────────────────────────────
router.delete('/:shortId', requireLogin, async (req, res) => {
  const paste = await Paste.findOne({ shortId: req.params.shortId });
  if (!paste) return res.status(404).json({ error: 'Paste not found' });

  const user = req.session.user;
  const isOwner = paste.owner.toString() === user.id.toString() || user.role === 'admin';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

  await paste.deleteOne();
  await logAudit(req, 'paste_delete', { shortId: paste.shortId });
  res.json({ success: true });
});

module.exports = router;
