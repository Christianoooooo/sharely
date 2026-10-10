const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const archiver = require('archiver');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { requireLogin, requireAdmin, requireApiKey } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { isBlockedFile } = require('../middleware/upload');
const File = require('../models/File');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const ShareLink = require('../models/ShareLink');
const Collection = require('../models/Collection');
const sanitizeFilename = require('../utils/sanitizeFilename');
const { resolveUploadPath, escapeRegex } = require('../utils/uploadPath');
const { generateThumbnail, deleteThumbnail, thumbPath } = require('../utils/generateThumbnail');
const { logAudit } = require('../utils/audit');
const { getStorageUsed, resolveQuota, checkQuota } = require('../utils/storageQuota');
const AuditLog = require('../models/AuditLog');
const mailer = require('../utils/mailer');
const { getUpdateStatus } = require('../utils/updateCheck');
const updateApply = require('../utils/updateApply');
const { broadcast } = require('../ws');

// Self-update (git pull + container rebuild) is handled by the separate updater
// container and only available when that container is wired up via docker-compose.
const SELF_UPDATE_ENABLED = process.env.UPDATE_ENABLED === 'true';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again later.' },
});

// ── Avatar helpers ──────────────────────────────────────────────────────────
const _BASE_UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads');
const AVATAR_DIR = path.join(_BASE_UPLOAD_DIR, '.avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// ── Chunk upload helpers ────────────────────────────────────────────────────
const CHUNK_DIR = path.join(_BASE_UPLOAD_DIR, '.chunks');
fs.mkdirSync(CHUNK_DIR, { recursive: true });

// Multer for individual chunks: stream each chunk straight to a temp file on the
// upload volume instead of buffering it in RAM. With parallel multi-part uploads
// (3–5 chunks of up to 20 MB in flight per upload, times many concurrent users)
// memory storage would hold hundreds of MB of buffers at once and block the event
// loop on the subsequent sync write. The temp file is validated and renamed into
// the session dir below; it is unlinked on any rejection.
// Limit is 51 MB to handle clients still using 50 MB chunks.
const chunkMulter = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHUNK_DIR),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.part`),
  }),
  limits: { fileSize: 51 * 1024 * 1024 },
});

function resolveChunkDir(uploadId) {
  if (!/^[a-f0-9]{32}$/.test(uploadId)) {
    throw new Error('Invalid upload ID');
  }
  return path.join(CHUNK_DIR, uploadId);
}

const UPLOAD_DIR = _BASE_UPLOAD_DIR;
const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3000';

/** Delete a file record: unlink disk file, remove thumbnail, write audit log, remove DB doc. */
async function deleteFileRecord(req, file) {
  const fp = resolveUploadPath(file.storedName);
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  deleteThumbnail(file.shortId);
  await logAudit(req, 'delete_file', { fileName: file.originalName, shortId: file.shortId });
  await file.deleteOne();
}

// ── File upload (API key — ShareX) ─────────────────────────────────────────
router.post('/upload', uploadLimiter, requireApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const quota = await checkQuota(req.apiUser, req.file.size);
  if (!quota.allowed) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(413).json({ error: 'Storage quota exceeded', used: quota.used, quota: quota.quota });
  }

  // storedName is relative to UPLOAD_DIR (e.g. "username/a1b2c3d4.jpg")
  const storedName = path.relative(UPLOAD_DIR, req.file.path);

  const file = await File.createUnique({
    originalName: sanitizeFilename(req.file.originalname),
    storedName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: req.apiUser._id,
  });

  generateThumbnail(req.file.path, req.file.mimetype, file.shortId).catch(() => {});

  await logAudit(req, 'upload', { fileName: file.originalName, fileSize: file.size, shortId: file.shortId });
  const apiUploaderId = String(req.apiUser._id);
  broadcast('file:uploaded', { shortId: file.shortId, uploaderId: apiUploaderId }, (c) => c.userId === apiUploaderId);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  const base = BASE_URL();
  res.json({
    url: `${base}/f/${file.shortId}`,
    raw: `${base}/f/${file.shortId}/raw`,
    delete_url: `${base}/api/delete/${file.shortId}`,
    short_id: file.shortId,
    filename: file.originalName,
    size: file.size,
  });
});

// ── Web upload (session auth) ───────────────────────────────────────────────
router.post('/web-upload', uploadLimiter, requireLogin, upload.array('files', 500), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const quotaUser = await User.findById(req.session.user.id).select('storageQuota');
  const incomingSize = req.files.reduce((sum, f) => sum + f.size, 0);
  const quota = await checkQuota(quotaUser, incomingSize);
  if (!quota.allowed) {
    for (const f of req.files) {
      try { fs.unlinkSync(f.path); } catch { /* ignore */ }
    }
    return res.status(413).json({ error: 'Storage quota exceeded', used: quota.used, quota: quota.quota });
  }

  const created = [];
  const uploaderId = String(req.session.user.id);
  for (const f of req.files) {
    // storedName is relative to UPLOAD_DIR (e.g. "username/a1b2c3d4.jpg")
    const storedName = path.relative(UPLOAD_DIR, f.path);
    const doc = await File.createUnique({
      originalName: sanitizeFilename(f.originalname),
      storedName,
      mimeType: f.mimetype,
      size: f.size,
      uploader: req.session.user.id,
    });
    generateThumbnail(f.path, f.mimetype, doc.shortId).catch(() => {});
    created.push(doc.toObject());
    await logAudit(req, 'upload', { fileName: doc.originalName, fileSize: doc.size, shortId: doc.shortId });
    broadcast('file:uploaded', { shortId: doc.shortId, uploaderId }, (c) => c.userId === uploaderId);
  }
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);

  res.json({ files: created });
});

// ── Delete file (API key) ───────────────────────────────────────────────────
router.delete('/delete/:shortId', requireApiKey, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.apiUser._id.toString();
  if (!isOwner && req.apiUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ownerId = file.uploader.toString();
  const { shortId } = file;
  await deleteFileRecord(req, file);
  broadcast('file:deleted', { shortId, uploaderId: ownerId }, (c) => c.userId === ownerId);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  res.json({ success: true });
});

// ── Delete file (session) ───────────────────────────────────────────────────
router.delete('/file/:shortId', requireLogin, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ownerId = file.uploader.toString();
  const { shortId } = file;
  await deleteFileRecord(req, file);
  broadcast('file:deleted', { shortId, uploaderId: ownerId }, (c) => c.userId === ownerId);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  res.json({ success: true });
});

// ── Update file tags / name ─────────────────────────────────────────────────
router.patch('/file/:shortId', requireLogin, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (Array.isArray(req.body.tags)) {
    file.tags = req.body.tags.slice(0, 20).map((t) => t.trim().slice(0, 50)).filter(Boolean);
  }
  if (req.body.originalName !== undefined) {
    const name = sanitizeFilename(req.body.originalName.trim()).slice(0, 255);
    if (name) file.originalName = name;
  }

  await file.save();
  res.json({ tags: file.tags, originalName: file.originalName });
});

// ── Bulk operations ──────────────────────────────────────────────────────────
router.post('/files/bulk', requireLogin, async (req, res) => {
  const { action, shortIds, tags, collectionId } = req.body;
  if (!Array.isArray(shortIds) || shortIds.length === 0) {
    return res.status(400).json({ error: 'No files specified' });
  }

  const isAdmin = req.session.user.role === 'admin';
  const filter = { shortId: { $in: shortIds } };
  if (!isAdmin) filter.uploader = req.session.user.id;

  if (action === 'delete') {
    const files = await File.find(filter);
    for (const file of files) {
      const ownerId = file.uploader.toString();
      const { shortId } = file;
      await deleteFileRecord(req, file);
      broadcast('file:deleted', { shortId, uploaderId: ownerId }, (c) => c.userId === ownerId);
    }
    broadcast('stats:invalidate', {}, (c) => c.isAdmin);
    return res.json({ success: true, count: shortIds.length });
  }

  if (action === 'tag') {
    const newTags = (tags || []).slice(0, 20).map((t) => t.trim().slice(0, 50)).filter(Boolean);
    await File.updateMany(filter, { $addToSet: { tags: { $each: newTags } } });
    return res.json({ success: true });
  }

  if (action === 'removeTag') {
    const tagsToRemove = (tags || []).slice(0, 20).map((t) => t.trim().slice(0, 50)).filter(Boolean);
    if (tagsToRemove.length === 0) return res.status(400).json({ error: 'No tags specified' });
    await File.updateMany(filter, { $pull: { tags: { $in: tagsToRemove } } });
    return res.json({ success: true });
  }

  if (action === 'addToCollection') {
    if (!collectionId) return res.status(400).json({ error: 'Collection ID required' });
    const collection = await Collection.findOne({ shortId: collectionId });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    const isCollOwner = collection.owner.toString() === req.session.user.id.toString();
    if (!isCollOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const files = await File.find(filter);
    for (const file of files) {
      if (!collection.files.some((f) => f.toString() === file._id.toString())) {
        collection.files.push(file._id);
      }
    }
    await collection.save();
    return res.json({ success: true });
  }

  if (action === 'moveToCollection') {
    if (!collectionId) return res.status(400).json({ error: 'Collection ID required' });
    const collection = await Collection.findOne({ shortId: collectionId });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    const isCollOwner = collection.owner.toString() === req.session.user.id.toString();
    if (!isCollOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const files = await File.find(filter);
    const fileIds = files.map((f) => f._id);
    const pullFilter = isAdmin
      ? { files: { $in: fileIds } }
      : { owner: req.session.user.id, files: { $in: fileIds } };
    await Collection.updateMany(pullFilter, { $pull: { files: { $in: fileIds } } });
    await Collection.findOneAndUpdate(
      { shortId: collectionId },
      { $addToSet: { files: { $each: fileIds } } },
    );
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid action' });
});

// ── Bulk download as ZIP ─────────────────────────────────────────────────────
router.post('/files/zip', requireLogin, async (req, res) => {
  const { shortIds } = req.body;
  if (!Array.isArray(shortIds) || shortIds.length === 0) {
    return res.status(400).json({ error: 'No files specified' });
  }

  const isAdmin = req.session.user.role === 'admin';
  const filter = { shortId: { $in: shortIds.slice(0, 1000) } };
  if (!isAdmin) filter.uploader = req.session.user.id;
  const files = await File.find(filter);
  if (files.length === 0) return res.status(404).json({ error: 'No files found' });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="sharely-${stamp}.zip"`);

  // Store-only: uploads are overwhelmingly pre-compressed media, so deflating
  // would burn CPU for virtually no size gain.
  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', (err) => {
    console.error('[zip] archive error:', err.message);
    res.destroy(err);
  });
  archive.pipe(res);

  // De-duplicate entry names so files sharing an originalName do not overwrite
  // each other inside the archive.
  const usedNames = new Map();
  for (const file of files) {
    let fp;
    try { fp = resolveUploadPath(file.storedName); } catch { continue; }
    if (!fs.existsSync(fp)) continue;

    let name = (file.originalName || file.shortId).replace(/[/\\]/g, '_');
    if (usedNames.has(name)) {
      const n = usedNames.get(name) + 1;
      usedNames.set(name, n);
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    } else {
      usedNames.set(name, 0);
    }
    archive.file(fp, { name });
  }

  await archive.finalize();
});

