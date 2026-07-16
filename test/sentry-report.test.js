const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyError,
  configureSentryReporting,
  fingerprintFor,
  reportError,
  scrubSentryEvent,
  scrubString,
} = require('../src/sentry-report');

test('classifies expected user and platform failures without reporting noise', () => {
  assert.equal(classifyError(new Error('This video is private.')), 'expected');
  assert.equal(classifyError('Network error. Check your connection.'), 'expected');
  assert.equal(classifyError('nsig extraction failed because yt-dlp is outdated'), 'platform');
  assert.equal(classifyError(new TypeError('Cannot read properties of undefined')), 'bug');
});

test('groups platform regressions by platform and phase', () => {
  assert.deepEqual(
    fingerprintFor('platform', { platform: 'YouTube', phase: 'fetch-info' }),
    ['downroad-platform', 'youtube', 'fetch-info'],
  );
  assert.equal(fingerprintFor('bug', { platform: 'youtube', phase: 'download' }), undefined);
});

test('scrubs URLs, account names, and sensitive context fields', () => {
  const event = scrubSentryEvent({
    message: 'Failed at https://youtube.com/watch?v=secret for /Users/grant/Downloads/video.mp4',
    user: { email: 'person@example.com' },
    request: {
      url: 'https://youtube.com/watch?v=secret',
      headers: { authorization: 'secret' },
      data: 'clipboard payload',
    },
    extra: {
      filePath: '/Users/grant/Downloads/video.mp4',
      project: 'Client Name',
      stderr: 'See https://example.com/private and /Users/grant/tmp/log',
    },
    exception: {
      values: [{
        stacktrace: {
          frames: [{ filename: 'file:///Users/grant/app/src/main.js' }],
        },
      }],
    },
  });

  assert.equal(event.user, undefined);
  assert.equal(event.request.url, '[Filtered]');
  assert.equal(event.request.headers, undefined);
  assert.equal(event.extra.filePath, '[Filtered]');
  assert.equal(event.extra.project, '[Filtered]');
  assert.doesNotMatch(event.message, /youtube\.com|\/Users\/grant/);
  assert.doesNotMatch(event.extra.stderr, /example\.com|\/Users\/grant/);
  assert.match(event.exception.values[0].stacktrace.frames[0].filename, /Users\/\[Filtered\]/);
});

test('reports only actionable errors with safe tags and context', () => {
  const captured = [];
  const scopeState = { tags: {}, contexts: {} };
  const fakeSentry = {
    withScope(callback) {
      const scope = {
        setLevel: level => { scopeState.level = level; },
        setTag: (key, value) => { scopeState.tags[key] = value; },
        setFingerprint: value => { scopeState.fingerprint = value; },
        setContext: (key, value) => { scopeState.contexts[key] = value; },
      };
      return callback(scope);
    },
    captureException(error) {
      captured.push(error);
      return 'event-id';
    },
  };

  configureSentryReporting(fakeSentry);
  assert.equal(reportError(new Error('This video is private.'), { phase: 'fetch-info' }), null);
  assert.equal(captured.length, 0);

  const eventId = reportError(new TypeError('Unexpected parser failure'), {
    phase: 'parse-info',
    platform: 'youtube',
    details: { url: 'https://example.com/private', filePath: '/Users/grant/file' },
  });

  assert.equal(eventId, 'event-id');
  assert.equal(captured.length, 1);
  assert.equal(scopeState.tags.error_class, 'bug');
  assert.equal(scopeState.tags.phase, 'parse-info');
  assert.equal(scopeState.contexts.failure.url, '[Filtered]');
  assert.equal(scopeState.contexts.failure.filePath, '[Filtered]');
});

test('scrubString keeps useful text while removing private locations', () => {
  const result = scrubString('open file:///Users/grant/a.txt from https://example.com/x');
  assert.match(result, /open \[Filtered file URL\] from \[Filtered URL\]/);
});
