const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  installReleaseAsset,
  isNewerAppVersion,
  readEngineMetadata,
  runYtdlpMutation,
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

test('compares semantic application versions independently of yt-dlp dates', () => {
  assert.equal(isNewerAppVersion('1.5.3', '1.5.2'), true);
  assert.equal(isNewerAppVersion('1.5.2', '1.5.3'), false);
  assert.equal(isNewerAppVersion('2.0.0', '1.99.99'), true);
});

test('coalesces concurrent engine mutations into one operation', async () => {
  let runs = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = runYtdlpMutation(async () => {
    runs++;
    await gate;
    return 'done';
  });
  const second = runYtdlpMutation(async () => {
    runs++;
    return 'wrong';
  });
  assert.equal(first, second);
  release();
  assert.equal(await second, 'done');
  assert.equal(runs, 1);
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

test('rolls back the binary when metadata cannot be committed', async (t) => {
  const dir = tempDir(t);
  const dest = path.join(dir, 'yt-dlp_macos');
  fs.writeFileSync(dest, 'working-engine');

  await assert.rejects(installReleaseAsset(ASSET, {
    userBinDir: dir,
    destPath: dest,
    download: async (_url, candidate) => fs.writeFileSync(candidate, 'candidate'),
    prepare: async () => {},
    validate: async file => fs.readFileSync(file, 'utf8') === 'candidate' ? FIXED_VERSION : null,
    writeMetadata: () => { throw new Error('metadata write failed'); },
  }), /metadata write failed/);

  assert.equal(fs.readFileSync(dest, 'utf8'), 'working-engine');
});