// ── Tag suggestions for current user ────────────────────────────────────────
router.get('/tags', requireLogin, async (req, res) => {
  const filter = req.session.user.role === 'admin' ? {} : { uploader: req.session.user.id };
  const tags = await File.distinct('tags', filter);
  res.json({ tags: tags.filter(Boolean).sort() });
});

// ── File metadata ───────────────────────────────────────────────────────────
router.get('/file/:shortId', async (req, res) => {
  const file = await File.findOneAndUpdate(
    { shortId: req.params.shortId },
    { $inc: { views: 1 } },
    { new: true },
  ).populate('uploader', 'username avatarExt');
  if (!file) return res.status(404).json({ error: 'File not found' });

  broadcast('file:view', { shortId: req.params.shortId, views: file.views }, () => true);

  const obj = file.toObject();
  if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
  res.json({ file: obj });
});

// ── Gallery ─────────────────────────────────────────────────────────────────
router.get('/gallery', requireLogin, async (req, res) => {
  const { q, type, tag, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const PAGE_SIZE = 24;
  const isAdmin = req.session.user.role === 'admin';

  const filter = {};
  if (!isAdmin) filter.uploader = req.session.user.id;
  if (q) filter.originalName = { $regex: escapeRegex(q), $options: 'i' };
  if (tag) filter.tags = tag;

  if (type && type !== 'all') {
    const typeMap = { image: /^image\//, video: /^video\//, audio: /^audio\//, pdf: /^application\/pdf$/ };
    if (typeMap[type]) {
      filter.mimeType = typeMap[type];
    } else if (type === 'code') {
      const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java',
        'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
        'yml', 'yaml', 'toml', 'ini', 'conf', 'json', 'xml', 'html', 'htm',
        'css', 'scss', 'less', 'md', 'sql', 'dockerfile', 'makefile', 'r',
        'swift', 'kt', 'lua', 'pl', 'ex', 'exs', 'hs', 'clj', 'vue', 'svelte'];
      const extPattern = `\\.(${codeExts.join('|')})$`;
      const typeCondition = {
        $or: [
          { originalName: { $regex: extPattern, $options: 'i' } },
          { mimeType: { $regex: '^text/' } },
        ],
      };
      if (q) {
        filter.$and = [{ originalName: filter.originalName }, typeCondition];
        delete filter.originalName;
      } else {
        Object.assign(filter, typeCondition);
      }
    }
  }

  const total = await File.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const files = await File.find(filter)
    .populate('uploader', 'username avatarExt')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  // Resolve thumbnail existence asynchronously and in parallel so the sync
  // stat calls don't block the event loop on every gallery request.
  const fileObjs = await Promise.all(
    files.map(async (f) => {
      const obj = f.toObject();
      obj.hasThumbnail = await fs.promises
        .access(thumbPath(f.shortId))
        .then(() => true)
        .catch(() => false);
      if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
      return obj;
    }),
  );

  res.json({
    files: fileObjs,
    total,
    page,
    pages,
  });
});

// ── ShareX config ───────────────────────────────────────────────────────────

// Regenerates the API key and embeds the new plaintext into the .sxcu file.
// The plaintext is never persisted — this is the only moment it is visible.
router.get('/sharex-config', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const plaintext = await user.regenerateApiKey();
  await logAudit(req, 'sharex_config');

  const config = {
    Version: '16.1.0',
    Name: 'sharely',
    DestinationType: 'ImageUploader, TextUploader, FileUploader',
    RequestMethod: 'POST',
    RequestURL: `${BASE_URL()}/upload`,
    Body: 'MultipartFormData',
    Arguments: {
      file: '{filename}',
      text: '{input}',
      token: plaintext,
    },
    FileFormName: 'upload',
    URL: '{json:url}',
    ThumbnailURL: '{json:url}/raw',
    DeletionURL: '{json:delete_url}',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="sharely.sxcu"');
  res.setHeader('X-Sharely-Api-Prefix', user.apiKeyPrefix);
  res.send(JSON.stringify(config, null, 2));
});

// ── API key management ──────────────────────────────────────────────────────
router.get('/my-key', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id).select('apiKeyPrefix');
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ prefix: user.apiKeyPrefix });
});

