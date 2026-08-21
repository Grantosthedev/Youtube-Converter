const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildDownloadArgs,
  buildInfoArgs,
  contextualizeDiagnosis,
  diagnoseYtdlpError,
  youtubeRuntimeArgs,
} = require('../src/ytdlp');

function executable(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'downroad-deno-'));
  const file = path.join(dir, 'deno');
  fs.writeFileSync(file, '#!/bin/sh\n');
  fs.chmodSync(file, 0o755);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return file;
}

test('distinguishes 403 access rejection from actual 429 rate limiting', () => {
  const forbidden = diagnoseYtdlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden');
  assert.equal(forbidden.code, 'access_forbidden');
  assert.equal(forbidden.httpStatus, 403);
  assert.doesNotMatch(forbidden.message, /rate.?limit/i);

  const limited = diagnoseYtdlpError('ERROR: HTTP Error 429: Too Many Requests');
  assert.equal(limited.code, 'rate_limited');
  assert.equal(limited.httpStatus, 429);
  assert.match(limited.message, /rate-limiting/i);
});

test('prioritizes actionable runtime and token evidence over a trailing 403', () => {
  const runtime = diagnoseYtdlpError([
    'WARNING: No supported JavaScript runtime could be found.',
    'ERROR: HTTP Error 403: Forbidden',
  ].join('\n'));
  assert.equal(runtime.code, 'js_runtime_missing');

  const token = diagnoseYtdlpError([
    'WARNING: GVS PO Token was not provided.',
    'ERROR: HTTP Error 403: Forbidden',
  ].join('\n'));
  assert.equal(token.code, 'po_token_required');
});

test('does not treat an unrelated bare Forbidden string as platform rate limiting', () => {
  const result = diagnoseYtdlpError('ERROR: Permission denied: Forbidden to write file');
  assert.equal(result.code, 'upstream_error');
  assert.doesNotMatch(result.message, /rate.?limit/i);
});

test('injects the bundled Deno runtime only into YouTube operations', (t) => {
  const deno = executable(t);
  assert.deepEqual(youtubeRuntimeArgs('youtube', deno), ['--js-runtimes', `deno:${deno}`]);
  assert.deepEqual(youtubeRuntimeArgs('instagram', deno), []);

  const infoArgs = buildInfoArgs({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'youtube',
    ffmpegPath: '/tmp/ffmpeg',
    denoPath: deno,
  });
  assert.ok(infoArgs.includes(`deno:${deno}`));
  assert.equal(infoArgs.includes('--no-warnings'), false);
});

test('keeps YouTube client selection under yt-dlp control', (t) => {
  const deno = executable(t);
  const args = buildDownloadArgs({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    quality: '1080',
    outputPath: '/tmp',
    title: 'Video',
    ffmpegDir: '/tmp',
    platform: 'youtube',
    denoPath: deno,
  });

  assert.ok(args.includes(`deno:${deno}`));
  assert.equal(args.includes('--no-warnings'), false);
  assert.equal(args.some(arg => /player[_-]client/.test(arg)), false);
  assert.equal(args.some(arg => /android_vr|web_embedded/.test(arg)), false);
});

test('adds an explicitly imported session only to YouTube operations', (t) => {
  const deno = executable(t);
  const cookieFile = path.join(path.dirname(deno), 'youtube-cookies.txt');
  fs.writeFileSync(cookieFile, '.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsecret\n');

  const youtubeArgs = buildInfoArgs({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'youtube',
    ffmpegPath: '/tmp/ffmpeg',
    denoPath: deno,
    cookieFile,
  });
  const instagramArgs = buildInfoArgs({
    url: 'https://www.instagram.com/reel/example/',
    platform: 'instagram',
    ffmpegPath: '/tmp/ffmpeg',
    denoPath: deno,
    cookieFile,
  });

  assert.deepEqual(youtubeArgs.slice(youtubeArgs.indexOf('--cookies'), -1), ['--cookies', cookieFile]);
  assert.equal(instagramArgs.includes('--cookies'), false);
});

test('distinguishes a missing session from an expired imported session', () => {
  const diagnosis = diagnoseYtdlpError('Sign in to confirm you’re not a bot');
  assert.match(contextualizeDiagnosis(diagnosis, { platform: 'youtube' }).message, /Connect a YouTube session/);
  assert.match(
    contextualizeDiagnosis(diagnosis, { platform: 'youtube', cookieFile: '/tmp/cookies.txt' }).message,
    /rejected or expired/,
  );
});
