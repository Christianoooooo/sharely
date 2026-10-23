/**
 * Thumbnail worker for the isolated "thumbnailer" container (see docker-compose.yml).
 * Picks up jobs from THUMBNAIL_WORKER_DIR/in, renders them one at a time and writes
 * <id>.jpg or <id>.failed to THUMBNAIL_WORKER_DIR/out.
 */
const fs = require('fs');
const path = require('path');
const {
  JOB_NAME, HEARTBEAT_INTERVAL_MS, queueDirs,
} = require('./utils/thumbnailQueue');
const { renderThumbnail } = require('./utils/thumbnailTools');

const ROOT = process.env.THUMBNAIL_WORKER_DIR;
if (!ROOT) {
  console.error('[thumbnailer] THUMBNAIL_WORKER_DIR is not set');
  process.exit(1);
}

const { inDir, outDir, heartbeat } = queueDirs(ROOT);
const POLL_MS = 500;
// Results the app never collected (it timed out or restarted).
const STALE_RESULT_MS = 10 * 60 * 1000;

const done = new Set();
let lastBeat = 0;

function beat() {
  if (Date.now() - lastBeat < HEARTBEAT_INTERVAL_MS) return;
  lastBeat = Date.now();
  try {
    fs.writeFileSync(heartbeat, '');
    for (const name of fs.readdirSync(outDir)) {
      const p = path.join(outDir, name);
      if (p !== heartbeat && Date.now() - fs.lstatSync(p).mtimeMs > STALE_RESULT_MS) fs.rmSync(p, { force: true });
    }
  } catch (err) {
    // out/ is created by the app; until it has started there is nothing to do.
    if (err.code !== 'ENOENT') console.error('[thumbnailer] heartbeat failed:', err.message);
  }
}

async function processJob(name) {
  const [, id, kind] = name.match(JOB_NAME);
  const part = path.join(outDir, `${id}.part.jpg`);
  const ok = await renderThumbnail(path.join(inDir, name), kind, part);
  try {
    // Rename so the app never reads a half-written JPEG.
    if (ok) fs.renameSync(part, path.join(outDir, `${id}.jpg`));
    else fs.writeFileSync(path.join(outDir, `${id}.failed`), '');
  } catch (err) {
    console.error(`[thumbnailer] ${id}: ${err.message}`);
  }
  fs.rmSync(part, { force: true });
}

async function loop() {
  for (;;) {
    beat();
    let names = [];
    try {
      names = fs.readdirSync(inDir).filter((n) => JOB_NAME.test(n));
    } catch { /* in/ not created yet */ }
    // The app deletes a job once it has its result; forget those ids.
    for (const n of done) if (!names.includes(n)) done.delete(n);
    for (const name of names) {
      if (done.has(name)) continue;
      done.add(name);
      await processJob(name);
      beat();
    }
    await new Promise((r) => { setTimeout(r, POLL_MS); });
  }
}

console.log(`[thumbnailer] watching ${inDir}`);
loop();