router.post('/regen-key', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const plaintext = await user.regenerateApiKey();
  await logAudit(req, 'regen_api_key');
  res.json({ apiKey: plaintext, prefix: user.apiKeyPrefix });
});

// ── Site settings: public read (used by privacy policy page + cookie banner) ─
router.get('/site-settings', async (req, res) => {
  const s = await SiteSettings.get();
  res.json({
    operatorName: s.operatorName,
    operatorAddress: s.operatorAddress,
    operatorEmail: s.operatorEmail,
    cloudflareAnalytics: s.cloudflareAnalytics,
    fileRetentionDays: s.fileRetentionDays,
    encryptionAtRest: s.encryptionAtRest,
    sessionDurationDays: s.sessionDurationDays ?? 7,
  });
});

// ── Admin: site settings read / write ──────────────────────────────────────
router.get('/admin/site-settings', requireAdmin, async (req, res) => {
  const s = await SiteSettings.get();
  res.json({
    operatorName: s.operatorName,
    operatorAddress: s.operatorAddress,
    operatorEmail: s.operatorEmail,
    cloudflareAnalytics: s.cloudflareAnalytics,
    fileRetentionDays: s.fileRetentionDays,
    encryptionAtRest: s.encryptionAtRest,
    sessionDurationDays: s.sessionDurationDays ?? 7,
    defaultStorageQuota: s.defaultStorageQuota ?? 0,
  });
});

