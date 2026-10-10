const assert = require('assert');
const { stripMetadata } = require('./stripMetadata');

// ── Builders for minimal, valid-enough test images ──────────────────────────
function jpegSegment(marker, dataLen) {
  const seg = Buffer.alloc(2 + 2 + dataLen);
  seg[0] = 0xff; seg[1] = marker;
  seg.writeUInt16BE(dataLen + 2, 2); // length includes the 2 length bytes
  return seg;
}

function buildJpeg({ withExif = false, withApp0 = true, withComment = false } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])]; // SOI
  if (withApp0) parts.push(jpegSegment(0xe0, 14)); // APP0 / JFIF
  if (withExif) parts.push(jpegSegment(0xe1, 40)); // APP1 / EXIF
  if (withComment) parts.push(jpegSegment(0xfe, 8)); // COM
  parts.push(jpegSegment(0xdb, 65)); // DQT (kept)
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0, 1, 0, 0, 0x3f, 0x00])); // SOS header
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78])); // scan data
  parts.push(Buffer.from([0xff, 0xd9])); // EOI
  return Buffer.concat(parts);
}

function pngChunk(type, dataLen) {
  const c = Buffer.alloc(12 + dataLen);
  c.writeUInt32BE(dataLen, 0);
  c.write(type, 4, 'latin1');
  // data left as zeros; crc left as zeros (not validated by the stripper)
  return c;
}

function buildPng({ withText = false, withExif = false } = {}) {
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  parts.push(pngChunk('IHDR', 13));
  if (withExif) parts.push(pngChunk('eXIf', 20));
  if (withText) parts.push(pngChunk('tEXt', 16));
  parts.push(pngChunk('IDAT', 24));
  parts.push(pngChunk('IEND', 0));
  return Buffer.concat(parts);
}

function hasJpegMarker(buf, marker) {
  for (let i = 2; i + 1 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === marker) return true;
    if (buf[i] === 0xff && buf[i + 1] === 0xda) break; // stop at scan
  }
  return false;
}

function hasPngChunk(buf, type) {
  return buf.includes(Buffer.from(type, 'latin1'));
}

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log(`[PASS] ${name}`); passed++; }
  catch (e) { console.log(`[FAIL] ${name}: ${e.message}`); failed++; }
}

// ── JPEG ────────────────────────────────────────────────────────────────────
check('JPEG: removes APP1/EXIF', () => {
  const src = buildJpeg({ withExif: true });
  assert.ok(hasJpegMarker(src, 0xe1), 'fixture should contain EXIF');
  const out = stripMetadata(src, 'image/jpeg');
  assert.ok(!hasJpegMarker(out, 0xe1), 'EXIF should be gone');
  assert.ok(out.length < src.length, 'output should be smaller');
});

check('JPEG: keeps APP0/JFIF and DQT and scan data', () => {
  const src = buildJpeg({ withExif: true, withComment: true });
  const out = stripMetadata(src, 'image/jpeg');
  assert.ok(hasJpegMarker(out, 0xe0), 'JFIF kept');
  assert.ok(hasJpegMarker(out, 0xdb), 'DQT kept');
  assert.strictEqual(out[0], 0xff); assert.strictEqual(out[1], 0xd8); // SOI
  assert.strictEqual(out[out.length - 2], 0xff); assert.strictEqual(out[out.length - 1], 0xd9); // EOI
});

check('JPEG: removes COM comment', () => {
  const out = stripMetadata(buildJpeg({ withComment: true }), 'image/jpeg');
  assert.ok(!hasJpegMarker(out, 0xfe), 'comment should be gone');
});

check('JPEG: no metadata → unchanged bytes', () => {
  const src = buildJpeg();
  const out = stripMetadata(src, 'image/jpeg');
  assert.ok(out.equals(src), 'should be byte-identical when nothing to strip');
});

check('JPEG: malformed input returned unchanged', () => {
  const junk = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]); // bogus length
  const out = stripMetadata(junk, 'image/jpeg');
  assert.ok(out.equals(junk));
});

// ── PNG ─────────────────────────────────────────────────────────────────────
check('PNG: removes tEXt and eXIf', () => {
  const src = buildPng({ withText: true, withExif: true });
  const out = stripMetadata(src, 'image/png');
  assert.ok(!hasPngChunk(out, 'tEXt'), 'tEXt gone');
  assert.ok(!hasPngChunk(out, 'eXIf'), 'eXIf gone');
});

check('PNG: keeps IHDR/IDAT/IEND', () => {
  const out = stripMetadata(buildPng({ withText: true }), 'image/png');
  assert.ok(hasPngChunk(out, 'IHDR') && hasPngChunk(out, 'IDAT') && hasPngChunk(out, 'IEND'));
});

check('PNG: no metadata → unchanged bytes', () => {
  const src = buildPng();
  const out = stripMetadata(src, 'image/png');
  assert.ok(out.equals(src));
});

// ── Other formats / edge cases ──────────────────────────────────────────────
check('Unsupported type returned unchanged', () => {
  const src = Buffer.from('hello world');
  assert.ok(stripMetadata(src, 'image/webp').equals(src));
  assert.ok(stripMetadata(src, 'application/pdf').equals(src));
});

check('Empty / non-buffer input is safe', () => {
  assert.strictEqual(stripMetadata(Buffer.alloc(0), 'image/jpeg').length, 0);
  assert.strictEqual(stripMetadata(null, 'image/jpeg'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
