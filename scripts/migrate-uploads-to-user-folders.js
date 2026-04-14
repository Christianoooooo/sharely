/**
 * Migration: move existing flat uploads into per-user subfolders.
 *
 * Files whose storedName contains no path separator (i.e. were uploaded
 * before per-user folders were introduced) are relocated from
 *   uploads/<filename>
 * to
 *   uploads/<userFolderName>/<filename>
 * and the storedName field in MongoDB is updated accordingly.
 *
 * Usage:
 *   node scripts/migrate-uploads-to-user-folders.js
 *
 * Set MONGODB_URI in .env (or the environment) before running.
 * The script is idempotent: already-migrated entries (storedName contains
 * a '/') are skipped without modification.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// ── Inline model definitions (avoids importing app-level code) ───────────────

const userSchema = new mongoose.Schema({
  username: String,
  folderName: String,
});
const User = mongoose.model('User', userSchema);

const fileSchema = new mongoose.Schema({
  shortId: String,
  originalName: String,
  storedName: String,
  mimeType: String,
  size: Number,
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  views: Number,
  createdAt: Date,
});
const File = mongoose.model('File', fileSchema);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.\n');

  // Only files that haven't been migrated yet (no folder separator in storedName)
  const files = await File.find({ storedName: { $not: /\// } }).populate('uploader', 'folderName username');

  const total = files.length;
  console.log(`Found ${total} file(s) to migrate.\n`);

  let moved = 0;
  let skippedMissingFile = 0;
  let skippedMissingUser = 0;
  let errors = 0;

  for (const file of files) {
    const uploader = file.uploader;
    if (!uploader) {
      console.warn(`  [SKIP] ${file.storedName} — uploader not found in DB`);
      skippedMissingUser++;
      continue;
    }

    const folder = uploader.folderName || uploader.username;
    if (!folder) {
      console.warn(`  [SKIP] ${file.storedName} — user ${uploader._id} has no folderName or username`);
      skippedMissingUser++;
      continue;
    }

    const srcPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  [SKIP] ${file.storedName} — file not found on disk`);
      skippedMissingFile++;
      continue;
    }

    const destDir = path.join(UPLOAD_DIR, folder);
    const destPath = path.join(destDir, file.storedName);
    const newStoredName = path.posix.join(folder, file.storedName);

    try {
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(srcPath, destPath);
      await File.updateOne({ _id: file._id }, { storedName: newStoredName });
      console.log(`  [OK]   ${file.storedName}  →  ${newStoredName}`);
      moved++;
    } catch (err) {
      console.error(`  [ERR]  ${file.storedName} — ${err.message}`);
      errors++;
    }
  }

  console.log(`
─────────────────────────────
Migration complete.
  Migrated  : ${moved}
  Skipped (file missing on disk) : ${skippedMissingFile}
  Skipped (user missing in DB)   : ${skippedMissingUser}
  Errors    : ${errors}
─────────────────────────────`);

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
