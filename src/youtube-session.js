const fs = require('fs');
const path = require('path');

const YOUTUBE_COOKIE_DOMAIN = /(^|\.)youtube\.com$/i;

function parseCookieLine(line) {
  const normalized = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line;
  if (!normalized || normalized.startsWith('#')) return null;

  const fields = normalized.split('\t');
  if (fields.length < 7) return null;
  return {
    domain: fields[0],
    expires: Number(fields[4]) || 0,
    original: line,
  };
}

function filterYoutubeCookies(content, nowSeconds = Math.floor(Date.now() / 1000)) {
  const cookies = String(content || '')
    .split(/\r?\n/)
    .map(parseCookieLine)
    .filter(cookie => (
      cookie
      && YOUTUBE_COOKIE_DOMAIN.test(cookie.domain.replace(/^\./, ''))
      && (!cookie.expires || cookie.expires > nowSeconds)
    ));

  if (cookies.length === 0) {
    throw new Error('That file has no active YouTube cookies. Export fresh youtube.com cookies and try again.');
  }

  return [
    '# Netscape HTTP Cookie File',
    '# Downroad stores only youtube.com cookies from the selected file.',
    ...cookies.map(cookie => cookie.original),
    '',
  ].join('\n');
}

function importYoutubeCookies(sourcePath, destinationPath) {
  const filtered = filterYoutubeCookies(fs.readFileSync(sourcePath, 'utf8'));
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const tempPath = `${destinationPath}.tmp-${process.pid}`;

  try {
    fs.writeFileSync(tempPath, filtered, { mode: 0o600 });
    fs.renameSync(tempPath, destinationPath);
    fs.chmodSync(destinationPath, 0o600);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

function hasYoutubeSession(cookiePath) {
  try {
    filterYoutubeCookies(fs.readFileSync(cookiePath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

function clearYoutubeSession(cookiePath) {
  try {
    fs.unlinkSync(cookiePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function youtubeCookieArgs(platform, cookiePath) {
  if (platform !== 'youtube' || !cookiePath || !hasYoutubeSession(cookiePath)) return [];
  return ['--cookies', cookiePath];
}

module.exports = {
  clearYoutubeSession,
  filterYoutubeCookies,
  hasYoutubeSession,
  importYoutubeCookies,
  parseCookieLine,
  youtubeCookieArgs,
};
