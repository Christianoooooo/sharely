const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const Paste = require('../models/Paste');
const Collection = require('../models/Collection');
const ShareLink = require('../models/ShareLink');
const AuditLog = require('../models/AuditLog');
const { deleteThumbnail } = require('./generateThumbnail');
const { UPLOAD_DIR, resolveUploadPath } = require('./uploadPath');

const AVATAR_DIR = path.join(UPLOAD_DIR, '.avatars');

/**
 * Erases all content of a user (GDPR Art. 17): files with thumbnails, share links,
 * pastes, collections and avatar; anonymizes their audit log entries.
 * The user document itself is left to the caller.
 * @param {{_id: any, avatarExt?: string|null}} user - User whose data is erased.
 * @returns {Promise<void>} Resolves once all records are removed.
 */
async function deleteUserData(user) {
  const files = await File.find({ uploader: user._id }).select('_id storedName shortId');
  for (const f of files) {
    try {
      const fp = resolveUploadPath(f.storedName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* skip invalid paths */ }
    deleteThumbnail(f.shortId);
  }
  const fileIds = files.map((f) => f._id);

  await File.deleteMany({ uploader: user._id });
  await ShareLink.deleteMany({ $or: [{ createdBy: user._id }, { file: { $in: fileIds } }] });
  await Collection.deleteMany({ owner: user._id });
  // Other users' collections may still reference the deleted files.
  await Collection.updateMany({ files: { $in: fileIds } }, { $pull: { files: { $in: fileIds } } });
  await Paste.deleteMany({ owner: user._id });

  if (user.avatarExt) {
    try { fs.unlinkSync(path.join(AVATAR_DIR, `${user._id}${user.avatarExt}`)); } catch { /* already gone */ }
  }

  await AuditLog.updateMany(
    { userId: user._id },
    { $set: { username: '[deleted]', ip: null, userId: null } },
  );
}

module.exports = { deleteUserData };
