const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');

// On-disk format (all integers big-endian):
//   header  = MAGIC (8) | salt (16) | segment size (4) | reserved (4)
//   segment = AES-256-GCM ciphertext of up to SEGMENT_SIZE bytes | tag (16)
// Fixed-size segments keep HTTP Range requests cheap: only the segments that
// cover the requested bytes are read and decrypted. Every segment authenticates
// its index (nonce) and whether it is the last one (AAD), so reordering,
// truncation and appending are detected. An empty file has one empty segment.
const MAGIC = Buffer.from('SHLYENC1');
const HEADER_LEN = 32;
const SEGMENT_SIZE = 64 * 1024;
const TAG_LEN = 16;

let masterKey = null;
let keyError = null;
if (process.env.ENCRYPTION_KEY) {
  const raw = process.env.ENCRYPTION_KEY.trim();
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length === 32) masterKey = key;
  else keyError = 'ENCRYPTION_KEY must be 32 bytes, as 64 hex characters or base64 (e.g. `openssl rand -base64 32`)';
}

/** @returns {boolean} whether new uploads are encrypted (ENCRYPTION_KEY is set and valid). */
function isEnabled() {
  return masterKey !== null;
}

/** @returns {string|null} configuration error for an ENCRYPTION_KEY that is set but invalid. */
function getKeyError() {
  return keyError;
}

function requireKey() {
  if (!masterKey) throw new Error('ENCRYPTION_KEY is required to read encrypted files');
  return masterKey;
}

function fileKey(salt) {
  return Buffer.from(crypto.hkdfSync('sha256', requireKey(), salt, 'sharely-file-v1', 32));
}

function nonce(index) {
  const iv = Buffer.alloc(12);
  iv.writeBigUInt64BE(BigInt(index), 4);
  return iv;
}

function aad(header, isLast) {
  return Buffer.concat([header, Buffer.from([isLast ? 1 : 0])]);
}

function segmentCount(plainSize, segSize) {
  return Math.max(1, Math.ceil(plainSize / segSize));
}

function parseHeader(header) {
  if (header.length !== HEADER_LEN || !header.subarray(0, 8).equals(MAGIC)) {
    throw new Error('Not an encrypted sharely file');
  }
  const segSize = header.readUInt32BE(24);
  if (segSize < 1 || segSize > 16 * 1024 * 1024) throw new Error('Invalid segment size');
  return { salt: header.subarray(8, 24), segSize };
}

function plainSizeFromEncrypted(encSize, segSize) {
  const body = encSize - HEADER_LEN;
  const segments = Math.ceil(body / (segSize + TAG_LEN));
  const plain = body - segments * TAG_LEN;
  if (body < TAG_LEN || segments < 1 || plain < 0) throw new Error('Truncated encrypted file');
  return plain;
}

/**
 * Encrypts srcPath into dstPath (which must differ from srcPath).
 * @param {string} srcPath - Plaintext file.
 * @param {string} dstPath - Destination; created or overwritten.
 * @returns {Promise<void>} Resolves once dstPath is fully written and flushed.
 * @throws {Error} if no valid ENCRYPTION_KEY is configured or on I/O errors.
 */
async function encryptFile(srcPath, dstPath) {
  const salt = crypto.randomBytes(16);
  const key = fileKey(salt);
  const header = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(header, 0);
  salt.copy(header, 8);
  header.writeUInt32BE(SEGMENT_SIZE, 24);

  const src = await fs.promises.open(srcPath, 'r');
  const dst = await fs.promises.open(dstPath, 'w', 0o600);
  try {
    const { size } = await src.stat();
    const count = segmentCount(size, SEGMENT_SIZE);
    await dst.write(header);
    const buf = Buffer.alloc(SEGMENT_SIZE);
    for (let i = 0; i < count; i++) {
      const len = Math.min(SEGMENT_SIZE, size - i * SEGMENT_SIZE);
      const { bytesRead } = await src.read(buf, 0, len, i * SEGMENT_SIZE);
      if (bytesRead !== len) throw new Error('File changed while encrypting');
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce(i));
      cipher.setAAD(aad(header, i === count - 1));
      await dst.write(Buffer.concat([cipher.update(buf.subarray(0, len)), cipher.final(), cipher.getAuthTag()]));
    }
    await dst.sync();
  } finally {
    await src.close();
    await dst.close();
  }
}

