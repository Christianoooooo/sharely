const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireApiKey, requireLogin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const File = require('../models/File');

const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3000';

// POST /api/upload  — ShareX + programmatic uploads (API key auth)
router.post('/upload', requireApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const file = await File.create({
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: req.apiUser._id,
  });

  const base = BASE_URL();
  return res.json({
    url: `${base}/f/${file.shortId}`,
    raw: `${base}/f/${file.shortId}/raw`,
    delete_url: `${base}/api/delete/${file.shortId}`,
    short_id: file.shortId,
    filename: file.originalName,
    size: file.size,
  });
});

// DELETE /api/delete/:shortId — delete own file via API key
router.delete('/delete/:shortId', requireApiKey, async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const isOwner = file.uploader.toString() === req.apiUser._id.toString();
  const isAdmin = req.apiUser.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const filePath = path.join(__dirname, '../../uploads', file.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await file.deleteOne();

  res.json({ success: true });
});

// GET /api/sharex-config — download .sxcu config for ShareX
router.get('/sharex-config', requireLogin, (req, res) => {
  const base = BASE_URL();

  // We need the current user's API key
  const User = require('../models/User');
  User.findById(req.session.user.id).then((user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });

    const config = {
      Version: '14.1.0',
      Name: 'Instant Sharing Tool',
      DestinationType: 'ImageUploader, FileUploader',
      RequestMethod: 'POST',
      RequestURL: `${base}/api/upload`,
      Headers: {
        Authorization: `Bearer ${user.apiKey}`,
      },
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
});

// GET /api/my-key — return own API key (JSON)
router.get('/my-key', requireLogin, async (req, res) => {
  const User = require('../models/User');
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ apiKey: user.apiKey });
});

// POST /api/regen-key — regenerate own API key
router.post('/regen-key', requireLogin, async (req, res) => {
  const User = require('../models/User');
  const user = await User.findById(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await user.regenerateApiKey();
  res.json({ apiKey: user.apiKey });
});

module.exports = router;
