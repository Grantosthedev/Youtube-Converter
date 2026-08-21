const test = require('node:test');
const assert = require('node:assert/strict');
const { isBenignSquirrelUpdateError } = require('../src/squirrel-update');

test('treats Squirrel busy errors as benign', () => {
  assert.equal(
    isBenignSquirrelUpdateError('The command is disabled and cannot be executed'),
    true,
  );
  assert.equal(isBenignSquirrelUpdateError('Cannot be executed while checking'), true);
});

test('does not treat real update failures as benign', () => {
  assert.equal(isBenignSquirrelUpdateError('net::ERR_INTERNET_DISCONNECTED'), false);
  assert.equal(isBenignSquirrelUpdateError('404 Not Found'), false);
  assert.equal(isBenignSquirrelUpdateError(''), false);
});
