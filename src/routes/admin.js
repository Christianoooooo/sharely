const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const File = require('../models/File');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// All admin routes require admin role
router.use(requireAdmin);

// GET /admin — dashboard with stats
router.get('/', async (req, res) => {
  const [userCount, fileCount, files] = await Promise.all([
    User.countDocuments(),
    File.countDocuments(),
    File.find().sort({ createdAt: -1 }).limit(10).populate('uploader', 'username'),
  ]);

  // Total storage used
  const agg = await File.aggregate([{ $group: { _id: null, total: { $sum: '$size' } } }]);
  const totalSize = agg[0]?.total || 0;

  res.render('admin/dashboard', { userCount, fileCount, totalSize, recentFiles: files });
});

// GET /admin/users — list users
router.get('/users', async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });

  // File counts per user
  const counts = await File.aggregate([
    { $group: { _id: '$uploader', count: { $sum: 1 }, size: { $sum: '$size' } } },
  ]);
  const statsMap = {};
  counts.forEach((c) => { statsMap[c._id.toString()] = c; });

  const usersWithStats = users.map((u) => ({
    ...u.toObject(),
    fileCount: statsMap[u._id.toString()]?.count || 0,
    storageUsed: statsMap[u._id.toString()]?.size || 0,
  }));

  res.render('admin/users', { users: usersWithStats, error: null, success: null });
});

// POST /admin/users/create — create user
router.post('/users/create', async (req, res) => {
  const { username, password, role } = req.body;
  const renderError = async (msg) => {
    const users = await User.find().sort({ createdAt: 1 });
    res.render('admin/users', { users, error: msg, success: null });
  };

  if (!username || !password) return renderError('Username and password required');
  if (username.length < 3) return renderError('Username must be at least 3 characters');
  if (password.length < 6) return renderError('Password must be at least 6 characters');

  const exists = await User.findOne({ username });
  if (exists) return renderError('Username already taken');

  await User.create({ username, password, role: role === 'admin' ? 'admin' : 'user' });
  res.redirect('/admin/users');
});

// POST /admin/users/:id/toggle — activate/deactivate
router.post('/users/:id/toggle', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).render('error', { code: 404, message: 'User not found' });
  // Prevent deactivating yourself
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.redirect('/admin/users');
  }
  user.isActive = !user.isActive;
  await user.save();
  res.redirect('/admin/users');
});

// POST /admin/users/:id/delete — delete user and their files
router.post('/users/:id/delete', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin/users');
  if (user._id.toString() === req.session.user.id.toString()) {
    return res.redirect('/admin/users');
  }

  // Delete all files belonging to this user
  const userFiles = await File.find({ uploader: user._id });
  for (const f of userFiles) {
    const fp = path.join(UPLOAD_DIR, f.storedName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  await File.deleteMany({ uploader: user._id });
  await user.deleteOne();
  res.redirect('/admin/users');
});

// POST /admin/users/:id/regen-key — regenerate API key for a user
router.post('/users/:id/regen-key', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await user.regenerateApiKey();
  res.redirect('/admin/users');
});

// GET /admin/files — all files with delete
router.get('/files', async (req, res) => {
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

  res.render('admin/files', { files, total, page, pages, q: q || '' });
});

module.exports = router;
