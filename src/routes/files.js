const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const { deleteThumbnail, thumbPath } = require('../utils/generateThumbnail');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

/** Regex matching known social-media / link-preview crawlers. */
const BOT_UA = /discord|twitterbot|facebookexternalhit|telegram|slack|whatsapp|linkedinbot|skype|vkshare|pinterest|tumblr|mastodon/i;

/** Minimal HTML escaping to prevent XSS in meta-tag attribute values. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

// GET /f/:shortId — embed handler for social-media bots; fall through for browsers
router.get('/:shortId', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!BOT_UA.test(ua)) return next();

  const file = await File.findOne({ shortId: req.params.shortId }).populate('uploader', 'username embedMode');
  if (!file) return next();

  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const rawUrl = `${base}/f/${file.shortId}/raw`;
  const fileUrl = `${base}/f/${file.shortId}`;
  const embedMode = file.uploader?.embedMode || 'embed';

  // Raw mode: redirect bot directly to the file so the platform embeds it natively
  if (embedMode === 'raw' && ['image', 'video', 'audio'].includes(file.displayType)) {
    return res.redirect(302, rawUrl);
  }

  // Embed mode: serve a thin HTML page with Open Graph / Twitter Card meta tags
  const title = escapeHtml(file.originalName);
  const siteName = process.env.SITE_NAME || 'sharely';
  const isImage = file.displayType === 'image';
  const isVideo = file.displayType === 'video';

  const metaTags = [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:url" content="${escapeHtml(fileUrl)}" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
  ];

  if (isImage) {
    metaTags.push(`<meta property="og:type" content="website" />`);
    metaTags.push(`<meta property="og:image" content="${escapeHtml(rawUrl)}" />`);
    metaTags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    metaTags.push(`<meta name="twitter:image" content="${escapeHtml(rawUrl)}" />`);
  } else if (isVideo) {
    metaTags.push(`<meta property="og:type" content="video.other" />`);
    metaTags.push(`<meta property="og:video" content="${escapeHtml(rawUrl)}" />`);
    metaTags.push(`<meta property="og:video:type" content="${escapeHtml(file.mimeType)}" />`);
    metaTags.push(`<meta property="og:image" content="${escapeHtml(rawUrl)}" />`);
  } else {
    metaTags.push(`<meta property="og:type" content="website" />`);
    metaTags.push(`<meta property="og:description" content="${escapeHtml(file.originalName)}" />`);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} – ${siteName}</title>
  ${metaTags.join('\n  ')}
  <meta http-equiv="refresh" content="0; url=${escapeHtml(fileUrl)}" />
</head>
<body>
  <a href="${escapeHtml(fileUrl)}">View file</a>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// GET /f/:shortId/thumb — serve generated thumbnail (video / PDF)
router.get('/:shortId/thumb', async (req, res) => {
  const fp = thumbPath(req.params.shortId);
  if (!fs.existsSync(fp)) return res.status(404).send('No thumbnail');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(fp).pipe(res);
});

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
  deleteThumbnail(file.shortId);
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
