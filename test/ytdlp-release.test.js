const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MINIMUM_FIXED_YTDLP_VERSION,
  compareYtdlpVersions,
  isSupportedYtdlpVersion,
  releaseAsset,
} = require('../src/ytdlp-release');

test('orders stable and nightly timestamp versions numerically', () => {
  assert.equal(compareYtdlpVersions('2026.08.18.122307', '2026.07.04'), 1);
  assert.equal(compareYtdlpVersions('nightly@2026.08.19.1', '2026.08.18.999999'), 1);
  assert.equal(compareYtdlpVersions('2026.08.18.122307', '2026.08.18.122307'), 0);
  assert.equal(compareYtdlpVersions('garbage', '2026.08.18.122307'), null);
});

test('rejects engines older than the confirmed YouTube fix', () => {
  assert.equal(isSupportedYtdlpVersion('2026.07.04'), false);
  assert.equal(isSupportedYtdlpVersion(MINIMUM_FIXED_YTDLP_VERSION), true);
});

test('selects an exact release asset with a GitHub SHA-256 digest', () => {
  const selected = releaseAsset({
    tag_name: '2026.08.18.122307',
    assets: [{
      name: 'yt-dlp_macos',
      browser_download_url: 'https://example.com/yt-dlp_macos',
      digest: `sha256:${'a'.repeat(64)}`,
      size: 123,
    }],
  });

  assert.equal(selected.version, '2026.08.18.122307');
  assert.equal(selected.sha256, 'a'.repeat(64));
  assert.equal(selected.size, 123);
});

test('refuses release assets without a trustworthy digest', () => {
  assert.throws(() => releaseAsset({
    tag_name: '2026.08.18.122307',
    assets: [{
      name: 'yt-dlp_macos',
      browser_download_url: 'https://example.com/yt-dlp_macos',
    }],
  }), /SHA-256/);
});
