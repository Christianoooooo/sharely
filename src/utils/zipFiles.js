const fs = require('fs');
const archiver = require('archiver');
const { resolveUploadPath } = require('./uploadPath');

/**
 * Streams the given File documents to the response as a ZIP attachment.
 * The caller is responsible for all access checks before calling this.
 * Entry names are de-duplicated and stripped of path separators (zip-slip).
 * Store-only: uploads are overwhelmingly pre-compressed media, so deflating
 * would burn CPU for virtually no size gain.
 * @param {import('express').Response} res - Response to stream the archive to.
 * @param {Array<{storedName: string, originalName?: string, shortId: string}>} files - Files to include.
 * @param {string} zipName - Download filename without the .zip extension.
 * @returns {Promise<void>} Resolves once the archive has been finalized.
 */
function streamFilesAsZip(res, files, zipName) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', (err) => {
    console.error('[zip] archive error:', err.message);
    res.destroy(err);
  });
  archive.pipe(res);

  const usedNames = new Map();
  for (const file of files) {
    let fp;
    try { fp = resolveUploadPath(file.storedName); } catch { continue; }
    if (!fs.existsSync(fp)) continue;

    let name = (file.originalName || file.shortId).replace(/[/\\]/g, '_');
    if (usedNames.has(name)) {
      const n = usedNames.get(name) + 1;
      usedNames.set(name, n);
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    } else {
      usedNames.set(name, 0);
    }
    archive.file(fp, { name });
  }

  return archive.finalize();
}

module.exports = { streamFilesAsZip };