router.patch('/admin/site-settings', requireAdmin, async (req, res) => {
  const { operatorName, operatorAddress, operatorEmail, cloudflareAnalytics, fileRetentionDays, encryptionAtRest, sessionDurationDays, defaultStorageQuota } = req.body;
  const s = await SiteSettings.get();
  if (typeof operatorName === 'string') s.operatorName = operatorName.trim();
  if (typeof operatorAddress === 'string') s.operatorAddress = operatorAddress.trim();
  if (typeof operatorEmail === 'string') {
    const trimmed = operatorEmail.trim();
    if (trimmed !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    s.operatorEmail = trimmed;
  }
  if (typeof cloudflareAnalytics === 'boolean') s.cloudflareAnalytics = cloudflareAnalytics;
  if (typeof fileRetentionDays === 'number' && fileRetentionDays >= 0) s.fileRetentionDays = Math.floor(fileRetentionDays);
  if (typeof encryptionAtRest === 'boolean') s.encryptionAtRest = encryptionAtRest;
  if (typeof sessionDurationDays === 'number' && sessionDurationDays >= 1) s.sessionDurationDays = Math.floor(sessionDurationDays);
  if (typeof defaultStorageQuota === 'number' && defaultStorageQuota >= 0) s.defaultStorageQuota = Math.floor(defaultStorageQuota);
  await s.save();
  const settingsPayload = {
    operatorName: s.operatorName,
    operatorAddress: s.operatorAddress,
    operatorEmail: s.operatorEmail,
    cloudflareAnalytics: s.cloudflareAnalytics,
    fileRetentionDays: s.fileRetentionDays,
    encryptionAtRest: s.encryptionAtRest,
    sessionDurationDays: s.sessionDurationDays,
    defaultStorageQuota: s.defaultStorageQuota,
  };
  broadcast('settings:updated', settingsPayload, (c) => c.isAdmin);
  res.json(settingsPayload);
});

// ── Admin: update check ─────────────────────────────────────────────────────
router.get('/admin/update-check', requireAdmin, async (req, res) => {
  const status = await getUpdateStatus({ force: req.query.refresh === '1' });
  res.json({ ...status, selfUpdate: SELF_UPDATE_ENABLED });
});

// ── Admin: self-update apply / status ───────────────────────────────────────
router.get('/admin/update-status', requireAdmin, (req, res) => {
  if (!SELF_UPDATE_ENABLED) return res.json({ enabled: false, state: 'disabled', log: '' });
  res.json({ enabled: true, ...updateApply.getApplyStatus() });
});

router.post('/admin/update-apply', requireAdmin, async (req, res) => {
  if (!SELF_UPDATE_ENABLED) {
    return res.status(400).json({ error: 'Self-update is not enabled on this instance' });
  }
  try {
    await updateApply.requestUpdate();
    await logAudit(req, 'update-apply', {});
    res.json({ state: 'queued' });
  } catch (err) {
    if (err.code === 'RUNNING') return res.status(409).json({ error: 'An update is already in progress' });
    if (err.code === 'NO_UPDATER') {
      return res.status(503).json({ error: 'The updater container is not running. Start it with: docker compose --profile updater up -d' });
    }
    console.error('[update-apply] failed to queue:', err.message);
    return res.status(500).json({ error: 'Could not start the update. Check the control volume permissions.' });
  }
});

router.post('/admin/update-ack', requireAdmin, async (req, res) => {
  if (!SELF_UPDATE_ENABLED) return res.json({ state: 'disabled' });
  await updateApply.ackState();
  res.json({ state: 'idle' });
});

// ── Admin: stats ────────────────────────────────────────────────────────────
router.get('/admin/stats', requireAdmin, async (req, res) => {
  const [userCount, fileCount] = await Promise.all([
    User.countDocuments(),
    File.countDocuments(),
  ]);
  const agg = await File.aggregate([{ $group: { _id: null, total: { $sum: '$size' } } }]);
  const totalSize = agg[0]?.total || 0;
  const recentFiles = await File.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('uploader', 'username avatarExt');

  res.json({
    userCount, fileCount, totalSize,
    recentFiles: recentFiles.map((f) => {
      const obj = f.toObject();
      if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
      return obj;
    }),
  });
});

// ── Admin: users ────────────────────────────────────────────────────────────
router.get('/admin/users', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  const counts = await File.aggregate([
    { $group: { _id: '$uploader', count: { $sum: 1 }, size: { $sum: '$size' } } },
  ]);
  const statsMap = {};
  counts.forEach((c) => { statsMap[c._id.toString()] = c; });

  const result = users.map((u) => ({
    ...u.toObject(),
    password: undefined,
    apiKey: undefined,
    apiKeyHash: undefined,
    emailVerificationToken: undefined,
    emailVerificationExpires: undefined,
    passwordResetToken: undefined,
    passwordResetExpires: undefined,
    avatarUrl: u.avatarExt ? `/api/user/avatar/${u._id}` : undefined,
    fileCount: statsMap[u._id.toString()]?.count || 0,
    storageUsed: statsMap[u._id.toString()]?.size || 0,
  }));

  const settings = await SiteSettings.get();
  res.json({ users: result, defaultStorageQuota: settings.defaultStorageQuota ?? 0 });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 32) return res.status(400).json({ error: 'Username must be 3–32 characters' });
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, dashes and underscores' });
  }
  if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });
  const exists = await User.findOne({ username });
  if (exists) return res.status(409).json({ error: 'Username already taken' });
  const user = await User.create({ username, password, role: role === 'admin' ? 'admin' : 'user' });
  await logAudit(req, 'admin_create_user', { targetUsername: username, role: user.role });
  broadcast('user:created', { id: user._id.toString(), username: user.username, role: user.role, folderName: user.folderName, isActive: user.isActive, createdAt: user.createdAt, apiKeyPrefix: user.apiKeyPrefix }, (c) => c.isAdmin);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  res.status(201).json({ user: { id: user._id, username: user.username, role: user.role } });
});

router.patch('/admin/users/:id/toggle', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot deactivate yourself' });
  }
  user.isActive = !user.isActive;
  await user.save();
  await logAudit(req, 'admin_toggle_user', { targetUsername: user.username, isActive: user.isActive });
  broadcast('user:updated', { id: user._id.toString(), isActive: user.isActive }, (c) => c.isAdmin);
  res.json({ isActive: user.isActive });
});

router.patch('/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  user.role = role;
  await user.save();
  await logAudit(req, 'admin_change_role', { targetUsername: user.username, role });
  broadcast('user:updated', { id: user._id.toString(), role: user.role }, (c) => c.isAdmin);
  res.json({ role: user.role });
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const userFiles = await File.find({ uploader: user._id });
  for (const f of userFiles) {
    try {
      const fp = resolveUploadPath(f.storedName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* skip invalid paths */ }
  }
  await File.deleteMany({ uploader: user._id });
  await logAudit(req, 'admin_delete_user', { targetUsername: user.username });
  const deletedUserId = user._id.toString();
  await user.deleteOne();
  broadcast('user:deleted', { id: deletedUserId }, (c) => c.isAdmin);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  res.json({ success: true });
});

router.post('/admin/users/:id/regen-key', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const plaintext = await user.regenerateApiKey();
  await logAudit(req, 'admin_regen_key', { targetUsername: user.username });
  res.json({ apiKey: plaintext, prefix: user.apiKeyPrefix });
});

router.patch('/admin/users/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.password = password;
  await user.save();
  await logAudit(req, 'admin_change_password', { targetUsername: user.username });
  res.json({ success: true });
});

router.patch('/admin/users/:id/folder', requireAdmin, async (req, res) => {
  const { folderName } = req.body;
  if (!folderName || typeof folderName !== 'string') {
    return res.status(400).json({ error: 'folderName required' });
  }
  const trimmed = folderName.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed) || trimmed.length > 64) {
    return res.status(400).json({ error: 'Folder name may only contain letters, numbers, dashes and underscores (max 64 chars)' });
  }
  const conflict = await User.findOne({ folderName: trimmed, _id: { $ne: req.params.id } });
  if (conflict) return res.status(409).json({ error: 'Folder name already taken' });

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const oldFolderName = user.folderName;

  if (oldFolderName !== trimmed) {
    const oldPath = path.join(UPLOAD_DIR, oldFolderName);
    const newPath = path.join(UPLOAD_DIR, trimmed);

    // Rename the physical directory on the volume if it exists
    if (fs.existsSync(oldPath)) {
      await fs.promises.rename(oldPath, newPath);
    }

    // Update storedName in all File documents for this user
    const filesToUpdate = await File.find({
      uploader: user._id,
      storedName: { $regex: `^${oldFolderName}/` },
    });
    if (filesToUpdate.length > 0) {
      await File.bulkWrite(filesToUpdate.map(file => ({
        updateOne: {
          filter: { _id: file._id },
          update: { $set: { storedName: trimmed + file.storedName.slice(oldFolderName.length) } },
        },
      })));
    }

    user.folderName = trimmed;
    await user.save();
    broadcast('user:updated', { id: user._id.toString(), folderName: trimmed }, (c) => c.isAdmin);
  }

  res.json({ folderName: user.folderName });
});

