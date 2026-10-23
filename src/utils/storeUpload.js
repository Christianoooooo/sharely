const fs = require('fs');
const crypto = require('crypto');
const { generateThumbnail, thumbPath } = require('./generateThumbnail');
const fileCrypto = require('./fileCrypto');

// Plaintext copies are kept next to the upload (same filesystem, so rename works)
// only until the thumbnail is generated; leftovers after a crash match this
// pattern and are removed by the retention job.
const PLAIN_COPY_PATTERN = /\.plain-[0-9a-f]{16}$/;

/**
 * Encrypts a freshly written upload in place when ENCRYPTION_KEY is set.
 * Call after any in-place processing (metadata stripping) and before creating the File record.
 * @param {string} absPath - Stored upload; stays at this path, encrypted if enabled.
 * @returns {Promise<{encrypted: boolean, plainPath: string}>} plainPath is a plaintext copy for
 *   thumbnailing; pass the result to startThumbnail() or releasePlain() afterwards.
 * @throws {Error} on I/O errors; the upload is left as plaintext then.
 */
async function sealUpload(absPath) {
  if (!fileCrypto.isEnabled()) return { encrypted: false, plainPath: absPath };
  const plainPath = `${absPath}.plain-${crypto.randomBytes(8).toString('hex')}`;
  await fs.promises.rename(absPath, plainPath);
  try {
    await fileCrypto.encryptFile(plainPath, absPath);
  } catch (err) {
    await fs.promises.rename(plainPath, absPath);
    throw err;
  }
  return { encrypted: true, plainPath };
}

/** Deletes the plaintext copy created by sealUpload(); no-op for unencrypted uploads. */
function releasePlain(sealed) {
  if (sealed.encrypted) fs.unlink(sealed.plainPath, () => {});
}

/**
 * Deletes an upload whose File record was never created, including its plaintext copy.
 * @param {string} absPath - Stored upload, plaintext or already encrypted.
 * @param {{encrypted: boolean, plainPath: string}} [sealed] - sealUpload() result, if it ran.
 */
function discardUpload(absPath, sealed) {
  fs.unlink(absPath, () => {});
  if (sealed) releasePlain(sealed);
}

/**
 * Express middleware, mounted before multer: on an error response, deletes every uploaded
 * file the handler did not mark with `file.committed = true` (set once its File record exists).
 * Handlers store the sealUpload() result in `file.sealed` so its plaintext copy goes too.
 */
function discardUncommittedUploads(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode < 400) return;
    for (const f of req.files || (req.file ? [req.file] : [])) {
      if (!f.committed) discardUpload(f.path, f.sealed);
    }
  });
  next();
}

/**
 * Generates the thumbnail in the background from the plaintext copy, encrypts it
 * like its source, then releases the plaintext copy.
 * @param {{encrypted: boolean, plainPath: string}} sealed - Result of sealUpload().
 * @param {string} mimeType - Normalized MIME type of the upload.
 * @param {string} shortId - File shortId (names the thumbnail).
 */
function startThumbnail(sealed, mimeType, shortId) {
  generateThumbnail(sealed.plainPath, mimeType, shortId)
    .then(async (ok) => {
      if (!sealed.encrypted) return;
      // A failed gs/ffmpeg run can leave a partial plaintext thumbnail behind.
      if (ok) await fileCrypto.encryptInPlace(thumbPath(shortId));
      else fs.unlink(thumbPath(shortId), () => {});
    })
    .catch(() => {
      // A thumbnail that could not be encrypted must not stay readable in plaintext.
      if (sealed.encrypted) fs.unlink(thumbPath(shortId), () => {});
    })
    .finally(() => releasePlain(sealed));
}

module.exports = {
  sealUpload, startThumbnail, releasePlain, discardUpload, discardUncommittedUploads, PLAIN_COPY_PATTERN,
};
