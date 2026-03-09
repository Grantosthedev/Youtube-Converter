const https = require('https');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp_macos');
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

async function download() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log('yt-dlp binary already exists, skipping download.');
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
        fs.chmodSync(YTDLP_PATH, 0o755);
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
