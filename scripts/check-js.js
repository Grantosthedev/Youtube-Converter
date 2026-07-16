const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INCLUDED_DIRS = ['scripts', 'src', 'test'];
const SKIPPED_FILES = new Set(['src/renderer/sentry-renderer.js']);
let failed = false;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

for (const relativeDir of INCLUDED_DIRS) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) continue;

  for (const file of walk(dir)) {
    const relativePath = path.relative(ROOT, file);
    if (SKIPPED_FILES.has(relativePath)) continue;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(result.stderr || `Syntax check failed: ${relativePath}\n`);
    }
  }
}

if (failed) process.exit(1);
console.log('JavaScript syntax checks passed.');
