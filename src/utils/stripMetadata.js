// Pure-JS removal of privacy-relevant metadata (EXIF/GPS, XMP, IPTC, comments)
// from image buffers. Supports JPEG and PNG; any other type, or any parsing
// problem, returns the original buffer unchanged (fail-safe — we never risk
// corrupting an upload).

// JPEG APPn/COM markers to drop. APP0 (JFIF) and APP2 (ICC colour profile) are
// kept so rendering and colours are unaffected.
const JPEG_DROP_MARKERS = new Set([
  0xe1, // APP1 — EXIF / XMP
  0xe3, // APP3
  0xe4, // APP4
  0xe5, // APP5
  0xe6, // APP6
  0xe7, // APP7
  0xe8, // APP8
  0xe9, // APP9
  0xea, // APP10
  0xeb, // APP11
  0xec, // APP12
  0xed, // APP13 — IPTC / Photoshop
  0xee, // APP14 (Adobe) — note: affects CMYK inversion only, rarely used here
  0xef, // APP15
  0xfe, // COM — comment
]);

function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // not SOI
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return buf; // marker must start with 0xFF — bail out safely
    const marker = buf[i + 1];

    // Start of scan or end of image: copy the remainder verbatim.
    if (marker === 0xda || marker === 0xd9) {
      out.push(buf.subarray(i));
      break;
    }
    // Standalone markers without a length payload (RSTn, TEM).
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const len = buf.readUInt16BE(i + 2); // length includes the 2 length bytes
    if (len < 2 || i + 2 + len > buf.length) return buf; // malformed — bail out
    const segEnd = i + 2 + len;
    if (!JPEG_DROP_MARKERS.has(marker)) {
      out.push(buf.subarray(i, segEnd));
    }
    i = segEnd;
  }
  return Buffer.concat(out);
}

// PNG ancillary chunks carrying metadata that we drop. eXIf holds EXIF/GPS,
// the text chunks hold arbitrary metadata, tIME a timestamp.
const PNG_DROP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const chunkEnd = i + 12 + len; // len + 4 (len) + 4 (type) + 4 (crc)
    if (chunkEnd > buf.length) return buf; // malformed — bail out
    if (!PNG_DROP_CHUNKS.has(type)) {
      out.push(buf.subarray(i, chunkEnd));
    }
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/**
 * Removes metadata from an image buffer where supported.
 * @param {Buffer} buf - Original file bytes.
 * @param {string} mimeType - Declared MIME type.
 * @returns {Buffer} Stripped buffer, or the original if unsupported or on any error.
 */
function stripMetadata(buf, mimeType) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return buf;
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return stripJpeg(buf);
    if (mimeType === 'image/png') return stripPng(buf);
    return buf;
  } catch {
    return buf;
  }
}

/**
 * Strips metadata from a file on disk, rewriting it only when bytes were
 * actually removed. Never throws.
 * @param {string} absPath - Absolute path to the file.
 * @param {string} mimeType - Declared MIME type.
 * @returns {Promise<number|null>} Final size in bytes, or null if the file could not be read.
 */
// Above this size the file is left untouched: images needing a strip are small,
// and buffering a huge file into memory would stall the event loop.
const MAX_STRIP_BYTES = 64 * 1024 * 1024;

async function stripFileInPlace(absPath, mimeType) {
  const fs = require('fs');
  try {
    const stat = await fs.promises.stat(absPath);
    if (stat.size > MAX_STRIP_BYTES) return stat.size;
    const buf = await fs.promises.readFile(absPath);
    const out = stripMetadata(buf, mimeType);
    if (out !== buf && out.length < buf.length) {
      await fs.promises.writeFile(absPath, out);
      return out.length;
    }
    return buf.length;
  } catch {
    try { return (await require('fs').promises.stat(absPath)).size; } catch { return null; }
  }
}

module.exports = { stripMetadata, stripFileInPlace };
