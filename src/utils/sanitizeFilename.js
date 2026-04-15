/**
 * Normalize special characters in a filename.
 *
 * Steps applied in order:
 *  1. NFC Unicode normalization — macOS encodes filenames in NFD (decomposed)
 *     form while Windows uses NFC (precomposed).  Normalizing to NFC ensures
 *     consistent storage and display regardless of the uploading OS.
 *  2. Replace path-separator characters (/ and \) that could smuggle directory
 *     traversal segments into the stored display name.
 *  3. Strip ASCII control characters (0x00–0x1F and 0x7F).
 *  4. Trim leading/trailing whitespace.
 *  5. Fall back to 'file' when the result is empty so we always have a name.
 *
 * The actual stored file path on disk is a random hex id, so this function
 * only affects the human-readable originalName saved in the database.
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  if (typeof filename !== 'string') return 'file';

  return filename
    .normalize('NFC')
    .replace(/[/\\]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim() || 'file';
}

module.exports = sanitizeFilename;
