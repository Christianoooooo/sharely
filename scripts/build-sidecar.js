#!/usr/bin/env node
/**
 * Builds the Node.js backend as a standalone executable (via @yao-pkg/pkg)
 * and places it in src-tauri/binaries/ with the naming convention Tauri expects:
 *
 *   sharely-server-{rustTarget}[.exe]
 *
 * Run: node scripts/build-sidecar.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const BINARIES_DIR = path.join(ROOT, 'src-tauri', 'binaries');

fs.mkdirSync(BINARIES_DIR, { recursive: true });

// Detect current platform Rust target triple
function getRustTarget() {
  try {
    const output = execSync('rustc -vV', { encoding: 'utf8' });
    const match = output.match(/host:\s+(\S+)/);
    if (match) return match[1];
  } catch {}
  // Fallback
  const p = os.platform();
  const a = os.arch();
  const arch = a === 'x64' ? 'x86_64' : a === 'arm64' ? 'aarch64' : a;
  if (p === 'linux') return `${arch}-unknown-linux-gnu`;
  if (p === 'darwin') return `${arch}-apple-darwin`;
  if (p === 'win32') return `${arch}-pc-windows-msvc`;
  return `${arch}-unknown-linux-gnu`;
}

// Map platform to pkg target
function getPkgTarget() {
  const p = os.platform();
  const a = os.arch() === 'arm64' ? 'arm64' : 'x64';
  if (p === 'darwin') return `node22-macos-${a}`;
  if (p === 'win32') return `node22-win-${a}`;
  return `node22-linux-${a}`;
}

const rustTarget = getRustTarget();
const pkgTarget = getPkgTarget();
const ext = os.platform() === 'win32' ? '.exe' : '';
const outName = `sharely-server-${rustTarget}${ext}`;
const outPath = path.join(BINARIES_DIR, outName);

console.log(`Building sidecar for ${rustTarget}...`);
console.log(`  pkg target: ${pkgTarget}`);
console.log(`  output:     ${outPath}`);

execSync(
  `npx pkg server-entry.js --target ${pkgTarget} --output "${outPath}" --compress GZip`,
  { cwd: ROOT, stdio: 'inherit' },
);

console.log(`\nSidecar built: ${outPath}`);
