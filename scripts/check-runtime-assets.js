const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const binDir = path.join(root, 'bin');
const manifest = JSON.parse(fs.readFileSync(path.join(binDir, 'runtime-manifest.json'), 'utf8'));
const ytdlpPath = path.join(binDir, 'yt-dlp_macos');
const ytdlpGzPath = path.join(binDir, 'yt-dlp_macos.gz');
const denoPath = path.join(binDir, 'deno');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function requireExecutable(filePath) {
  fs.accessSync(filePath, fs.constants.R_OK | fs.constants.X_OK);
}

const bundledYtdlp = zlib.gunzipSync(fs.readFileSync(ytdlpGzPath));
if (sha256(bundledYtdlp) !== manifest.ytdlp.sha256) {
  throw new Error('Bundled yt-dlp does not match runtime-manifest.json');
}
if (sha256(fs.readFileSync(denoPath)) !== manifest.deno.sha256) {
  throw new Error('Bundled Deno does not match runtime-manifest.json');
}

requireExecutable(ytdlpPath);
requireExecutable(denoPath);

const denoFile = execFileSync('/usr/bin/file', [denoPath], { encoding: 'utf8' });
const expectedArchitecture = manifest.architecture === 'arm64' ? 'arm64' : 'x86_64';
if (!denoFile.includes('Mach-O') || !denoFile.includes(expectedArchitecture)) {
  throw new Error(`Bundled Deno is not a macOS ${manifest.architecture} executable`);
}

if (process.platform === 'darwin') {
  const ytdlpVersion = execFileSync(ytdlpPath, ['--version'], { encoding: 'utf8', timeout: 30000 }).trim();
  if (ytdlpVersion !== manifest.ytdlp.version) throw new Error('Bundled yt-dlp version is incorrect');

  const denoVersion = execFileSync(denoPath, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (!denoVersion.startsWith(`deno ${manifest.deno.version}`)) {
    throw new Error('Bundled Deno version is incorrect');
  }
}

console.log(`Runtime assets verified: yt-dlp ${manifest.ytdlp.version}, Deno ${manifest.deno.version}`);
