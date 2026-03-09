const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function isValidYouTubeURL(url) {
  return YOUTUBE_URL_REGEX.test(url.trim());
}

function extractVideoId(url) {
  const match = url.trim().match(YOUTUBE_URL_REGEX);
  return match ? match[1] : null;
}

function normalizeYouTubeURL(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return url;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function sanitizeFilename(name) {
  return name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.join(__dirname, '..', ...segments);
}

function getYtdlpPath() {
  return getResourcePath('bin', 'yt-dlp_macos');
}

function getFfmpegPath() {
  const staticPath = require('ffmpeg-static');
  if (app.isPackaged) {
    return staticPath.replace('app.asar', 'app.asar.unpacked');
  }
  return staticPath;
}

function binaryExists(binPath) {
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '00:00:00') return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function checkDiskSpace(dirPath) {
  try {
    const stats = await fs.promises.statfs(dirPath);
    return stats.bavail * stats.bsize;
  } catch {
    return Infinity;
  }
}

function pathExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

module.exports = {
  isValidYouTubeURL,
  extractVideoId,
  normalizeYouTubeURL,
  sanitizeFilename,
  getYtdlpPath,
  getFfmpegPath,
  getResourcePath,
  binaryExists,
  parseTimeToSeconds,
  formatSeconds,
  checkDiskSpace,
  pathExists,
};
