const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { requireLogin, requireAdmin, requireApiKey } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { isBlockedFile } = require('../middleware/upload');
const File = require('../models/File');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const sanitizeFilename = require('../utils/sanitizeFilename');
const { generateThumbnail, deleteThumbnail, thumbPath } = require('../utils/generateThumbnail');

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

// Multer for individual chunks (memory storage).
// Limit is 51 MB to handle clients still using 50 MB chunks.
// Once the Docker image is rebuilt with the new client (max 20 MB chunks),
// this limit is still safely above the 20 MB maximum.
const chunkMulter = multer({
  storage: multer.memoryStorage(),
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

/** Escape special regex characters to prevent ReDoS via user-supplied search terms. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve storedName to an absolute path and guard against path traversal. */
function resolveUploadPath(storedName) {
  const resolved = path.resolve(UPLOAD_DIR, storedName);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// ── File upload (API key — ShareX) ─────────────────────────────────────────
router.post('/upload', uploadLimiter, requireApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  // storedName is relative to UPLOAD_DIR (e.g. "username/a1b2c3d4.jpg")
  const storedName = path.relative(UPLOAD_DIR, req.file.path);

  const file = await File.create({
    originalName: sanitizeFilename(req.file.originalname),
    storedName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: req.apiUser._id,
  });

  generateThumbnail(req.file.path, req.file.mimetype, file.shortId).catch(() => {});

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

  const created = [];
  for (const f of req.files) {
    // storedName is relative to UPLOAD_DIR (e.g. "username/a1b2c3d4.jpg")
    const storedName = path.relative(UPLOAD_DIR, f.path);
    const doc = await File.create({
      originalName: sanitizeFilename(f.originalname),
      storedName,
      mimeType: f.mimetype,
      size: f.size,
      uploader: req.session.user.id,
    });
    generateThumbnail(f.path, f.mimetype, doc.shortId).catch(() => {});
    created.push(doc.toObject());
  }

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

  const fp = resolveUploadPath(file.storedName);
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  deleteThumbnail(file.shortId);
  await file.deleteOne();
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

  const fp = resolveUploadPath(file.storedName);
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  deleteThumbnail(file.shortId);
  await file.deleteOne();
  res.json({ success: true });
});

// ── File metadata ───────────────────────────────────────────────────────────
router.get('/file/:shortId', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId }).populate('uploader', 'username');
  if (!file) return res.status(404).json({ error: 'File not found' });

  file.views += 1;
  await file.save();

  res.json({ file: file.toObject() });
});

// ── Gallery ─────────────────────────────────────────────────────────────────
router.get('/gallery', requireLogin, async (req, res) => {
  const { q, type, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const PAGE_SIZE = 24;
  const isAdmin = req.session.user.role === 'admin';

  const filter = {};
  if (!isAdmin) filter.uploader = req.session.user.id;
  if (q) filter.originalName = { $regex: escapeRegex(q), $options: 'i' };

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
    .populate('uploader', 'username')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.json({
    files: files.map((f) => {
      const obj = f.toObject();
      obj.hasThumbnail = fs.existsSync(thumbPath(f.shortId));
      return obj;
    }),
    total,
    page,
    pages,
  });
});

// ── ShareX config ───────────────────────────────────────────────────────────
router.get('/sharex-config', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

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
      token: user.apiKey,
    },
    FileFormName: 'upload',
    URL: '{json:url}',
    ThumbnailURL: '{json:url}/raw',
    DeletionURL: '{json:delete_url}',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="sharely.sxcu"');
  res.send(JSON.stringify(config, null, 2));
});

// ── API key management ──────────────────────────────────────────────────────
router.get('/my-key', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ apiKey: user.apiKey });
});

router.post('/regen-key', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await user.regenerateApiKey();
  res.json({ apiKey: user.apiKey });
});

// ── Site settings: public read (used by privacy policy page + cookie banner) ─
router.get('/site-settings', async (req, res) => {
  const s = await SiteSettings.get();
  res.json({
    operatorName: s.operatorName,
    operatorAddress: s.operatorAddress,
    operatorEmail: s.operatorEmail,
    cloudflareAnalytics: s.cloudflareAnalytics,
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
  });
});

router.patch('/admin/site-settings', requireAdmin, async (req, res) => {
  const { operatorName, operatorAddress, operatorEmail, cloudflareAnalytics } = req.body;
  const s = await SiteSettings.get();
  if (typeof operatorName === 'string') s.operatorName = operatorName.trim();
  if (typeof operatorAddress === 'string') s.operatorAddress = operatorAddress.trim();
  if (typeof operatorEmail === 'string') s.operatorEmail = operatorEmail.trim();
  if (typeof cloudflareAnalytics === 'boolean') s.cloudflareAnalytics = cloudflareAnalytics;
  await s.save();
  res.json({
    operatorName: s.operatorName,
    operatorAddress: s.operatorAddress,
    operatorEmail: s.operatorEmail,
    cloudflareAnalytics: s.cloudflareAnalytics,
  });
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
    .populate('uploader', 'username');

  res.json({ userCount, fileCount, totalSize, recentFiles: recentFiles.map((f) => f.toObject()) });
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
    apiKey: u.apiKey,
    fileCount: statsMap[u._id.toString()]?.count || 0,
    storageUsed: statsMap[u._id.toString()]?.size || 0,
  }));

  res.json({ users: result });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });
  const exists = await User.findOne({ username });
  if (exists) return res.status(409).json({ error: 'Username already taken' });
  const user = await User.create({ username, password, role: role === 'admin' ? 'admin' : 'user' });
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
  await user.deleteOne();
  res.json({ success: true });
});

router.post('/admin/users/:id/regen-key', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await user.regenerateApiKey();
  res.json({ apiKey: user.apiKey });
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
  }

  res.json({ folderName: user.folderName });
});

// ── User: export data (GDPR Art. 20) ───────────────────────────────────────
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

  await user.deleteOne();
  req.session.destroy(() => res.json({ success: true }));
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
router.post('/chunk/init', requireLogin, (req, res) => {
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
router.post('/chunk/:uploadId', requireLogin, chunkMulter.single('chunk'), (req, res) => {
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

  const chunkIndex = parseInt(req.body.chunkIndex, 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
    return res.status(400).json({ error: 'Invalid chunkIndex' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No chunk data' });
  }

  fs.writeFileSync(path.join(sessionDir, `chunk-${chunkIndex}`), req.file.buffer);
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

  const user = await User.findById(meta.userId).select('folderName username');
  if (!user) return res.status(404).json({ error: 'User not found' });

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
  const doc = await File.create({
    originalName: sanitizeFilename(meta.filename),
    storedName,
    mimeType: meta.mimeType,
    size: meta.totalSize,
    uploader: meta.userId,
  });

  generateThumbnail(finalPath, meta.mimeType, doc.shortId).catch(() => {});

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

  const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
  const ext = path.extname(req.file.originalname).toLowerCase() || mimeToExt[req.file.mimetype] || '.jpg';

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

  res.sendFile(avatarPath);
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
    .populate('uploader', 'username')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.json({
    files: files.map((f) => {
      const obj = f.toObject();
      obj.hasThumbnail = fs.existsSync(thumbPath(f.shortId));
      return obj;
    }),
    total,
    page,
    pages,
  });
});

module.exports = router;
