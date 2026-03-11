const https = require('https');
const fs = require('fs');
const zlib = require('zlib');
const { execFile } = require('child_process');
const path = require('path');
const { getYtdlpPath, getUserBinDir, getBundledYtdlpPath } = require('./utils');

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

function execPromise(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 5000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
  });
}

async function stripQuarantine(filePath) {
  try {
    await execPromise('/usr/bin/xattr', ['-d', 'com.apple.quarantine', filePath]);
    console.log('[updater] Removed quarantine attribute');
  } catch (err) {
    console.log('[updater] xattr -d quarantine:', err.message || 'no attribute');
  }

  try {
    await execPromise('/usr/bin/xattr', ['-c', filePath]);
    console.log('[updater] Cleared all extended attributes');
  } catch (err) {
    console.log('[updater] xattr -c:', err.message);
  }

  try {
    await execPromise('/usr/bin/codesign', ['--force', '--sign', '-', filePath]);
    console.log('[updater] Ad-hoc signed binary');
  } catch (err) {
    console.log('[updater] codesign ad-hoc sign:', err.message);
  }
}

function testBinary(binPath) {
  return new Promise((resolve) => {
    execFile(binPath, ['--version'], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[updater] Binary test failed:', err.message);
        if (err.code) console.error('[updater]   code:', err.code);
        if (err.signal) console.error('[updater]   signal:', err.signal);
        if (stderr) console.error('[updater]   stderr:', stderr.substring(0, 500));
        resolve(null);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getCurrentYtdlpVersion() {
  const ytdlpPath = getYtdlpPath();
  return testBinary(ytdlpPath);
}

async function initializeYtdlp() {
  const userBinDir = getUserBinDir();
  fs.mkdirSync(userBinDir, { recursive: true });
  const destPath = path.join(userBinDir, 'yt-dlp_macos');
  const bundledGzPath = getBundledYtdlpPath();

  let hasBundled = false;
  try {
    fs.accessSync(bundledGzPath, fs.constants.R_OK);
    hasBundled = true;
  } catch {}

  if (!hasBundled) {
    console.log('[updater] No bundled yt-dlp found, falling back to download');
    return updateYtdlp();
  }

  try {
    console.log('[updater] Decompressing bundled yt-dlp to userData...');
    const compressed = fs.readFileSync(bundledGzPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(destPath, decompressed);
    fs.chmodSync(destPath, 0o755);
    await stripQuarantine(destPath);

    const version = await testBinary(destPath);
    if (version) {
      console.log(`[updater] Bundled yt-dlp ready: v${version}`);
      return { success: true, version };
    }

    console.log('[updater] Bundled binary failed validation, trying download');
    return updateYtdlp();
  } catch (err) {
    console.error('[updater] Failed to initialize from bundle:', err.message);
    return updateYtdlp();
  }
}

async function updateYtdlp() {
  const userBinDir = getUserBinDir();
  fs.mkdirSync(userBinDir, { recursive: true });
  const destPath = path.join(userBinDir, 'yt-dlp_macos');
  const backupPath = destPath + '.backup';

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt === 1 && fs.existsSync(destPath)) {
        fs.copyFileSync(destPath, backupPath);
      }

      console.log(`[updater] Download attempt ${attempt}/${MAX_ATTEMPTS}`);
      await downloadFile(YTDLP_DOWNLOAD_BASE, destPath);

      const stat = fs.statSync(destPath);
      console.log(`[updater] Downloaded file size: ${stat.size} bytes`);
      if (stat.size < 1000) {
        const content = fs.readFileSync(destPath, 'utf8').substring(0, 200);
        console.error('[updater] File too small, contents:', content);
        throw new Error('Downloaded file is too small – may be an error page');
      }

      fs.chmodSync(destPath, 0o755);
      await stripQuarantine(destPath);

      const version = await testBinary(destPath);
      if (version) {
        console.log(`[updater] Binary validated: v${version}`);
        try { fs.unlinkSync(backupPath); } catch {}
        return { success: true, version };
      }

      console.log(`[updater] Binary validation failed on attempt ${attempt}`);
      if (attempt < MAX_ATTEMPTS) continue;

      try { fs.unlinkSync(destPath); } catch {}
      if (fs.existsSync(backupPath)) {
        try { fs.unlinkSync(backupPath); } catch {}
      }
      return {
        success: false,
        error: 'yt-dlp binary could not be executed after downloading. '
          + 'macOS may be blocking it. Try opening System Settings → Privacy & Security '
          + 'and clicking "Allow Anyway", then restart the app.',
      };
    } catch (err) {
      console.error(`[updater] Attempt ${attempt} error:`, err.message);
      if (attempt < MAX_ATTEMPTS) continue;

      if (fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(backupPath, destPath);
          fs.unlinkSync(backupPath);
        } catch { /* backup restore failed too */ }
      }
      return { success: false, error: err.message };
    }
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
  initializeYtdlp,
  updateYtdlp,
  ensureYtdlpFresh,
  checkAppUpdate,
};