// ── Admin: per-user storage quota ───────────────────────────────────────────
router.patch('/admin/users/:id/quota', requireAdmin, async (req, res) => {
  const { quota } = req.body;
  let value;
  if (quota === null) {
    value = null;
  } else if (typeof quota === 'number' && Number.isFinite(quota) && quota >= 0) {
    value = Math.floor(quota);
  } else {
    return res.status(400).json({ error: 'quota must be null or a non-negative number of bytes' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.storageQuota = value;
  await user.save();
  await logAudit(req, 'admin_set_quota', { targetUsername: user.username, quota: value });
  broadcast('user:updated', { id: user._id.toString(), storageQuota: value }, (c) => c.isAdmin);
  res.json({ storageQuota: value });
});

// ── User: export data (GDPR Art. 20) ───────────────────────────────────────
router.get('/user/predefined-tags', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id).select('predefinedTags');
  res.json({ tags: user?.predefinedTags || [] });
});

// ── User: storage usage & quota ─────────────────────────────────────────────
router.get('/user/storage', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id).select('storageQuota');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const settings = await SiteSettings.get();
  const quota = resolveQuota(user.storageQuota, settings.defaultStorageQuota);
  const used = await getStorageUsed(user._id);
  res.json({ used, quota, unlimited: quota <= 0 });
});

router.patch('/user/predefined-tags', requireLogin, async (req, res) => {
  let { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
  tags = [...new Set(tags.map((t) => String(t).trim().slice(0, 50)).filter(Boolean))].slice(0, 100);
  await User.findByIdAndUpdate(req.session.user.id, { predefinedTags: tags });
  res.json({ tags });
});

router.get('/user/export', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id)
    .select('username role createdAt embedMode');
  if (!user) return res.status(404).json({ error: 'Not found' });

  const files = await File.find({ uploader: user._id })
    .select('originalName mimeType size views createdAt shortId')
    .sort({ createdAt: -1 });

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: {
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      embedMode: user.embedMode,
    },
    files: files.map((f) => ({
      name: f.originalName,
      type: f.mimeType,
      size: f.size,
      views: f.views,
      uploadedAt: f.createdAt,
      url: `${BASE_URL()}/f/${f.shortId}`,
    })),
  };

  await logAudit(req, 'export_data');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sharely-export-${user.username}.json"`,
  );
  res.send(JSON.stringify(exportData, null, 2));
});

// ── User: delete own account (GDPR Art. 17) ────────────────────────────────
router.delete('/user/account', requireLogin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const valid = await user.comparePassword(password);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  const userFiles = await File.find({ uploader: user._id });
  for (const f of userFiles) {
    try {
      const fp = resolveUploadPath(f.storedName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* skip invalid paths */ }
    deleteThumbnail(f.shortId);
  }
  await File.deleteMany({ uploader: user._id });

  if (user.avatarExt) {
    try {
      fs.unlinkSync(path.join(AVATAR_DIR, `${user._id}${user.avatarExt}`));
    } catch { /* ignore */ }
  }

  // Anonymize audit log entries before deleting the user (Art. 17 GDPR)
  await AuditLog.updateMany(
    { userId: user._id },
    { $set: { username: '[deleted]', ip: null, userId: null } },
  );

  await logAudit(req, 'delete_account');
  const selfDeleteId = user._id.toString();
  await user.deleteOne();
  broadcast('user:deleted', { id: selfDeleteId }, (c) => c.isAdmin);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);
  req.session.destroy(() => res.json({ success: true }));
});

// ── User: change own username (GDPR Art. 16 – Rectification) ──────────────
router.patch('/user/username', requireLogin, async (req, res) => {
  const { newUsername, password } = req.body;
  if (!newUsername || !password) {
    return res.status(400).json({ error: 'New username and current password required' });
  }
  const trimmed = newUsername.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, dashes and underscores' });
  }
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const valid = await user.comparePassword(password);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });
  const conflict = await User.findOne({ username: trimmed, _id: { $ne: user._id } });
  if (conflict) return res.status(409).json({ error: 'Username already taken' });
  const oldUsername = user.username;
  user.username = trimmed;
  await user.save();
  req.session.user = { ...req.session.user, username: trimmed };
  await logAudit(req, 'change_username', { oldUsername, newUsername: trimmed });
  broadcast('user:updated', { id: user._id.toString(), username: trimmed }, (c) => c.isAdmin);
  res.json({ success: true, username: trimmed });
});

// ── User: change own password ───────────────────────────────────────────────
router.patch('/user/password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'New password must be at least 12 characters' });
  }
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const valid = await user.comparePassword(currentPassword);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  user.password = newPassword;
  await user.save();
  await logAudit(req, 'change_password');
  res.json({ success: true });
});

// ── User: set email address ─────────────────────────────────────────────────
router.patch('/user/email', requireLogin, async (req, res) => {
  const { email, password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const valid = await user.comparePassword(password);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  const trimmed = (email || '').toLowerCase().trim();

  if (trimmed) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const conflict = await User.findOne({ email: trimmed, _id: { $ne: user._id } });
    if (conflict) return res.status(409).json({ error: 'Email already in use' });
  }

  const plaintext = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');

  user.email = trimmed || null;
  user.emailVerified = false;
  user.emailVerificationToken = trimmed ? hash : null;
  user.emailVerificationExpires = trimmed ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  await user.save();

  if (trimmed) {
    const verifyUrl = `${process.env.BASE_URL || ''}/api/auth/verify-email?token=${plaintext}`;
    mailer.sendEmailVerificationEmail(trimmed, user.username, verifyUrl, user.language || 'en').catch((err) => {
      console.error('Failed to send verification email:', err.message);
    });
  }

  await logAudit(req, 'change_email');
  res.json({ success: true });
});

// ── User: set language preference ──────────────────────────────────────────
router.patch('/user/language', requireLogin, async (req, res) => {
  const { language } = req.body;
  const allowed = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh'];
  if (!language || !allowed.includes(language)) {
    return res.status(400).json({ error: 'Invalid language' });
  }
  await User.findByIdAndUpdate(req.session.user.id, { language });
  res.json({ success: true });
});

// ── User: resend verification email ────────────────────────────────────────
router.post('/user/resend-verification', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (!user.email || user.emailVerified) return res.status(400).json({ error: 'No unverified email' });

  const plaintext = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  user.emailVerificationToken = hash;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const verifyUrl = `${process.env.BASE_URL || ''}/api/auth/verify-email?token=${plaintext}`;
  mailer.sendEmailVerificationEmail(user.email, user.username, verifyUrl, user.language || 'en').catch((err) => {
    console.error('Failed to resend verification email:', err.message);
  });
  res.json({ success: true });
});

