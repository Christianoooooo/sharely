const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const ShareLink = require('../models/ShareLink');
const { resolveUploadPath, serveFile } = require('./files');
const { broadcast } = require('../ws');
const fs = require('fs');

function isVerified(req, token) {
  return Array.isArray(req.session?.verifiedShareLinks) &&
    req.session.verifiedShareLinks.includes(token);
}

async function resolveLink(req, res, token) {
  const link = await ShareLink.findOne({ token }).populate('file');
  if (!link) { res.status(404).json({ error: 'Share link not found' }); return null; }

  if (link.expiresAt && link.expiresAt < new Date()) {
    res.status(410).json({ error: 'This link has expired' });
    return null;
  }

  if (link.downloadLimit !== -1 && link.downloadCount >= link.downloadLimit) {
    res.status(403).json({ error: 'Download limit reached' });
    return null;
  }

  if (link.password && !isVerified(req, token)) {
    res.status(401).json({ error: 'Password required' });
    return null;
  }

  if (!link.file) { res.status(404).json({ error: 'File not found' }); return null; }
  return link;
}

// GET /s/:token/raw — serve file inline (does not count toward download limit)
router.get('/:token/raw', async (req, res) => {
  const link = await resolveLink(req, res, req.params.token);
  if (!link) return;

  const file = link.file;
  const filePath = resolveUploadPath(file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  serveFile(req, res, filePath, file, false);
});

// GET /s/:token/download — force-download (counts toward download limit)
router.get('/:token/download', async (req, res) => {
  const link = await resolveLink(req, res, req.params.token);
  if (!link) return;

  const file = link.file;
  const filePath = resolveUploadPath(file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  link.downloadCount += 1;
  await link.save();

  const ownerId = link.createdBy?.toString();
  if (ownerId) {
    broadcast('sharelink:download', {
      token: link.token,
      downloadCount: link.downloadCount,
      limitReached: link.downloadLimit !== -1 && link.downloadCount >= link.downloadLimit,
    }, (c) => c.userId === ownerId);
  }

  serveFile(req, res, filePath, file, true);
});

module.exports = router;
