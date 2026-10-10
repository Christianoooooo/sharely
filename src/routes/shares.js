const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const ShareLink = require('../models/ShareLink');
const { resolveUploadPath, serveFile } = require('./files');
const { isFileExpired } = require('../utils/fileLifecycle');
const { broadcast } = require('../ws');
const fs = require('fs');

function isVerified(req, token) {
  return Array.isArray(req.session?.verifiedShareLinks) &&
    req.session.verifiedShareLinks.includes(token);
}

function isBrowser(req) {
  return req.headers.accept?.includes('text/html');
}

async function resolveLink(req, res, token) {
  const link = await ShareLink.findOne({ token }).populate('file');
  if (!link) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(404).json({ error: 'Share link not found' }); return null;
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(410).json({ error: 'This link has expired' }); return null;
  }

  if (link.downloadLimit !== -1 && link.downloadCount >= link.downloadLimit) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(403).json({ error: 'Download limit reached' }); return null;
  }

  if (link.password && !isVerified(req, token)) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(401).json({ error: 'Password required' }); return null;
  }

  if (!link.file) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(404).json({ error: 'File not found' }); return null;
  }

  if (isFileExpired(link.file)) {
    if (isBrowser(req)) return res.redirect(302, `/s/${token}`);
    res.status(410).json({ error: 'This file is no longer available' }); return null;
  }
  return link;
}

// GET /s/:token/raw — serve file inline (does not count toward download limit)
router.get('/:token/raw', async (req, res) => {
  const link = await resolveLink(req, res, req.params.token);
  if (!link) return;

  const file = link.file;
  await serveFile(req, res, resolveUploadPath(file.storedName), file, false);
});

// GET /s/:token/download — force-download (counts toward download limit)
router.get('/:token/download', async (req, res) => {
  const link = await resolveLink(req, res, req.params.token);
  if (!link) return;

  const file = link.file;
  const filePath = resolveUploadPath(file.storedName);
  // Verify existence before counting the download so a missing file is not billed.
  try { await fs.promises.access(filePath); } catch { return res.status(404).send('File data missing'); }

  // Atomic increment so concurrent downloads cannot exceed downloadLimit.
  const updated = await ShareLink.findOneAndUpdate(
    { _id: link._id },
    { $inc: { downloadCount: 1 } },
    { new: true },
  );
  link.downloadCount = updated.downloadCount;

  const ownerId = link.createdBy?.toString();
  if (ownerId) {
    broadcast('sharelink:download', {
      token: link.token,
      downloadCount: link.downloadCount,
      limitReached: link.downloadLimit !== -1 && link.downloadCount >= link.downloadLimit,
    }, (c) => c.userId === ownerId);
  }

  await serveFile(req, res, filePath, file, true);
});

module.exports = router;
