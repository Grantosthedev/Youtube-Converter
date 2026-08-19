const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validateDenoRuntime } = require('../src/runtime-readiness');

function fixture(t, architecture = process.arch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'downroad-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const denoPath = path.join(dir, 'deno');
  const manifestPath = path.join(dir, 'runtime-manifest.json');
  fs.writeFileSync(denoPath, 'reviewed-deno', { mode: 0o755 });
  fs.writeFileSync(manifestPath, JSON.stringify({
    architecture,
    deno: {
      version: '2.9.5',
      sha256: crypto.createHash('sha256').update('reviewed-deno').digest('hex'),
    },
  }));
  return { denoPath, manifestPath };
}

test('validates the bundled Deno digest architecture and version', async (t) => {
  const files = fixture(t);
  const result = await validateDenoRuntime({
    ...files,
    execute: async () => 'deno 2.9.5\nv8 14.7.0',
  });
  assert.equal(result.success, true);
  assert.equal(result.version, '2.9.5');
});

test('rejects a damaged or wrong-architecture Deno runtime', async (t) => {
  const files = fixture(t, process.arch === 'arm64' ? 'x64' : 'arm64');
  await assert.rejects(validateDenoRuntime({
    ...files,
    execute: async () => 'deno 2.9.5',
  }), /architecture mismatch/);

  const validFiles = fixture(t);
  fs.appendFileSync(validFiles.denoPath, 'tampered');
  await assert.rejects(validateDenoRuntime({
    ...validFiles,
    execute: async () => 'deno 2.9.5',
  }), /checksum/);
});

test('uses the macOS code signature for packaged runtime integrity', async (t) => {
  const files = fixture(t);
  fs.appendFileSync(files.denoPath, 'signed-by-packager');
  let signatureChecked = false;
  const result = await validateDenoRuntime({
    ...files,
    packaged: true,
    verifySignature: async () => { signatureChecked = true; },
    execute: async () => 'deno 2.9.5',
  });
  assert.equal(result.success, true);
  assert.equal(signatureChecked, true);
});
