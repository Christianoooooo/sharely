// Generates a minimal 32x32 PNG icon using only Node.js built-ins (no external deps).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function createSolidPNG(width, height, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = 1 + width * 3; // filter byte + 3 bytes per pixel
  const raw = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      raw[y * stride + 1 + x * 3]     = r;
      raw[y * stride + 1 + x * 3 + 1] = g;
      raw[y * stride + 1 + x * 3 + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), createSolidPNG(512, 512, 59, 130, 246));
console.log('Sharely icon generated → assets/icon.png');
