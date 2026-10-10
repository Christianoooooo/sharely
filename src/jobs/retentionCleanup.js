const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const SiteSettings = require('../models/SiteSettings');
const { deleteThumbnail } = require('../utils/generateThumbnail');
const { broadcast } = require('../ws');

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
    const now = new Date();
    const toDelete = new Map(); // _id (string) -> file doc, de-duplicated across criteria

    // Global age-based retention (optional, admin-configured).
    const settings = await SiteSettings.get();
    const days = settings.fileRetentionDays;
    if (days && days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      for (const f of await File.find({ createdAt: { $lt: cutoff } })) {
        toDelete.set(String(f._id), f);
      }
    }

    // Self-destruct: past expiry date, or download cap reached.
    const selfDestruct = await File.find({
      $or: [
        { expiresAt: { $ne: null, $lt: now } },
        {
          $and: [
            { maxDownloads: { $ne: null, $gt: 0 } },
            { $expr: { $gte: ['$downloadCount', '$maxDownloads'] } },
          ],
        },
      ],
    });
    for (const f of selfDestruct) toDelete.set(String(f._id), f);

    if (toDelete.size === 0) return;
    const files = [...toDelete.values()];

    for (const f of files) {
      try {
        const fp = resolveUploadPath(f.storedName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch { /* skip invalid paths */ }
      deleteThumbnail(f.shortId);
    }

    await File.deleteMany({ _id: { $in: files.map((f) => f._id) } });
    broadcast('stats:invalidate', {}, (c) => c.isAdmin);
    console.log(`[retention] Deleted ${files.length} file(s) (age/expiry/download-cap)`);
  } catch (err) {
    console.error('[retention] Cleanup error:', err.message);
  }
}

module.exports = { runRetentionCleanup };
