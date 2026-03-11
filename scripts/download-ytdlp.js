const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp_macos');
const YTDLP_GZ_PATH = path.join(BIN_DIR, 'yt-dlp_macos.gz');
const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

function followRedirects(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'YouTube-Clip-Downloader' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

function prepBinary(binPath) {
  fs.chmodSync(binPath, 0o755);
  try {
    execFileSync('/usr/bin/xattr', ['-c', binPath], { timeout: 3000 });
  } catch {}
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', binPath], { timeout: 5000 });
  } catch {}
}

function createGzBundle(srcPath, destPath) {
  const raw = fs.readFileSync(srcPath);
  const compressed = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(destPath, compressed);
  console.log(`Created ${path.basename(destPath)} (${(compressed.length / 1024 / 1024).toFixed(1)} MB compressed from ${(raw.length / 1024 / 1024).toFixed(1)} MB)`);
}

async function download() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log('yt-dlp binary already exists, preparing...');
    prepBinary(YTDLP_PATH);
    createGzBundle(YTDLP_PATH, YTDLP_GZ_PATH);
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log('Downloading yt-dlp macOS binary...');

  try {
    const res = await followRedirects(DOWNLOAD_URL);
    const file = fs.createWriteStream(YTDLP_PATH);

    await new Promise((resolve, reject) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        prepBinary(YTDLP_PATH);
        createGzBundle(YTDLP_PATH, YTDLP_GZ_PATH);
        console.log('yt-dlp downloaded successfully.');
        resolve();
      });
      file.on('error', reject);
    });
  } catch (err) {
    console.error('Failed to download yt-dlp:', err.message);
    console.error('You can manually download it from: https://github.com/yt-dlp/yt-dlp/releases');
    process.exit(1);
  }
}

download();
