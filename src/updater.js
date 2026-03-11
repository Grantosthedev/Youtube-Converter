const https = require('https');
const fs = require('fs');
const { getYtdlpPath, getUserBinDir } = require('./utils');

const YTDLP_RELEASES_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const YTDLP_DOWNLOAD_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

const APP_REPO_API = 'https://api.github.com/repos/Grantosthedev/Youtube-Converter/releases/latest';

const MAX_REDIRECTS = 5;

function githubGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount >= MAX_REDIRECTS) {
      reject(new Error('Too many redirects'));
      return;
    }
    const req = https.get(url, {
      headers: {
        'User-Agent': 'YouTube-Clip-Downloader',
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 6000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        githubGet(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const follow = (u) => {
      if (redirects >= MAX_REDIRECTS) {
        reject(new Error('Too many redirects'));
        return;
      }
      https.get(u, { headers: { 'User-Agent': 'YouTube-Clip-Downloader' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.on('error', (err) => {
          file.close();
          reject(err);
        });
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
    execFile(ytdlpPath, ['--version'], { timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      resolve(stdout.trim());
    });
  });
}

async function updateYtdlp() {
  const userBinDir = getUserBinDir();
  fs.mkdirSync(userBinDir, { recursive: true });
  const destPath = require('path').join(userBinDir, 'yt-dlp_macos');
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
      try {
        fs.copyFileSync(backupPath, destPath);
        fs.unlinkSync(backupPath);
      } catch { /* backup restore failed too */ }
    }
    return { success: false, error: err.message };
  }
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function ensureYtdlpFresh(store) {
  try {
    if (store) {
      const lastCheck = store.get('lastYtdlpCheck');
      if (lastCheck && (Date.now() - lastCheck) < CHECK_INTERVAL_MS) {
        return { success: true, skipped: true };
      }
    }

    const current = await getCurrentYtdlpVersion();
    if (!current) {
      console.log('[updater] yt-dlp version unknown, attempting update...');
      return await updateYtdlp();
    }

    const latest = await getLatestYtdlpVersion();
    if (!latest) return { success: true, version: current, skipped: true };

    const currentClean = current.replace(/[^0-9.]/g, '');
    const latestClean = latest.replace(/[^0-9.]/g, '');

    if (isNewerVersion(latestClean, currentClean)) {
      console.log(`[updater] yt-dlp outdated (${current} → ${latest}), updating...`);
      const result = await updateYtdlp();
      if (result.success && store) store.set('lastYtdlpCheck', Date.now());
      return result;
    }

    if (store) store.set('lastYtdlpCheck', Date.now());
    return { success: true, version: current, skipped: true };
  } catch (err) {
    console.error('[updater] auto-update check failed:', err.message);
    return { success: false, error: err.message };
  }
}

function isNewerVersion(latest, current) {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function checkAppUpdate(currentVersion) {
  try {
    const release = await githubGet(APP_REPO_API);
    const latestVersion = release.tag_name.replace(/^v/, '').trim();
    if (isNewerVersion(latestVersion, currentVersion)) {
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
  ensureYtdlpFresh,
  checkAppUpdate,
};
