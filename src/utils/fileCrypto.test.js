// Fixed test key so the module enables encryption; never used outside this test.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  encryptFile, encryptInPlace, getPlainSize, isEncryptedFile, createDecryptStream, decryptToFile,
} = require('./fileCrypto');

const SEG = 64 * 1024;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharely-crypto-'));

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function rejects(fn) {
  try { await fn(); return false; } catch { return true; }
}

(async () => {
  console.log('Running fileCrypto tests...\n');
  let passed = 0;
  let failed = 0;
  const check = (name, ok) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
    if (ok) passed++; else failed++;
  };

  for (const size of [0, 1, SEG - 1, SEG, SEG + 1, 3 * SEG + 5]) {
    const plain = crypto.randomBytes(size);
    const src = path.join(dir, `p${size}`);
    const enc = path.join(dir, `e${size}`);
    fs.writeFileSync(src, plain);
    await encryptFile(src, enc);
    const encBytes = fs.readFileSync(enc);
    if (size >= 16) {
      check(`size ${size}: ciphertext differs from plaintext`, !encBytes.subarray(32, 48).equals(plain.subarray(0, 16)));
    }
    check(`size ${size}: plain size from header`, (await getPlainSize(enc)) === size);
    check(`size ${size}: full round trip`, (await readAll(createDecryptStream(enc))).equals(plain));
    if (size > 2) {
      let rangesOk = true;
      for (let k = 0; k < 25; k++) {
        const a = crypto.randomInt(size);
        const b = a + crypto.randomInt(size - a);
        const got = await readAll(createDecryptStream(enc, { start: a, end: b }));
        if (!got.equals(plain.subarray(a, b + 1))) rangesOk = false;
      }
      check(`size ${size}: 25 random ranges`, rangesOk);
    }
  }

  const plain = crypto.randomBytes(3 * SEG + 100);
  const src = path.join(dir, 'tamper-src');
  const enc = path.join(dir, 'tamper-enc');
  fs.writeFileSync(src, plain);
  await encryptFile(src, enc);
  const good = fs.readFileSync(enc);
  const segLen = SEG + 16;

  const flipped = Buffer.from(good);
  flipped[32 + 10] ^= 1;
  fs.writeFileSync(enc, flipped);
  check('flipped ciphertext bit is rejected', await rejects(() => readAll(createDecryptStream(enc))));

  const swapped = Buffer.concat([good.subarray(0, 32), good.subarray(32 + segLen, 32 + 2 * segLen),
    good.subarray(32, 32 + segLen), good.subarray(32 + 2 * segLen)]);
  fs.writeFileSync(enc, swapped);
  check('swapped segments are rejected', await rejects(() => readAll(createDecryptStream(enc))));

  fs.writeFileSync(enc, good.subarray(0, 32 + 2 * segLen));
  check('file truncated at a segment boundary is rejected',
    await rejects(() => readAll(createDecryptStream(enc, { start: SEG, end: 2 * SEG - 1 }))));

  fs.writeFileSync(enc, Buffer.concat([good, good.subarray(32, 32 + segLen)]));
  check('appended segment is rejected', await rejects(() => readAll(createDecryptStream(enc))));

  const headerTampered = Buffer.from(good);
  headerTampered[10] ^= 1;
  fs.writeFileSync(enc, headerTampered);
  check('modified salt in header is rejected', await rejects(() => readAll(createDecryptStream(enc))));

  fs.writeFileSync(enc, good);
  check('restored file decrypts again', (await readAll(createDecryptStream(enc))).equals(plain));

  const inPlace = path.join(dir, 'inplace');
  fs.writeFileSync(inPlace, plain);
  check('plaintext is not detected as encrypted', !(await isEncryptedFile(inPlace)));
  await encryptInPlace(inPlace);
  check('encryptInPlace produces the encrypted format', await isEncryptedFile(inPlace));
  check('no temp files left behind', fs.readdirSync(dir).every((f) => !f.includes('.enc-')));
  const out = path.join(dir, 'decrypted');
  await decryptToFile(inPlace, out);
  check('decryptToFile restores the plaintext', fs.readFileSync(out).equals(plain));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
