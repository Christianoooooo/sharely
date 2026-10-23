/**
 * Migration: generate thumbnails for existing video and PDF uploads.
 *
 * Iterates all File documents whose mimeType starts with "video/" or equals
 * "application/pdf", skips any that already have a thumbnail, and generates
 * the missing ones using ffmpeg / ghostscript (same logic as on upload).
 *
 * Usage:
 *   node scripts/generate-missing-thumbnails.js
 *
 * Set MONGODB_URI in .env (or the environment) before running.
 * The script is idempotent: files that already have a thumbnail are skipped.
 */

require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const connectDB = require('../src/config/db');
const File = require('../src/models/File');
const crypto = require('crypto');
const { generateThumbnail, thumbPath } = require('../src/utils/generateThumbnail');
const fileCrypto = require('../src/utils/fileCrypto');

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

async function run() {
  await connectDB();

  const files = await File.find({
    mimeType: { $in: [/^video\//, /^application\/pdf$/] },
  });

  console.log(`Found ${files.length} video/PDF file(s) to process.`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const tp = thumbPath(file.shortId);

    if (fs.existsSync(tp)) {
      skipped++;
      continue;
    }

    const filePath = path.resolve(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(filePath)) {
      console.warn(`  [SKIP] ${file.shortId} — source file missing: ${file.storedName}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  [GEN]  ${file.shortId}  ${file.originalName} … `);
    let ok;
    if (file.encrypted) {
      // gs/ffmpeg need a plaintext source; keep it only for the duration of the run.
      const plain = `${filePath}.plain-${crypto.randomBytes(8).toString('hex')}`;
      try {
        await fileCrypto.decryptToFile(filePath, plain);
        ok = await generateThumbnail(plain, file.mimeType, file.shortId);
        if (ok) await fileCrypto.encryptInPlace(tp);
        else fs.rmSync(tp, { force: true });
      } catch (err) {
        fs.rmSync(tp, { force: true });
        ok = false;
        process.stdout.write(`(${err.message}) `);
      } finally {
        fs.rmSync(plain, { force: true });
      }
    } else {
      ok = await generateThumbnail(filePath, file.mimeType, file.shortId);
    }
    if (ok) {
      console.log('ok');
      generated++;
    } else {
      console.log('FAILED (ffmpeg/gs not available or errored)');
      failed++;
    }
  }

  console.log(`\nDone. generated=${generated}  skipped=${skipped}  failed=${failed}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
