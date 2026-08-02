const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyError } = require('../src/sentry-report');
const { mapError } = require('../src/ytdlp');

test('treats Instagram audience restrictions as expected unavailability', () => {
  const stderr = "ERROR: [Instagram] synthetic-id: This content isn't available to everyone.";
  const message = mapError(stderr);

  assert.equal(message, 'This content is currently unavailable on the platform.');
  assert.equal(classifyError(message), 'expected');
});
