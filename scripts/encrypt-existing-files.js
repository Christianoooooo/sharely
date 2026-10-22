/**
 * Migration: encrypt uploads and thumbnails that were stored before ENCRYPTION_KEY was set.
 *
 * Each file is encrypted into a new "<storedName>.enc" file; the File record is then
 * switched to it (storedName + encrypted flag in one update) and only afterwards is
 * the plaintext deleted. An interrupted run therefore never leaves a record pointing
 * at data in the wrong format, and re-running finishes any leftovers.
 *
 * Usage (inside the app container, with the same ENCRYPTION_KEY as the app):
 *   docker compose exec app node scripts/encrypt-existing-files.js
 *
 * Back up the uploads volume first. Without ENCRYPTION_KEY the files cannot be read again.
 */

require('dotenv').config();
const fs = require('fs');
const connectDB = require('../src/config/db');
const File = require('../src/models/File');
const { resolveUploadPath } = require('../src/utils/uploadPath');
const { thumbPath } = require('../src/utils/generateThumbnail');
const fileCrypto = require('../src/utils/fileCrypto');

async function encryptThumbnail(shortId) {
  const tp = thumbPath(shortId);
  if (!fs.existsSync(tp) || await fileCrypto.isEncryptedFile(tp)) return false;
  await fileCrypto.encryptInPlace(tp);
  return true;
}

async function run() {
  if (fileCrypto.getKeyError()) throw new Error(fileCrypto.getKeyError());
  if (!fileCrypto.isEnabled()) throw new Error('ENCRYPTION_KEY is not set');
  await connectDB();

  let encrypted = 0;
  let thumbs = 0;
  let skipped = 0;
  let failed = 0;

  // Leftover plaintext from a run interrupted after the record was switched.
  for (const file of await File.find({ encrypted: true, storedName: /\.enc$/ })) {
    const candidate = file.storedName.slice(0, -4);
    // An upload whose own name ends in .enc has no such sibling; never touch a live file.
    if (await File.exists({ storedName: candidate })) continue;
    const plain = resolveUploadPath(candidate);
    if (fs.existsSync(plain)) fs.rmSync(plain, { force: true });
  }

  for (const file of await File.find({ encrypted: { $ne: true } })) {
    let src;
    try {
      src = resolveUploadPath(file.storedName);
    } catch {
      skipped++;
      continue;
    }
    if (!fs.existsSync(src)) {
      console.warn(`  [SKIP] ${file.shortId} — source file missing: ${file.storedName}`);
      skipped++;
      continue;
    }
    const newStoredName = `${file.storedName}.enc`;
    const dst = resolveUploadPath(newStoredName);
    try {
      await fileCrypto.encryptFile(src, dst);
      await File.updateOne({ _id: file._id }, { $set: { storedName: newStoredName, encrypted: true } });
      fs.rmSync(src, { force: true });
      encrypted++;
      if (await encryptThumbnail(file.shortId)) thumbs++;
      console.log(`  [ENC]  ${file.shortId}  ${file.originalName}`);
    } catch (err) {
      fs.rmSync(dst, { force: true });
      console.error(`  [ERR]  ${file.shortId} — ${err.message}`);
      failed++;
    }
  }

  // Thumbnails of files that were already encrypted but whose thumbnail is not.
  for (const file of await File.find({ encrypted: true }).select('shortId')) {
    try {
      if (await encryptThumbnail(file.shortId)) thumbs++;
    } catch (err) {
      console.error(`  [ERR]  thumbnail ${file.shortId} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. encrypted=${encrypted}  thumbnails=${thumbs}  skipped=${skipped}  failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
