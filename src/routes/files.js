const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const { requireLogin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const File = require('../models/File');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1 MB — read for display

// GET / — redirect to gallery
router.get('/', (req, res) => {
  res.redirect(req.session.user ? '/gallery' : '/auth/login');
});

// GET /upload — upload form
router.get('/upload', requireLogin, (req, res) => {
  res.render('upload', { error: null, success: null });
});

// POST /upload — web UI upload (session auth)
router.post('/upload', requireLogin, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.render('upload', { error: 'No files selected', success: null });
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
    created.push(doc);
  }

  if (created.length === 1) {
    return res.redirect(`/f/${created[0].shortId}`);
  }
  res.redirect('/gallery');
});

// GET /f/:shortId — view file
router.get('/f/:shortId', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId }).populate('uploader', 'username');
  if (!file) return res.status(404).render('error', { code: 404, message: 'File not found' });

  // Increment view count
  file.views += 1;
  await file.save();

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { code: 404, message: 'File data missing' });
  }

  let content = null;
  const type = file.displayType;

  if ((type === 'code' || type === 'text') && file.size <= MAX_TEXT_SIZE) {
    content = fs.readFileSync(filePath, 'utf8');
  }

  const ext = path.extname(file.originalName).slice(1).toLowerCase();

  res.render('file-view', { file, content, ext, BASE_URL: process.env.BASE_URL || '' });
});

// GET /f/:shortId/raw — serve raw file (inline for browser, attachment for others)
router.get('/f/:shortId/raw', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  const type = file.displayType;
  const inline = ['image', 'video', 'audio', 'pdf', 'text', 'code'].includes(type);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`,
  );
  fs.createReadStream(filePath).pipe(res);
});

// GET /f/:shortId/download — force download
router.get('/f/:shortId/download', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// POST /f/:shortId/delete — delete file (web UI)
router.post('/f/:shortId/delete', requireLogin, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).render('error', { code: 404, message: 'File not found' });

  const isOwner = file.uploader.toString() === req.session.user.id.toString();
  const isAdmin = req.session.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).render('error', { code: 403, message: 'Forbidden' });
  }

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await file.deleteOne();

  res.redirect(req.headers.referer && req.headers.referer.includes('/admin') ? '/admin' : '/gallery');
});

module.exports = router;
