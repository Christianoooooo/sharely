const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const SiteSettings = require('../models/SiteSettings');
const { deleteThumbnail } = require('../utils/generateThumbnail');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads');

function resolveUploadPath(storedName) {
  const resolved = path.resolve(UPLOAD_DIR, storedName);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

async function runRetentionCleanup() {
  try {
    const settings = await SiteSettings.get();
    const days = settings.fileRetentionDays;
    if (!days || days <= 0) return;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const files = await File.find({ createdAt: { $lt: cutoff } });
    if (files.length === 0) return;

    for (const f of files) {
      try {
        const fp = resolveUploadPath(f.storedName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch { /* skip invalid paths */ }
      deleteThumbnail(f.shortId);
    }

    await File.deleteMany({ _id: { $in: files.map((f) => f._id) } });
    console.log(`[retention] Deleted ${files.length} file(s) older than ${days} day(s)`);
  } catch (err) {
    console.error('[retention] Cleanup error:', err.message);
  }
}

module.exports = { runRetentionCleanup };
