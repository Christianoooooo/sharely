// Raw file serving only — HTML rendering is handled by the React SPA
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const File = require('../models/File');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

/** Resolve storedName to an absolute path and guard against path traversal. */
function resolveUploadPath(storedName) {
  const resolved = path.resolve(UPLOAD_DIR, storedName);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// GET /f/:shortId/raw — serve file inline
router.get('/:shortId/raw', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = resolveUploadPath(file.storedName);
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

// GET /f/:shortId/delete/:token — ShareX deletion URL (per-file token)
router.get('/:shortId/delete/:token', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!file.deleteToken || file.deleteToken !== req.params.token) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const fp = resolveUploadPath(file.storedName);
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await file.deleteOne();
  res.json({ success: true });
});

// GET /f/:shortId/download — force download
router.get('/:shortId/download', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = resolveUploadPath(file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
