const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  YTDLP_RELEASE_API,
  isSupportedYtdlpVersion,
  releaseAsset,
} = require('../src/ytdlp-release');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp_macos');
const YTDLP_GZ_PATH = path.join(BIN_DIR, 'yt-dlp_macos.gz');
const DENO_PATH = path.join(BIN_DIR, 'deno');
const RUNTIME_MANIFEST_PATH = path.join(BIN_DIR, 'runtime-manifest.json');
const DENO_RELEASE_API = 'https://api.github.com/repos/denoland/deno/releases/latest';
const TARGET_ARCH = process.env.DOWNROAD_TARGET_ARCH || process.arch;

function getBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects >= 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    https.get(url, { headers: { 'User-Agent': 'Downroad' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        getBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getJson(url) {
  return JSON.parse((await getBuffer(url)).toString('utf8'));
}

async function downloadVerified(url, expectedSha256, destPath) {
  const data = await getBuffer(url);
  const actual = crypto.createHash('sha256').update(data).digest('hex');
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum verification failed for ${path.basename(destPath)}`);
  }
  const tempPath = `${destPath}.download`;
  fs.writeFileSync(tempPath, data, { mode: 0o755 });
  fs.renameSync(tempPath, destPath);
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

function denoAssetName() {
  if (TARGET_ARCH === 'arm64') return 'deno-aarch64-apple-darwin.zip';
  if (TARGET_ARCH === 'x64') return 'deno-x86_64-apple-darwin.zip';
  throw new Error(`Unsupported macOS architecture for Deno: ${TARGET_ARCH}`);
}

async function installDeno() {
  const release = await getJson(DENO_RELEASE_API);
  const assetName = denoAssetName();
  const asset = release.assets?.find(item => item.name === assetName);
  const digest = String(asset?.digest || '');
  if (!asset?.browser_download_url || !/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`Deno release is missing a verified ${assetName}`);
  }

  const zipPath = path.join(BIN_DIR, assetName);
  console.log(`Downloading Deno ${release.tag_name} for macOS ${TARGET_ARCH}...`);
  await downloadVerified(asset.browser_download_url, digest.slice(7), zipPath);
  try {
    execFileSync('/usr/bin/unzip', ['-jo', zipPath, 'deno', '-d', BIN_DIR], { stdio: 'inherit' });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
  }
  prepBinary(DENO_PATH);
  return {
    version: String(release.tag_name || '').replace(/^v/, ''),
    asset: assetName,
    sha256: digest.slice(7),
  };
}

async function download() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  try {
    const ytdlpRelease = await getJson(YTDLP_RELEASE_API);
    const ytdlpAsset = releaseAsset(ytdlpRelease);
    if (!isSupportedYtdlpVersion(ytdlpAsset.version)) {
      throw new Error(`yt-dlp nightly ${ytdlpAsset.version} is older than the required YouTube fix`);
    }
    console.log(`Downloading yt-dlp ${ytdlpAsset.version} (${ytdlpAsset.sha256.slice(0, 12)}...)...`);
    await downloadVerified(ytdlpAsset.downloadUrl, ytdlpAsset.sha256, YTDLP_PATH);
    prepBinary(YTDLP_PATH);
    createGzBundle(YTDLP_PATH, YTDLP_GZ_PATH);

    const deno = await installDeno();
    fs.writeFileSync(RUNTIME_MANIFEST_PATH, `${JSON.stringify({
      ytdlp: {
        channel: 'nightly',
        version: ytdlpAsset.version,
        sha256: ytdlpAsset.sha256,
      },
      deno,
      architecture: TARGET_ARCH,
    }, null, 2)}\n`);
    console.log('Verified yt-dlp and Deno runtime assets are ready.');
  } catch (err) {
    console.error('Failed to prepare download engine assets:', err.message);
    process.exit(1);
  }
}

download();
