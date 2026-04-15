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

/**
 * Serve a file with HTTP Range request support.
 * Adds Accept-Ranges + Content-Length headers; responds 206 for partial requests.
 */
function serveFile(req, res, filePath, file, forceDownload = false) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const type = file.displayType;
  const inline = !forceDownload && ['image', 'video', 'audio', 'pdf', 'text', 'code'].includes(type);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`,
  );
  res.setHeader('Accept-Ranges', 'bytes');

  const rangeHeader = req.headers.range;
  if (!rangeHeader) {
    res.setHeader('Content-Length', fileSize);
    return fs.createReadStream(filePath).pipe(res);
  }

  // Parse "bytes=start-end"
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    res.setHeader('Content-Range', `bytes */${fileSize}`);
    return res.status(416).send('Range Not Satisfiable');
  }

  const start = match[1] !== '' ? parseInt(match[1], 10) : fileSize - parseInt(match[2], 10);
  const end   = match[2] !== '' ? parseInt(match[2], 10) : fileSize - 1;

  if (start < 0 || end >= fileSize || start > end) {
    res.setHeader('Content-Range', `bytes */${fileSize}`);
    return res.status(416).send('Range Not Satisfiable');
  }

  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', end - start + 1);
  res.status(206);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

// GET /f/:shortId/raw — serve file inline
router.get('/:shortId/raw', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = resolveUploadPath(file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File data missing');

  serveFile(req, res, filePath, file, false);
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

  serveFile(req, res, filePath, file, true);
});

module.exports = router;
