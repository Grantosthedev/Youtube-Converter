const test = require('node:test');
const assert = require('node:assert/strict');

const { nextEngineReadinessError } = require('../src/ytdlp-readiness');

test('does not disable a working engine when an optional update fails', () => {
  assert.equal(nextEngineReadinessError(null, {
    success: false,
    error: 'GitHub is unavailable',
  }), null);
});

test('keeps mandatory readiness failures until an update succeeds', () => {
  assert.equal(nextEngineReadinessError('Engine is stale', {
    success: false,
    error: 'Update checksum failed',
  }), 'Update checksum failed');
  assert.equal(nextEngineReadinessError('Engine is stale', {
    success: true,
    version: '2026.08.18.122307',
  }), null);
});