// ── User: set embed mode ────────────────────────────────────────────────────
router.patch('/user/embed-mode', requireLogin, async (req, res) => {
  const { embedMode } = req.body;
  if (!['embed', 'raw'].includes(embedMode)) {
    return res.status(400).json({ error: 'Invalid embed mode' });
  }
  const user = await User.findByIdAndUpdate(
    req.session.user.id,
    { embedMode },
    { new: true },
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ embedMode: user.embedMode });
});

// ── Chunked upload: init session ───────────────────────────────────────────
router.post('/chunk/init', requireLogin, async (req, res) => {
  const { filename, mimeType, totalSize, totalChunks } = req.body;

  if (!filename || !mimeType || !totalSize || !totalChunks) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const totalChunksInt = parseInt(totalChunks, 10);
  if (!Number.isInteger(totalChunksInt) || totalChunksInt < 1 || totalChunksInt > 10000) {
    return res.status(400).json({ error: 'Invalid totalChunks' });
  }

  const totalSizeInt = parseInt(totalSize, 10);
  if (!Number.isInteger(totalSizeInt) || totalSizeInt < 1) {
    return res.status(400).json({ error: 'Invalid totalSize' });
  }

  if (isBlockedFile(mimeType, filename)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }

  const quotaUser = await User.findById(req.session.user.id).select('storageQuota');
  const quota = await checkQuota(quotaUser, totalSizeInt);
  if (!quota.allowed) {
    return res.status(413).json({ error: 'Storage quota exceeded', used: quota.used, quota: quota.quota });
  }

  const uploadId = crypto.randomBytes(16).toString('hex');
  const sessionDir = resolveChunkDir(uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, 'meta.json'),
    JSON.stringify({
      filename,
      mimeType,
      totalSize: totalSizeInt,
      totalChunks: totalChunksInt,
      userId: req.session.user.id,
      createdAt: Date.now(),
    }),
  );

  res.json({ uploadId });
});

// ── Chunked upload: receive one chunk ──────────────────────────────────────
router.post('/chunk/:uploadId', requireLogin, chunkMulter.single('chunk'), async (req, res) => {
  // Multer has already streamed the chunk to a temp file; drop it on any rejection.
  const rejectWith = async (status, error) => {
    if (req.file?.path) {
      try { await fs.promises.unlink(req.file.path); } catch { /* ignore */ }
    }
    return res.status(status).json({ error });
  };

  let sessionDir;
  try {
    sessionDir = resolveChunkDir(req.params.uploadId);
  } catch {
    return rejectWith(400, 'Invalid upload ID');
  }

  if (!fs.existsSync(sessionDir)) {
    return rejectWith(404, 'Upload session not found');
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'meta.json'), 'utf8'));
  } catch {
    return rejectWith(500, 'Failed to read session metadata');
  }

  if (meta.userId !== req.session.user.id.toString()) {
    return rejectWith(403, 'Forbidden');
  }

  const chunkIndex = parseInt(req.body.chunkIndex, 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
    return rejectWith(400, 'Invalid chunkIndex');
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No chunk data' });
  }

  await fs.promises.rename(req.file.path, path.join(sessionDir, `chunk-${chunkIndex}`));
  res.json({ received: chunkIndex });
});

// ── Chunked upload: assemble final file ────────────────────────────────────
router.post('/chunk/:uploadId/complete', requireLogin, async (req, res) => {
  let sessionDir;
  try {
    sessionDir = resolveChunkDir(req.params.uploadId);
  } catch {
    return res.status(400).json({ error: 'Invalid upload ID' });
  }

  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'meta.json'), 'utf8'));
  } catch {
    return res.status(500).json({ error: 'Failed to read session metadata' });
  }

  if (meta.userId !== req.session.user.id.toString()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  for (let i = 0; i < meta.totalChunks; i++) {
    if (!fs.existsSync(path.join(sessionDir, `chunk-${i}`))) {
      return res.status(400).json({ error: `Missing chunk ${i}` });
    }
  }

  const user = await User.findById(meta.userId).select('folderName username storageQuota');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const quota = await checkQuota(user, meta.totalSize);
  if (!quota.allowed) {
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return res.status(413).json({ error: 'Storage quota exceeded', used: quota.used, quota: quota.quota });
  }

  const folder = user.folderName || user.username;
  const userDir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(userDir, { recursive: true });

  const ext = path.extname(meta.filename);
  const fileId = crypto.randomBytes(4).toString('hex');
  const finalPath = path.join(userDir, `${fileId}${ext}`);

  if (!finalPath.startsWith(UPLOAD_DIR + path.sep)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Stream-assemble chunks into the final file
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(finalPath);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);

    let i = 0;
    function writeNext() {
      if (i >= meta.totalChunks) { writeStream.end(); return; }
      const readStream = fs.createReadStream(path.join(sessionDir, `chunk-${i}`));
      readStream.on('error', reject);
      readStream.on('end', () => { i++; writeNext(); });
      readStream.pipe(writeStream, { end: false });
    }
    writeNext();
  });

  try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch { /* ignore */ }

  const storedName = path.relative(UPLOAD_DIR, finalPath);
  const doc = await File.createUnique({
    originalName: sanitizeFilename(meta.filename),
    storedName,
    mimeType: meta.mimeType,
    size: meta.totalSize,
    uploader: meta.userId,
  });

  generateThumbnail(finalPath, meta.mimeType, doc.shortId).catch(() => {});
  await logAudit(req, 'upload', { fileName: doc.originalName, fileSize: doc.size, shortId: doc.shortId });

  const chunkUploaderId = String(meta.userId);
  broadcast('file:uploaded', { shortId: doc.shortId, uploaderId: chunkUploaderId }, (c) => c.userId === chunkUploaderId);
  broadcast('stats:invalidate', {}, (c) => c.isAdmin);

  res.json({ files: [doc.toObject()] });
});

