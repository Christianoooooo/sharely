// Raster media and PDF that browsers render passively; everything else is never
// served inline from our origin.
const SAFE_INLINE = /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)|video\/(?:mp4|webm|ogg|quicktime|x-matroska|mpeg|3gpp)|audio\/(?:mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|x-m4a|aac|flac|x-flac|opus)|application\/pdf)$/;

/**
 * Reduce a client-supplied MIME type to a single lowercase `type/subtype`.
 * Parameters and comma-separated alternatives are dropped, because browsers
 * act on the last listed type while string checks only see the first.
 * @param {*} raw - Untrusted MIME type value.
 * @returns {string} Normalized type, or `application/octet-stream` if malformed.
 */
function normalizeMime(raw) {
  const m = String(raw ?? '').split(/[;,]/)[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(m) ? m : 'application/octet-stream';
}

module.exports = { normalizeMime, SAFE_INLINE };
