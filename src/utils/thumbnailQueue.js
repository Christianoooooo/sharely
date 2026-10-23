const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// File-based job queue between the app and the isolated thumbnailer container
// (no network, no secrets, different user). The app owns the queue root and in/;
// the worker can only write to out/, so it cannot redirect in/ or out/ via symlinks.
const JOB_NAME = /^([0-9a-f]{32})\.(video|pdf)$/;
const HEARTBEAT_INTERVAL_MS = 5000;
// Longer than one gs/ffmpeg run (30 s), during which the worker cannot beat.
const HEARTBEAT_MAX_AGE_MS = 60000;
const JOB_TIMEOUT_MS = 180000;
const POLL_MS = 250;
// A real 320px JPEG is a few dozen KB; anything larger did not come from ffmpeg/gs.
const MAX_RESULT_BYTES = 2 * 1024 * 1024;

function queueDirs(root) {
  const outDir = path.join(root, 'out');
  return { inDir: path.join(root, 'in'), outDir, heartbeat: path.join(outDir, 'heartbeat') };
}

/**
 * Creates in/ and out/ below the queue root; call once at app startup.
 * @param {string} root - Queue root (THUMBNAIL_WORKER_DIR), owned by the app user.
 */
function prepareQueue(root) {
  const { inDir, outDir } = queueDirs(root);
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  // The worker runs as another user and must be able to write its results.
  fs.chmodSync(outDir, 0o777);
  // Jobs left behind by a crash; younger ones may belong to a concurrent migrate:thumbnails run.
  for (const name of fs.readdirSync(inDir)) {
    const p = path.join(inDir, name);
    if (Date.now() - fs.lstatSync(p).mtimeMs > JOB_TIMEOUT_MS) fs.rmSync(p, { force: true });
  }
}

async function workerAlive(heartbeat) {
  try {
    const st = await fs.promises.stat(heartbeat);
    return Date.now() - st.mtimeMs < HEARTBEAT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// The worker is untrusted: refuse symlinks (O_NOFOLLOW), FIFOs (O_NONBLOCK + isFile)
// and oversized results, otherwise it could make the app copy arbitrary files.
async function readResult(resultPath) {
  let fh;
  try {
    fh = await fs.promises.open(
      resultPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
  } catch {
    return null;
  }
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.size > MAX_RESULT_BYTES) return null;
    return await fh.readFile();
  } finally {
    await fh.close();
  }
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

let warnedNoWorker = false;

/**
 * Renders a thumbnail in the thumbnailer container and writes it to outputPath.
 * Waits up to JOB_TIMEOUT_MS; returns false at once if the worker shows no heartbeat.
 * @param {string} root - Queue root (THUMBNAIL_WORKER_DIR).
 * @param {string} inputPath - Plaintext source file; copied into the queue.
 * @param {'video'|'pdf'} kind - Renderer to use.
 * @param {string} outputPath - JPEG target in the thumbnail directory.
 * @returns {Promise<boolean>} true if a thumbnail was written.
 */
async function renderViaWorker(root, inputPath, kind, outputPath) {
  const { inDir, outDir, heartbeat } = queueDirs(root);
  if (!(await workerAlive(heartbeat))) {
    if (!warnedNoWorker) {
      warnedNoWorker = true;
      console.warn('[thumbnails] thumbnailer container not running — thumbnails are skipped (docker compose up -d)');
    }
    return false;
  }
  warnedNoWorker = false;

  const id = crypto.randomBytes(16).toString('hex');
  const job = path.join(inDir, `${id}.${kind}`);
  const result = path.join(outDir, `${id}.jpg`);
  const failed = path.join(outDir, `${id}.failed`);
  try {
    // Copy under a name the worker ignores, then rename so it never sees a partial file.
    await fs.promises.copyFile(inputPath, `${job}.tmp`, fs.constants.COPYFILE_EXCL);
    await fs.promises.chmod(`${job}.tmp`, 0o644);
    await fs.promises.rename(`${job}.tmp`, job);

    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const data = await readResult(result);
      if (data) {
        await fs.promises.writeFile(outputPath, data);
        return true;
      }
      if (fs.existsSync(failed)) return false;
      await sleep(POLL_MS);
    }
    return false;
  } finally {
    for (const p of [`${job}.tmp`, job, result, failed]) fs.rmSync(p, { force: true });
  }
}

module.exports = {
  JOB_NAME, HEARTBEAT_INTERVAL_MS, queueDirs, prepareQueue, renderViaWorker,
};
