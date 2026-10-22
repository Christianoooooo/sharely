const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const THUMB_DIR = path.join(
  process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
  '.thumbnails',
);
fs.mkdirSync(THUMB_DIR, { recursive: true });

// gs/ffmpeg parse untrusted uploads; start them with an empty environment so an
// exploit in either cannot read SESSION_SECRET, MONGODB_URI or SMTP credentials.
const TOOL_ENV = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' };

function thumbPath(shortId) {
  return path.join(THUMB_DIR, `${shortId}.jpg`);
}

function generateVideoThumb(filePath, shortId) {
  return new Promise((resolve) => {
    execFile('ffmpeg', [
      '-y', '-i', filePath,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-vf', 'scale=320:320:force_original_aspect_ratio=increase,crop=320:320',
      '-q:v', '3',
      thumbPath(shortId),
    ], { timeout: 30000, env: TOOL_ENV }, (err) => resolve(!err));
  });
}

function generatePdfThumb(filePath, shortId) {
  return new Promise((resolve) => {
    execFile('gs', [
      '-dNOPAUSE', '-dBATCH', '-dSAFER',
      '-sDEVICE=jpeg',
      '-dFirstPage=1', '-dLastPage=1',
      '-r72', '-dJPEGQ=85',
      `-sOutputFile=${thumbPath(shortId)}`,
      filePath,
    ], { timeout: 30000, env: TOOL_ENV }, (err) => resolve(!err));
  });
}

async function generateThumbnail(filePath, mimeType, shortId) {
  try {
    if (mimeType.startsWith('video/')) return await generateVideoThumb(filePath, shortId);
    if (mimeType === 'application/pdf') return await generatePdfThumb(filePath, shortId);
  } catch {
    return false;
  }
  return false;
}

function deleteThumbnail(shortId) {
  try { fs.unlinkSync(thumbPath(shortId)); } catch { /* ignore */ }
}

module.exports = { generateThumbnail, deleteThumbnail, thumbPath };