/**
 * Encrypts a file in place via a temporary sibling and an atomic rename.
 * @param {string} filePath - Plaintext file to replace with its encrypted form.
 * @returns {Promise<void>} Resolves once the encrypted file has replaced the original.
 * @throws {Error} on I/O errors; the original is left untouched then.
 */
async function encryptInPlace(filePath) {
  const tmp = `${filePath}.enc-${crypto.randomBytes(4).toString('hex')}`;
  try {
    await encryptFile(filePath, tmp);
    await fs.promises.rename(tmp, filePath);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Reads the header of an encrypted file and returns its plaintext size.
 * @param {string} filePath - Encrypted file.
 * @returns {Promise<number>} Plaintext size in bytes.
 * @throws {Error} if the file is missing, not encrypted or truncated.
 */
async function getPlainSize(filePath) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(HEADER_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    const { segSize } = parseHeader(header);
    const { size } = await fh.stat();
    return plainSizeFromEncrypted(size, segSize);
  } finally {
    await fh.close();
  }
}

/**
 * Checks whether a file starts with the encrypted-file header.
 * @param {string} filePath - File to inspect.
 * @returns {Promise<boolean>} true if the file is in the encrypted format.
 */
async function isEncryptedFile(filePath) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await fh.read(head, 0, MAGIC.length, 0);
    return bytesRead === MAGIC.length && head.equals(MAGIC);
  } finally {
    await fh.close();
  }
}

async function* decryptRange(filePath, start, end) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(HEADER_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    const { salt, segSize } = parseHeader(header);
    const key = fileKey(salt);
    const { size } = await fh.stat();
    const plainSize = plainSizeFromEncrypted(size, segSize);
    const count = segmentCount(plainSize, segSize);
    const last = end === undefined ? plainSize - 1 : Math.min(end, plainSize - 1);
    const first = start || 0;
    if (plainSize === 0 || first > last) {
      // Still authenticate the (single, empty) segment so tampering is noticed.
      if (plainSize === 0) await readSegment(fh, header, key, segSize, 0, 0, true);
      return;
    }
    for (let i = Math.floor(first / segSize); i <= Math.floor(last / segSize); i++) {
      const segStart = i * segSize;
      const len = Math.min(segSize, plainSize - segStart);
      const plain = await readSegment(fh, header, key, segSize, i, len, i === count - 1);
      const from = Math.max(first - segStart, 0);
      const to = Math.min(last - segStart + 1, len);
      yield plain.subarray(from, to);
    }
  } finally {
    await fh.close();
  }
}

async function readSegment(fh, header, key, segSize, index, len, isLast) {
  const enc = Buffer.alloc(len + TAG_LEN);
  const { bytesRead } = await fh.read(enc, 0, enc.length, HEADER_LEN + index * (segSize + TAG_LEN));
  if (bytesRead !== enc.length) throw new Error('Truncated encrypted file');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce(index));
  decipher.setAAD(aad(header, isLast));
  decipher.setAuthTag(enc.subarray(len));
  return Buffer.concat([decipher.update(enc.subarray(0, len)), decipher.final()]);
}

/**
 * Streams the decrypted bytes [start, end] (inclusive) of an encrypted file.
 * @param {string} filePath - Encrypted file.
 * @param {{start?: number, end?: number}} [range] - Plaintext byte range; whole file if omitted.
 * @returns {import('stream').Readable} Plaintext stream; emits 'error' on tampering, wrong key or I/O errors.
 */
function createDecryptStream(filePath, { start, end } = {}) {
  return Readable.from(decryptRange(filePath, start, end), { objectMode: false });
}

/**
 * Decrypts an encrypted file into a new plaintext file.
 * @param {string} srcPath - Encrypted file.
 * @param {string} dstPath - Plaintext destination; created or overwritten.
 * @returns {Promise<void>} Resolves once dstPath is written.
 * @throws {Error} on tampering, wrong key or I/O errors.
 */
async function decryptToFile(srcPath, dstPath) {
  const out = await fs.promises.open(dstPath, 'w', 0o600);
  try {
    for await (const chunk of decryptRange(srcPath)) await out.write(chunk);
  } finally {
    await out.close();
  }
}

module.exports = {
  isEnabled,
  getKeyError,
  encryptFile,
  encryptInPlace,
  getPlainSize,
  isEncryptedFile,
  createDecryptStream,
  decryptToFile,
};
