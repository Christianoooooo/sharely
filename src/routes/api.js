const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireLogin, requireAdmin, requireApiKey } = require('../middleware/auth');
const upload = require('../middleware/upload');
const File = require('../models/File');
const User = require('../models/User');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3000';

// ── File upload (API key — ShareX) ─────────────────────────────────────────
router.post('/upload', requireApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const file = await File.create({
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: req.apiUser._id,
  });

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
router.post('/web-upload', requireLogin, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const created = [];
  for (const f of req.files) {
    const doc = await File.create({
      originalName: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      uploader: req.session.user.id,
    });
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

  const fp = path.join(UPLOAD_DIR, file.storedName);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
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

  const fp = path.join(UPLOAD_DIR, file.storedName);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
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
  if (q) filter.originalName = { $regex: q, $options: 'i' };

  if (type && type !== 'all') {
    const typeMap = { image: /^image\//, video: /^video\//, audio: /^audio\//, pdf: /^application\/pdf$/ };
    if (typeMap[type]) filter.mimeType = typeMap[type];
  }

  const total = await File.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const files = await File.find(filter)
    .populate('uploader', 'username')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.json({ files: files.map((f) => f.toObject()), total, page, pages });
});

// ── ShareX config ───────────────────────────────────────────────────────────
router.get('/sharex-config', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const config = {
    Version: '14.1.0',
    Name: 'Instant Sharing Tool',
    DestinationType: 'ImageUploader, FileUploader',
    RequestMethod: 'POST',
    RequestURL: `${BASE_URL()}/api/upload`,
    Headers: { Authorization: `Bearer ${user.apiKey}` },
    Body: 'MultipartFormData',
    FileFormName: 'file',
    URL: '$json:url$',
    ThumbnailURL: '$json:url$',
    DeletionURL: '$json:delete_url$',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="instant-sharing-tool.sxcu"');
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
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const userFiles = await File.find({ uploader: user._id });
  for (const f of userFiles) {
    const fp = path.join(UPLOAD_DIR, f.storedName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
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

// ── Admin: all files ────────────────────────────────────────────────────────
router.get('/admin/files', requireAdmin, async (req, res) => {
  const { q, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const PAGE_SIZE = 30;

  const filter = q ? { originalName: { $regex: q, $options: 'i' } } : {};
  const total = await File.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const files = await File.find(filter)
    .populate('uploader', 'username')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.json({ files: files.map((f) => f.toObject()), total, page, pages });
});

module.exports = router;
