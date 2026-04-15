/**
 * Detect and reverse Latin-1 mojibake that arises when a multipart
 * Content-Disposition filename containing raw UTF-8 bytes is decoded as
 * Latin-1 (the legacy HTTP default).  For example multer returns the string
 * "LÃ¶sung" when the client sent the UTF-8 bytes for "Lösung".
 *
 * Strategy: re-encode the string back to its original bytes using Latin-1,
 * then re-decode those bytes as UTF-8.  If the result is a valid UTF-8
 * string (no U+FFFD replacement characters) and the round-trip actually
 * changed the value, the string was mojibake and we return the corrected
 * version.  Otherwise we return the original unchanged.
 *
 * Pure-ASCII strings are returned immediately without any Buffer allocation.
 *
 * @param {string} str
 * @returns {string}
 */
function fixMojibake(str) {
  // Fast path: ASCII-only strings can never be mojibake.
  if (/^[\x00-\x7F]*$/.test(str)) return str;

  // Mojibake from Latin-1 misreading only produces characters in U+0080–U+00FF.
  // If the string already contains any character above U+00FF (e.g. a combining
  // diacritic like U+0308 sent by macOS in NFD form, or CJK) it was decoded
  // correctly by the HTTP layer — skip mojibake correction entirely.
  if (/[^\x00-\xFF]/.test(str)) return str;

  try {
    const reDecoded = Buffer.from(str, 'latin1').toString('utf8');
    // If re-decoding introduced replacement characters the original was not
    // valid UTF-8 masquerading as Latin-1 — keep the original.
    // Also keep the original if re-decoding made no change (nothing to correct).
    if (reDecoded.includes('\uFFFD') || reDecoded === str) return str;
    return reDecoded;
  } catch {
    return str;
  }
}

/**
 * Normalize special characters in a filename.
 *
 * Steps applied in order:
 *  1. Mojibake fix — corrects filenames where UTF-8 bytes were misread as
 *     Latin-1 by the multipart parser (e.g. "LÃ¶sung" → "Lösung").
 *  2. NFC Unicode normalization — macOS encodes filenames in NFD (decomposed)
 *     form while Windows uses NFC (precomposed).  Normalizing to NFC ensures
 *     consistent storage and display regardless of the uploading OS.
 *  3. Replace path-separator characters (/ and \) that could smuggle directory
 *     traversal segments into the stored display name.
 *  4. Strip ASCII control characters (0x00–0x1F and 0x7F).
 *  5. Trim leading/trailing whitespace.
 *  6. Fall back to 'file' when the result is empty so we always have a name.
 *
 * The actual stored file path on disk is a random hex id, so this function
 * only affects the human-readable originalName saved in the database.
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  if (typeof filename !== 'string') return 'file';

  return fixMojibake(filename)
    .normalize('NFC')
    .replace(/[/\\]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim() || 'file';
}

module.exports = sanitizeFilename;
