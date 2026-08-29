const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isYoutubeRecoveryError,
  recoveryArgs,
} = require('../src/youtube-recovery');

test('retries only YouTube playback rejection failures', () => {
  for (const code of ['access_forbidden', 'login_required', 'po_token_required', 'sabr_only']) {
    assert.equal(isYoutubeRecoveryError({ code }), true);
  }
  for (const code of ['age_restricted', 'private_content', 'rate_limited', 'network_error']) {
    assert.equal(isYoutubeRecoveryError({ code }), false);
  }
});

test('builds an isolated mweb provider configuration', () => {
  const args = recoveryArgs('http://127.0.0.1:45678');
  assert.ok(args.includes('--plugin-dirs'));
  assert.ok(args.includes('youtube:player_client=mweb'));
  assert.ok(args.includes('youtubepot-bgutilhttp:base_url=http://127.0.0.1:45678'));
  assert.equal(args.some(value => /cookie/i.test(value)), false);
});
