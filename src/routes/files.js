const express = require('express');
const router = express.Router();
const fs = require('fs');
const crypto = require('crypto');
const File = require('../models/File');
const { deleteThumbnail, thumbPath } = require('../utils/generateThumbnail');
const { resolveUploadPath } = require('../utils/uploadPath');

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

// MIME types that browsers execute scripts from when rendered on our own origin
// (HTML, SVG, XML). These must never be served inline and their Content-Type is
// neutralised so a navigated-to upload cannot run JS in the app's origin.
const ACTIVE_CONTENT = /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i;

/** Constant-time string comparison that never throws on length mismatch. */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Serve a file with HTTP Range request support.
 * Adds Accept-Ranges + Content-Length headers; responds 206 for partial requests.
 */
async function serveFile(req, res, filePath, file, forceDownload = false) {
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return res.status(404).send('File data missing');
  }
  const fileSize = stat.size;

  const type = file.displayType;
  const active = ACTIVE_CONTENT.test(file.mimeType);
  const inline = !forceDownload && !active && ['image', 'video', 'audio', 'pdf', 'text', 'code'].includes(type);
  const isTextPreview = inline && (type === 'text' || type === 'code');

  // Text/code is previewed as text/plain so an HTML payload carrying a text/* MIME
  // cannot be rendered; active content (HTML/SVG/XML) keeps its real type but is
  // forced to download (inline=false above).
  const contentType = isTextPreview ? 'text/plain; charset=utf-8' : file.mimeType;
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Sandbox everything except trusted inline media (raster image/video/audio/pdf)
  // so a forced-download active file cannot run JS if a client renders it anyway;
  // the sandbox is kept off real media so the in-app PDF/image viewer keeps working.
  if (!inline || isTextPreview) {
    res.setHeader('Content-Security-Policy', 'sandbox');
  }
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

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= fileSize || start > end) {
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
router.get('/:shortId/thumb', (req, res) => {
  const stream = fs.createReadStream(thumbPath(req.params.shortId));
  stream.on('error', () => { if (!res.headersSent) res.status(404).send('No thumbnail'); });
  stream.on('open', () => {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  });
});

// GET /f/:shortId/raw — serve file inline
router.get('/:shortId/raw', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  await serveFile(req, res, resolveUploadPath(file.storedName), file, false);
});

// GET /f/:shortId/delete/:token — ShareX deletion URL (per-file token)
router.get('/:shortId/delete/:token', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!file.deleteToken || !timingSafeEqualStr(file.deleteToken, req.params.token)) {
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

  await serveFile(req, res, resolveUploadPath(file.storedName), file, true);
});

module.exports = router;
module.exports.resolveUploadPath = resolveUploadPath;
module.exports.serveFile = serveFile;