// ── Chunked upload: cancel / cleanup ───────────────────────────────────────
router.delete('/chunk/:uploadId', requireLogin, (req, res) => {
  try {
    const sessionDir = resolveChunkDir(req.params.uploadId);
    if (fs.existsSync(sessionDir)) {
      const metaPath = path.join(sessionDir, 'meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.userId === req.session.user.id.toString()) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      }
    }
  } catch { /* ignore invalid IDs */ }
  res.json({ success: true });
});

// ── Avatar: upload ──────────────────────────────────────────────────────────
router.post('/user/avatar', requireLogin, avatarMulter.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  // Derive the extension strictly from the validated MIME type, never from the
  // client-supplied filename: an attacker could otherwise store "x.html"/"x.svg"
  // and have it served as active content from our own origin (stored XSS).
  const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
  const ext = mimeToExt[req.file.mimetype];
  if (!ext) return res.status(400).json({ error: 'Only JPEG, PNG, GIF or WebP images are allowed' });

  const userId = req.session.user.id;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (user.avatarExt) {
    try { fs.unlinkSync(path.join(AVATAR_DIR, `${userId}${user.avatarExt}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  fs.writeFileSync(path.join(AVATAR_DIR, `${userId}${ext}`), req.file.buffer);
  user.avatarExt = ext;
  await user.save();

  res.json({ avatarUrl: `/api/user/avatar/${userId}` });
});

// ── Avatar: delete ──────────────────────────────────────────────────────────
router.delete('/user/avatar', requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (user.avatarExt) {
    try { fs.unlinkSync(path.join(AVATAR_DIR, `${userId}${user.avatarExt}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    user.avatarExt = null;
    await user.save();
  }

  res.json({ success: true });
});

// ── Avatar: serve ───────────────────────────────────────────────────────────
router.get('/user/avatar/:userId', async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const user = await User.findById(req.params.userId).select('avatarExt');
  if (!user || !user.avatarExt) return res.status(404).json({ error: 'No avatar' });

  const avatarPath = path.join(AVATAR_DIR, `${req.params.userId}${user.avatarExt}`);
  if (!fs.existsSync(avatarPath)) return res.status(404).json({ error: 'Avatar not found' });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');
  res.sendFile(avatarPath);
});

// ── Admin: audit log ────────────────────────────────────────────────────────
router.get('/admin/audit-log', requireAdmin, async (req, res) => {
  const { user: userFilter, action: actionFilter, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const PAGE_SIZE = 50;

  const filter = {};
  if (userFilter) filter.username = { $regex: escapeRegex(userFilter), $options: 'i' };
  if (actionFilter) filter.action = actionFilter;

  const total = await AuditLog.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const logs = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.json({ logs: logs.map((l) => l.toObject()), total, page, pages });
});

// ── Admin: audit log CSV export ──────────────────────────────────────────────
router.get('/admin/audit-log/export', requireAdmin, async (req, res) => {
  const { user: userFilter, action: actionFilter } = req.query;
  const filter = {};
  if (userFilter) filter.username = { $regex: escapeRegex(userFilter), $options: 'i' };
  if (actionFilter) filter.action = actionFilter;

  const logs = await AuditLog.find(filter).sort({ timestamp: -1 });

  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'timestamp,username,action,ip,meta\n';
  const rows = logs.map((l) => {
    const meta = l.meta ? Object.entries(l.meta).map(([k, v]) => `${k}:${v}`).join(';') : '';
    return [escape(l.timestamp?.toISOString() ?? ''), escape(l.username ?? ''), escape(l.action), escape(l.ip ?? ''), escape(meta)].join(',');
  });

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${date}.csv"`);
  res.send('﻿' + header + rows.join('\n'));
});

// ── Admin: all files ────────────────────────────────────────────────────────
router.get('/admin/files', requireAdmin, async (req, res) => {
  const { q, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const PAGE_SIZE = 30;

  const filter = q ? { originalName: { $regex: escapeRegex(q), $options: 'i' } } : {};
  const total = await File.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const files = await File.find(filter)
    .populate('uploader', 'username avatarExt')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  // Resolve thumbnail existence asynchronously and in parallel so the sync
  // stat calls don't block the event loop on every gallery request.
  const fileObjs = await Promise.all(
    files.map(async (f) => {
      const obj = f.toObject();
      obj.hasThumbnail = await fs.promises
        .access(thumbPath(f.shortId))
        .then(() => true)
        .catch(() => false);
      if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
      return obj;
    }),
  );

  res.json({
    files: fileObjs,
    total,
    page,
    pages,
  });
});

// ── Share links ─────────────────────────────────────────────────────────────

// List share links for a file (owner / admin only)
router.get('/file/:shortId/share-links', requireLogin, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const links = await ShareLink.find({ file: file._id }).sort({ createdAt: -1 });
  const base = BASE_URL();
  res.json({
    links: links.map((l) => ({
      token: l.token,
      label: l.label,
      hasPassword: !!l.password,
      expiresAt: l.expiresAt,
      downloadLimit: l.downloadLimit,
      downloadCount: l.downloadCount,
      createdAt: l.createdAt,
      expired: l.expiresAt ? l.expiresAt < new Date() : false,
      limitReached: l.downloadLimit !== -1 && l.downloadCount >= l.downloadLimit,
      url: `${base}/s/${l.token}`,
    })),
  });
});

// Create a share link for a file (owner / admin only)
router.post('/file/:shortId/share-links', requireLogin, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { password, expiresAt, downloadLimit, label } = req.body;

  const linkData = {
    file: file._id,
    createdBy: req.session.user.id,
    label: (label || '').trim().slice(0, 100),
    downloadLimit: typeof downloadLimit === 'number' && downloadLimit > 0
      ? Math.floor(downloadLimit) : -1,
  };

  if (password) linkData.password = await bcrypt.hash(password, 10);

  if (expiresAt) {
    const date = new Date(expiresAt);
    if (isNaN(date.getTime()) || date <= new Date()) {
      return res.status(400).json({ error: 'Invalid expiry date' });
    }
    linkData.expiresAt = date;
  }

  const link = await ShareLink.create(linkData);
  const base = BASE_URL();
  res.status(201).json({
    token: link.token,
    label: link.label,
    hasPassword: !!link.password,
    expiresAt: link.expiresAt,
    downloadLimit: link.downloadLimit,
    downloadCount: 0,
    createdAt: link.createdAt,
    expired: false,
    limitReached: false,
    url: `${base}/s/${link.token}`,
  });
});

// Delete a share link (owner / creator / admin)
router.delete('/share-links/:token', requireLogin, async (req, res) => {
  const link = await ShareLink.findOne({ token: req.params.token }).populate('file', 'uploader');
  if (!link) return res.status(404).json({ error: 'Share link not found' });

  const isOwner = link.file?.uploader?.toString() === req.session.user.id.toString();
  const isCreator = link.createdBy?.toString() === req.session.user.id.toString();
  if (!isOwner && !isCreator && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await link.deleteOne();
  res.json({ success: true });
});

// Get share link metadata — public, used by ShareView page
router.get('/share-links/:token', async (req, res) => {
  const link = await ShareLink.findOne({ token: req.params.token }).populate('file', 'originalName mimeType size shortId');
  if (!link) return res.status(404).json({ error: 'Share link not found' });

  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(410).json({ error: 'expired' });
  }
  if (link.downloadLimit !== -1 && link.downloadCount >= link.downloadLimit) {
    return res.status(403).json({ error: 'limit_reached' });
  }

  res.json({
    hasPassword: !!link.password,
    expiresAt: link.expiresAt,
    downloadLimit: link.downloadLimit,
    downloadCount: link.downloadCount,
    label: link.label,
    file: {
      originalName: link.file?.originalName,
      size: link.file?.size,
      mimeType: link.file?.mimeType,
      shortId: link.file?.shortId,
    },
  });
});

// Verify share link password — stores result in session
router.post('/share-links/:token/verify', async (req, res) => {
  const link = await ShareLink.findOne({ token: req.params.token });
  if (!link) return res.status(404).json({ error: 'Share link not found' });

  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(410).json({ error: 'expired' });
  }
  if (!link.password) return res.json({ success: true });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const valid = await bcrypt.compare(password, link.password);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });

  if (!req.session.verifiedShareLinks) req.session.verifiedShareLinks = [];
  if (!req.session.verifiedShareLinks.includes(req.params.token)) {
    req.session.verifiedShareLinks.push(req.params.token);
  }

  res.json({ success: true });
});

