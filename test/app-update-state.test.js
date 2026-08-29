const test = require('node:test');
const assert = require('node:assert/strict');

const { selectAppUpdateState } = require('../src/app-update-state');

test('does not let background updater noise hide an available update', () => {
  const available = { status: 'available', version: '2.0.0' };
  for (const status of ['checking', 'downloading', 'up-to-date', 'error']) {
    assert.equal(selectAppUpdateState(available, { status }), available);
  }
});

test('promotes an available update once it is downloaded', () => {
  const downloaded = { status: 'downloaded', version: '2.0.0' };
  assert.deepEqual(
    selectAppUpdateState({ status: 'available', version: '2.0.0' }, downloaded),
    downloaded,
  );
});

test('keeps a downloaded update actionable until installation', () => {
  const downloaded = { status: 'downloaded', version: '2.0.0' };
  assert.equal(selectAppUpdateState(downloaded, { status: 'up-to-date' }), downloaded);
});
