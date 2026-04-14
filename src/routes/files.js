// Raw file serving only — HTML rendering is handled by the React SPA
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const User = require('../models/User');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// GET /f/:shortId/raw — serve file inline
router.get('/:shortId/raw', async (req, res) => {
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

// GET /f/:shortId/delete/:token — ShareX deletion URL
router.get('/:shortId/delete/:token', async (req, res) => {
  const user = await User.findOne({ apiKey: req.params.token, isActive: true });
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === user._id.toString();
  if (!isOwner && user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const fp = path.join(UPLOAD_DIR, file.storedName);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  await file.deleteOne();
  res.json({ success: true });
});

// GET /f/:shortId/download — force download
router.get('/:shortId/download', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
