const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  installReleaseAsset,
  readEngineMetadata,
  shouldThrottleYtdlpCheck,
} = require('../src/updater');

const FIXED_VERSION = '2026.08.18.122307';
const ASSET = {
  version: FIXED_VERSION,
  downloadUrl: 'https://example.com/yt-dlp_macos',
  sha256: 'a'.repeat(64),
};

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'downroad-updater-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('does not throttle a fresh check for a stale stable engine', () => {
  const now = Date.now();
  assert.equal(shouldThrottleYtdlpCheck({
    currentVersion: '2026.07.04',
    metadata: { channel: 'stable', checkedAt: now },
    storedState: { checkedAt: now },
    now,
  }), false);

  assert.equal(shouldThrottleYtdlpCheck({
    currentVersion: FIXED_VERSION,
    metadata: { channel: 'nightly', checkedAt: now },
    storedState: {},
    now,
  }), true);
});

test('installs a validated candidate atomically and records its channel', async (t) => {
  const dir = tempDir(t);
  const dest = path.join(dir, 'yt-dlp_macos');
  fs.writeFileSync(dest, 'old');

  const result = await installReleaseAsset(ASSET, {
    userBinDir: dir,
    destPath: dest,
    download: async (_url, candidate) => fs.writeFileSync(candidate, 'new'),
    prepare: async () => {},
    validate: async file => fs.readFileSync(file, 'utf8') === 'new' ? FIXED_VERSION : null,
  });

  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'new');
  assert.equal(fs.readFileSync(`${dest}.previous`, 'utf8'), 'old');
  assert.equal(readEngineMetadata(dir).channel, 'nightly');
});

test('restores the previous engine when post-install validation fails', async (t) => {
  const dir = tempDir(t);
  const dest = path.join(dir, 'yt-dlp_macos');
  fs.writeFileSync(dest, 'working-engine');
  let validations = 0;

  await assert.rejects(installReleaseAsset(ASSET, {
    userBinDir: dir,
    destPath: dest,
    download: async (_url, candidate) => fs.writeFileSync(candidate, 'candidate'),
    prepare: async () => {},
    validate: async () => (++validations === 1 ? FIXED_VERSION : null),
  }), /post-install validation/);

  assert.equal(fs.readFileSync(dest, 'utf8'), 'working-engine');
});

test('keeps the current engine when checksum verification rejects the download', async (t) => {
  const dir = tempDir(t);
  const dest = path.join(dir, 'yt-dlp_macos');
  fs.writeFileSync(dest, 'working-engine');

  await assert.rejects(installReleaseAsset(ASSET, {
    userBinDir: dir,
    destPath: dest,
    download: async () => { throw new Error('yt-dlp checksum verification failed'); },
    prepare: async () => {},
    validate: async () => FIXED_VERSION,
  }), /checksum/);

  assert.equal(fs.readFileSync(dest, 'utf8'), 'working-engine');
  assert.equal(fs.existsSync(`${dest}.previous`), false);
});
