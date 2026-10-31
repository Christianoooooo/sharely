const assert = require('assert');
const { Readable } = require('stream');
const { EventEmitter } = require('events');
const multer = require('multer');
const upload = require('../middleware/upload');
const { discardUncommittedUploads } = require('./storeUpload');

// Feed a raw multipart body (fields only) through the real upload middleware
// and resolve with the error multer hands to next(), if any.
function runMultipart(fields) {
  const boundary = '----sharelylimittest';
  const parts = fields.map((name) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\nx\r\n`,
  ));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return new Promise((resolve) => {
    const req = Readable.from([body]);
    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    };
    upload.single('upload')(req, {}, (err) => resolve(err));
  });
}

function fields(count, name) {
  return Array.from({ length: count }, (_, i) => name(i));
}

let passed = 0;
let failed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed++;
    console.log(`ok ${name}`);
  }).catch((err) => {
    failed++;
    console.error(`not ok ${name}: ${err.message}`);
  });
}

(async () => {
  await check('a small field set still parses', async () => {
    const err = await runMultipart(fields(50, (i) => `f${i}[0][0]`));
    assert.ok(!err, err && err.message);
  });

  await check('150 plain fields are refused with LIMIT_FIELD_COUNT', async () => {
    const err = await runMultipart(fields(150, (i) => `f${i}`));
    assert.ok(err instanceof multer.MulterError, 'MulterError expected');
    assert.strictEqual(err.code, 'LIMIT_FIELD_COUNT');
  });

  await check('deeply nested field names are refused with LIMIT_FIELD_NESTING', async () => {
    const err = await runMultipart(fields(5, (i) => `f${i}${'[0]'.repeat(30)}`));
    assert.ok(err instanceof multer.MulterError, 'MulterError expected');
    assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING');
  });

  await check('an out-of-range array index is refused with LIMIT_FIELD_ARRAY_INDEX', async () => {
    const err = await runMultipart(fields(5, (i) => `f${i}[0][9999]`));
    assert.ok(err instanceof multer.MulterError, 'MulterError expected');
    assert.strictEqual(err.code, 'LIMIT_FIELD_ARRAY_INDEX');
  });

  await check('an error response with a pathless file object does not throw', async () => {
    const req = { file: {} }; // multer sets req.file before diskStorage assigns path
    const res = new EventEmitter();
    res.statusCode = 400;
    discardUncommittedUploads(req, res, () => {});
    assert.doesNotThrow(() => res.emit('finish'));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
