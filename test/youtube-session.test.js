const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  filterYoutubeCookies,
  hasYoutubeSession,
  importYoutubeCookies,
  youtubeCookieArgs,
} = require('../src/youtube-session');

function cookie(domain, name, expires = 0) {
  return `${domain}\tTRUE\t/\tTRUE\t${expires}\t${name}\tsecret`;
}

test('keeps only active YouTube cookies from an exported cookie jar', () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;
  const filtered = filterYoutubeCookies([
    '# Netscape HTTP Cookie File',
    cookie('.youtube.com', 'SID', future),
    `#HttpOnly_${cookie('.youtube.com', 'HTTP_SID', future)}`,
    cookie('.example.com', 'UNRELATED', future),
    cookie('.youtube.com', 'EXPIRED', past),
  ].join('\n'));

  assert.match(filtered, /\tSID\tsecret/);
  assert.match(filtered, /\tHTTP_SID\tsecret/);
  assert.doesNotMatch(filtered, /UNRELATED|EXPIRED/);
});

test('rejects cookie files without an active YouTube session', () => {
  assert.throws(
    () => filterYoutubeCookies(cookie('.example.com', 'SID')),
    /no active YouTube cookies/i,
  );
});

test('imports a private filtered session and only injects it for YouTube', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'downroad-youtube-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'cookies.txt');
  const destination = path.join(dir, 'private', 'youtube-cookies.txt');
  fs.writeFileSync(source, [
    cookie('.youtube.com', 'SID'),
    cookie('.example.com', 'OTHER'),
  ].join('\n'));

  importYoutubeCookies(source, destination);

  assert.equal(hasYoutubeSession(destination), true);
  assert.deepEqual(youtubeCookieArgs('youtube', destination), ['--cookies', destination]);
  assert.deepEqual(youtubeCookieArgs('instagram', destination), []);
  assert.doesNotMatch(fs.readFileSync(destination, 'utf8'), /OTHER/);
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
});
