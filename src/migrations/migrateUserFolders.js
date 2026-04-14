/**
 * Moves files that were uploaded before per-user folders were introduced.
 * Any File whose storedName contains no '/' lives in the uploads root and
 * needs to be relocated to uploads/<userFolderName>/<filename>.
 *
 * Safe to run on every startup — already-migrated entries are skipped.
 */

const path = require('path');
const fs = require('fs');
const File = require('../models/File');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

async function migrateUserFolders() {
  const files = await File.find({ storedName: { $not: /\// } }).populate('uploader', 'folderName username');

  if (files.length === 0) return;

  console.log(`[migration] Moving ${files.length} file(s) into user subfolders…`);

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const uploader = file.uploader;
    const folder = uploader?.folderName || uploader?.username;

    if (!folder) {
      console.warn(`[migration] skip ${file.storedName} — user has no folder name`);
      skipped++;
      continue;
    }

    const srcPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[migration] skip ${file.storedName} — not found on disk`);
      skipped++;
      continue;
    }

    const destDir = path.join(UPLOAD_DIR, folder);
    const destPath = path.join(destDir, file.storedName);
    // posix join so the stored value always uses forward slashes on every OS
    const newStoredName = path.posix.join(folder, file.storedName);

    try {
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(srcPath, destPath);
      await File.updateOne({ _id: file._id }, { storedName: newStoredName });
      moved++;
    } catch (err) {
      console.error(`[migration] error moving ${file.storedName}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[migration] done — moved: ${moved}, skipped: ${skipped}, errors: ${errors}`);
}

module.exports = migrateUserFolders;
