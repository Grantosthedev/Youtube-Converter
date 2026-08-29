#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const RUNTIME_BINARIES = ['bgutil-pot', 'deno', 'yt-dlp_macos'];
const IDENTITY = process.env.APPLE_SIGNING_IDENTITY || 'Developer ID Application';
const ENTITLEMENTS = path.join(ROOT, 'build', 'entitlements.inherit.plist');

function signRuntimeBinary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing runtime binary: ${filePath}`);
  }
  fs.chmodSync(filePath, 0o755);
  execFileSync('/usr/bin/codesign', [
    '--force',
    '--options', 'runtime',
    '--timestamp',
    '--sign', IDENTITY,
    '--entitlements', ENTITLEMENTS,
    filePath,
  ], { stdio: 'inherit' });
}

function signRuntimeDirectory(directory) {
  for (const name of RUNTIME_BINARIES) {
    signRuntimeBinary(path.join(directory, name));
  }
}

function signBundledRuntimes() {
  for (const name of RUNTIME_BINARIES) {
    signRuntimeBinary(path.join(BIN_DIR, name));
  }
  console.log('Signed bundled runtime binaries for notarization.');
}

if (require.main === module) {
  signBundledRuntimes();
}

module.exports = {
  RUNTIME_BINARIES,
  signRuntimeBinary,
  signRuntimeDirectory,
  signBundledRuntimes,
};
