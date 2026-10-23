const path = require('path');
const fs = require('fs');
const { thumbnailKind, renderThumbnail } = require('./thumbnailTools');
const { prepareQueue, renderViaWorker } = require('./thumbnailQueue');

const THUMB_DIR = path.join(
  process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
  '.thumbnails',
);
fs.mkdirSync(THUMB_DIR, { recursive: true });

// Set in Docker: gs/ffmpeg then run in the isolated thumbnailer container instead of here.
const WORKER_DIR = process.env.THUMBNAIL_WORKER_DIR;
if (WORKER_DIR) prepareQueue(WORKER_DIR);

function thumbPath(shortId) {
  return path.join(THUMB_DIR, `${shortId}.jpg`);
}

async function generateThumbnail(filePath, mimeType, shortId) {
  try {
    const kind = thumbnailKind(mimeType);
    if (!kind) return false;
    if (WORKER_DIR) return await renderViaWorker(WORKER_DIR, filePath, kind, thumbPath(shortId));
    return await renderThumbnail(filePath, kind, thumbPath(shortId));
  } catch {
    return false;
  }
}

function deleteThumbnail(shortId) {
  try { fs.unlinkSync(thumbPath(shortId)); } catch { /* ignore */ }
}

module.exports = { generateThumbnail, deleteThumbnail, thumbPath };