// ── Collections ─────────────────────────────────────────────────────────────

// List collections (owner sees their own; admin sees all)
router.get('/collections', requireLogin, async (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const filter = isAdmin ? {} : { owner: req.session.user.id };
  const collections = await Collection.find(filter).sort({ createdAt: -1 });

  res.json({
    collections: collections.map((c) => ({
      shortId: c.shortId,
      name: c.name,
      description: c.description,
      fileCount: c.files.length,
      hasPassword: !!c.password,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      expired: c.expiresAt ? c.expiresAt < new Date() : false,
    })),
  });
});

// Create a collection
router.post('/collections', requireLogin, async (req, res) => {
  const { name, description, password, expiresAt } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

  const collData = {
    name: name.trim().slice(0, 100),
    description: (description || '').trim().slice(0, 500),
    owner: req.session.user.id,
  };

  if (password) collData.password = await bcrypt.hash(password, 10);

  if (expiresAt) {
    const date = new Date(expiresAt);
    if (!isNaN(date.getTime()) && date > new Date()) collData.expiresAt = date;
  }

  const collection = await Collection.createUnique(collData);
  const base = BASE_URL();
  res.status(201).json({
    shortId: collection.shortId,
    name: collection.name,
    description: collection.description,
    fileCount: 0,
    hasPassword: !!collection.password,
    expiresAt: collection.expiresAt,
    createdAt: collection.createdAt,
    expired: false,
    url: `${base}/c/${collection.shortId}`,
  });
});

// Get collection (public — returns files if password verified or not set)
router.get('/collections/:id', async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id })
    .populate('owner', 'username')
    .populate('files', 'shortId originalName mimeType size createdAt');

  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  if (collection.expiresAt && collection.expiresAt < new Date()) {
    return res.status(410).json({ error: 'expired' });
  }

  const isOwnerOrAdmin = req.session?.user &&
    (req.session.user.id.toString() === collection.owner._id.toString() ||
      req.session.user.role === 'admin');

  const verified = Array.isArray(req.session?.verifiedCollections) &&
    req.session.verifiedCollections.includes(req.params.id);

  const needsPassword = collection.password && !verified && !isOwnerOrAdmin;

  const files = needsPassword ? [] : await Promise.all(
    collection.files.map(async (f) => ({
      shortId: f.shortId,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      createdAt: f.createdAt,
      hasThumbnail: await fs.promises
        .access(thumbPath(f.shortId))
        .then(() => true)
        .catch(() => false),
    })),
  );

  res.json({
    shortId: collection.shortId,
    name: collection.name,
    description: collection.description,
    owner: collection.owner.username,
    hasPassword: !!collection.password,
    needsPassword,
    isOwner: !!isOwnerOrAdmin,
    expiresAt: collection.expiresAt,
    createdAt: collection.createdAt,
    files,
  });
});

// Update a collection (owner / admin)
router.patch('/collections/:id', requireLogin, async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.owner.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { name, description, password, clearPassword, expiresAt, clearExpiry } = req.body;
  if (name !== undefined) collection.name = name.trim().slice(0, 100);
  if (description !== undefined) collection.description = description.trim().slice(0, 500);

  if (clearPassword) collection.password = null;
  else if (password) collection.password = await bcrypt.hash(password, 10);

  if (clearExpiry) collection.expiresAt = null;
  else if (expiresAt) {
    const date = new Date(expiresAt);
    if (!isNaN(date.getTime()) && date > new Date()) collection.expiresAt = date;
  }

  await collection.save();
  res.json({
    shortId: collection.shortId,
    name: collection.name,
    description: collection.description,
    fileCount: collection.files.length,
    hasPassword: !!collection.password,
    expiresAt: collection.expiresAt,
    createdAt: collection.createdAt,
  });
});

// Delete a collection (owner / admin)
router.delete('/collections/:id', requireLogin, async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.owner.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await collection.deleteOne();
  res.json({ success: true });
});

// Add a file to a collection (owner / admin; file must belong to owner)
router.post('/collections/:id/files', requireLogin, async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.owner.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { shortId } = req.body;
  const fileFilter = { shortId };
  if (req.session.user.role !== 'admin') fileFilter.uploader = req.session.user.id;
  const file = await File.findOne(fileFilter);
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!collection.files.some((f) => f.toString() === file._id.toString())) {
    collection.files.push(file._id);
    await collection.save();
  }

  res.json({ success: true, fileCount: collection.files.length });
});

// Remove a file from a collection (owner / admin)
router.delete('/collections/:id/files/:fileShortId', requireLogin, async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.owner.toString() === req.session.user.id.toString();
  if (!isOwner && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const file = await File.findOne({ shortId: req.params.fileShortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  collection.files = collection.files.filter((f) => f.toString() !== file._id.toString());
  await collection.save();
  res.json({ success: true, fileCount: collection.files.length });
});

// Verify collection password — stores result in session
router.post('/collections/:id/verify', async (req, res) => {
  const collection = await Collection.findOne({ shortId: req.params.id });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  if (!collection.password) return res.json({ success: true });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const valid = await bcrypt.compare(password, collection.password);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });

  if (!req.session.verifiedCollections) req.session.verifiedCollections = [];
  if (!req.session.verifiedCollections.includes(req.params.id)) {
    req.session.verifiedCollections.push(req.params.id);
  }

  res.json({ success: true });
});

module.exports = router;
