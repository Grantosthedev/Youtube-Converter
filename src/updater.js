const https = require('https');
const fs = require('fs');
const { getYtdlpPath } = require('./utils');

const YTDLP_RELEASES_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const YTDLP_DOWNLOAD_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

const APP_REPO_API = 'https://api.github.com/repos/Grantosthedev/Youtube-Converter/releases/latest';

function githubGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'YouTube-Clip-Downloader',
        Accept: 'application/vnd.github.v3+json',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        githubGet(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'YouTube-Clip-Downloader' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.chmodSync(destPath, 0o755);
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function getLatestYtdlpVersion() {
  try {
    const release = await githubGet(YTDLP_RELEASES_URL);
    return release.tag_name;
  } catch {
    return null;
  }
}

async function getCurrentYtdlpVersion() {
  const { execFile } = require('child_process');
  const ytdlpPath = getYtdlpPath();
  return new Promise((resolve) => {
    execFile(ytdlpPath, ['--version'], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      resolve(stdout.trim());
    });
  });
}

async function updateYtdlp() {
  const destPath = getYtdlpPath();
  const backupPath = destPath + '.backup';

  try {
    if (fs.existsSync(destPath)) {
      fs.copyFileSync(destPath, backupPath);
    }
    await downloadFile(YTDLP_DOWNLOAD_BASE, destPath);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    const version = await getCurrentYtdlpVersion();
    return { success: true, version };
  } catch (err) {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, destPath);
      fs.unlinkSync(backupPath);
    }
    return { success: false, error: err.message };
  }
}

async function checkAppUpdate(currentVersion) {
  try {
    const release = await githubGet(APP_REPO_API);
    const latestVersion = release.tag_name.replace(/^v/, '');
    if (latestVersion !== currentVersion) {
      return {
        available: true,
        version: latestVersion,
        url: release.html_url,
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

module.exports = {
  getLatestYtdlpVersion,
  getCurrentYtdlpVersion,
  updateYtdlp,
  checkAppUpdate,
};
