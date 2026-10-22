const { asyncRouter } = require('../utils/asyncRouter');
const router = asyncRouter();
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream');
const File = require('../models/File');
const { deleteThumbnail, thumbPath } = require('../utils/generateThumbnail');
const { resolveUploadPath } = require('../utils/uploadPath');
const { isFileExpired } = require('../utils/fileLifecycle');
const { normalizeMime, SAFE_INLINE } = require('../utils/mime');
const fileCrypto = require('../utils/fileCrypto');

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

// pipeline() instead of pipe(): a read or decrypt error (file deleted mid-download,
// tampered ciphertext) must end the response, not escape as an uncaught exception.
function sendStream(stream, res) {
  pipeline(stream, res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('[serve] stream failed:', err.message);
  });
}

/**
 * Checks expiry and download cap and counts the fetch once per viewer session (never for owner/admin).
 * @param {import('express').Request} req - Request; its session records counted files.
 * @param {object} file - File document.
 * @param {boolean} fullFetchOnly - true for inline views, where only fetches from byte 0 count.
 * @returns {Promise<boolean>} false if the file is expired or its cap is used up.
 */
async function admitDownload(req, file, fullFetchOnly) {
  // Per-session counting keeps preview + download and video seeking at one download.
  if (file.expiresAt && new Date(file.expiresAt) < new Date()) return false;
  if (!file.maxDownloads) return true;
  const counted = req.session.countedDownloads || [];
  if (counted.includes(file.shortId)) return true;
  if ((file.downloadCount || 0) >= file.maxDownloads) return false;
  const user = req.session.user;
  if (user && (String(user.id) === String(file.uploader) || user.role === 'admin')) return true;
  const range = req.headers.range;
  if (fullFetchOnly && range && !/^bytes=0-/.test(range)) return true;
  // Atomic so concurrent requests cannot exceed maxDownloads.
  const result = await File.updateOne(
    { _id: file._id, downloadCount: { $lt: file.maxDownloads } },
    { $inc: { downloadCount: 1 } },
  );
  if (result.modifiedCount === 0) return false;
  req.session.countedDownloads = [...counted, file.shortId].slice(-200);
  return true;
}

/**
 * Serve a file with HTTP Range request support.
 * Adds Accept-Ranges + Content-Length headers; responds 206 for partial requests.
 */
async function serveFile(req, res, filePath, file, forceDownload = false, cacheControl = null) {
  if (file.encrypted && !fileCrypto.isEnabled()) {
    console.error(`[serve] ${file.shortId} is encrypted but ENCRYPTION_KEY is not set`);
    return res.status(500).send('File cannot be decrypted');
  }
  let fileSize;
  try {
    fileSize = file.encrypted ? await fileCrypto.getPlainSize(filePath) : (await fs.promises.stat(filePath)).size;
  } catch {
    return res.status(404).send('File data missing');
  }
  const open = (range) => (file.encrypted
    ? fileCrypto.createDecryptStream(filePath, range)
    : fs.createReadStream(filePath, range));

  if (cacheControl) res.setHeader('Cache-Control', cacheControl);

  // Normalized here as well so records stored before upload-time normalization
  // cannot smuggle a second, renderable type past the checks below.
  const mime = normalizeMime(file.mimeType);
  const type = file.displayType;
  const active = ACTIVE_CONTENT.test(mime);
  const isTextPreview = !forceDownload && !active && !SAFE_INLINE.test(mime) && (type === 'text' || type === 'code');
  const inline = !forceDownload && !active && (SAFE_INLINE.test(mime) || isTextPreview);

  // Text/code is previewed as text/plain so an HTML payload carrying a text/* MIME
  // cannot be rendered; anything not inline is sent as octet-stream so it can be
  // neither rendered as a document nor loaded as a same-origin script.
  const contentType = isTextPreview ? 'text/plain; charset=utf-8' : inline ? mime : 'application/octet-stream';
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
    return sendStream(open({}), res);
  }

  // Parse "bytes=start-end"
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    res.setHeader('Content-Range', `bytes */${fileSize}`);
    return res.status(416).send('Range Not Satisfiable');
  }

  const start = match[1] !== '' ? parseInt(match[1], 10) : fileSize - parseInt(match[2], 10);
  // Suffix ranges ("bytes=-N") mean the last N bytes, i.e. they end at the last byte.
  const end   = match[1] !== '' && match[2] !== '' ? parseInt(match[2], 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= fileSize || start > end) {
    res.setHeader('Content-Range', `bytes */${fileSize}`);
    return res.status(416).send('Range Not Satisfiable');
  }

  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', end - start + 1);
  res.status(206);
  sendStream(open({ start, end }), res);
}

// GET /f/:shortId — embed handler for social-media bots; fall through for browsers
router.get('/:shortId', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!BOT_UA.test(ua)) return next();

  const file = await File.findOne({ shortId: req.params.shortId }).populate('uploader', 'username embedMode');
  if (!file || isFileExpired(file)) return next();

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
  // Express decodes %2F in params; without this, ..%2F could escape the thumbnail dir.
  if (!/^[\w-]+$/.test(req.params.shortId)) return res.status(404).send('No thumbnail');
  const tp = thumbPath(req.params.shortId);
  let encrypted;
  try {
    encrypted = await fileCrypto.isEncryptedFile(tp);
  } catch {
    return res.status(404).send('No thumbnail');
  }
  if (encrypted && !fileCrypto.isEnabled()) return res.status(404).send('No thumbnail');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  sendStream(encrypted ? fileCrypto.createDecryptStream(tp) : fs.createReadStream(tp), res);
});

// GET /f/:shortId/raw — serve file inline
router.get('/:shortId/raw', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');
  if (!(await admitDownload(req, file, true))) return res.status(410).send('This file is no longer available');

  // Stored files are immutable; cache in the viewer's own browser only when the
  // file cannot self-destruct, so a later deletion is never served from cache.
  const cacheControl = !file.expiresAt && !file.maxDownloads ? 'private, max-age=3600' : null;
  await serveFile(req, res, resolveUploadPath(file.storedName), file, false, cacheControl);
});

// GET /f/:shortId/delete/:token — ShareX deletion URL (per-file token)
router.get('/:shortId/delete/:token', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId }).select('+deleteToken');
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

// GET /f/:shortId/download — force download (counts toward the self-destruct cap)
router.get('/:shortId/download', async (req, res) => {
  const file = await File.findOne({ shortId: req.params.shortId });
  if (!file) return res.status(404).send('Not found');

  const filePath = resolveUploadPath(file.storedName);
  // Verify existence before counting so a missing file is not billed.
  try { await fs.promises.access(filePath); } catch { return res.status(404).send('File data missing'); }

  if (!(await admitDownload(req, file, false))) return res.status(410).send('This file is no longer available');

  await serveFile(req, res, filePath, file, true);
});

module.exports = router;
module.exports.resolveUploadPath = resolveUploadPath;
module.exports.serveFile = serveFile;
