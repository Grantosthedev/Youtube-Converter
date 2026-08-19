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
const DENO_VERSION = '2.9.5';
const DENO_ASSETS = {
  arm64: {
    name: 'deno-aarch64-apple-darwin.zip',
    archiveSha256: 'b796aadd131f6930560c1ee040cf0d6f53933fbb987464e9ff46bd7ea4830615',
    binarySha256: 'b5bd08edab254d42d7b05aa5b6cb4c9b8d4dede4975aff76951ce2cce18866fa',
    fileArchitecture: 'arm64',
  },
  x64: {
    name: 'deno-x86_64-apple-darwin.zip',
    archiveSha256: 'c1b8b89a81e91b2a8b3f96def3195d08cfe3a105651da7908d53061f7140510d',
    binarySha256: 'befc4fee79127584c0f5c9f76ca6bb73c8e6ff523c01acd52e9c5db1968a09cb',
    fileArchitecture: 'x86_64',
  },
};
const TARGET_ARCH = process.env.DOWNROAD_TARGET_ARCH || process.arch;

function getBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects >= 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    const headers = { 'User-Agent': 'Downroad' };
    if (process.env.GITHUB_TOKEN && new URL(url).hostname === 'api.github.com') {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      headers.Accept = 'application/vnd.github+json';
    }
    https.get(url, { headers }, (res) => {
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

function prepBinary(binPath, { requireCodeSign = false } = {}) {
  fs.chmodSync(binPath, 0o755);
  try {
    execFileSync('/usr/bin/xattr', ['-c', binPath], { timeout: 3000 });
  } catch {}
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', binPath], { timeout: 5000 });
  } catch (error) {
    if (requireCodeSign) throw error;
  }
}

function createGzBundle(srcPath, destPath) {
  const raw = fs.readFileSync(srcPath);
  const compressed = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(destPath, compressed);
  console.log(`Created ${path.basename(destPath)} (${(compressed.length / 1024 / 1024).toFixed(1)} MB compressed from ${(raw.length / 1024 / 1024).toFixed(1)} MB)`);
}

async function installDeno() {
  const asset = DENO_ASSETS[TARGET_ARCH];
  if (!asset) throw new Error(`Unsupported macOS architecture for Deno: ${TARGET_ARCH}`);

  const zipPath = path.join(BIN_DIR, asset.name);
  const downloadUrl = `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${asset.name}`;
  console.log(`Downloading pinned Deno v${DENO_VERSION} for macOS ${TARGET_ARCH}...`);
  await downloadVerified(downloadUrl, asset.archiveSha256, zipPath);
  try {
    execFileSync('/usr/bin/unzip', ['-jo', zipPath, 'deno', '-d', BIN_DIR], { stdio: 'inherit' });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
  }
  const binarySha256 = crypto.createHash('sha256').update(fs.readFileSync(DENO_PATH)).digest('hex');
  if (binarySha256 !== asset.binarySha256) throw new Error('Extracted Deno checksum verification failed');

  const fileOutput = execFileSync('/usr/bin/file', [DENO_PATH], { encoding: 'utf8' });
  if (!fileOutput.includes('Mach-O') || !fileOutput.includes(asset.fileArchitecture)) {
    throw new Error(`Deno architecture validation failed for ${TARGET_ARCH}`);
  }
  prepBinary(DENO_PATH, { requireCodeSign: process.platform === 'darwin' });
  if (process.platform === 'darwin') {
    const versionOutput = execFileSync(DENO_PATH, ['--version'], { encoding: 'utf8', timeout: 10000 });
    if (!versionOutput.startsWith(`deno ${DENO_VERSION}`)) {
      throw new Error(`Deno runtime validation returned an unexpected version: ${versionOutput.trim()}`);
    }
  }
  return {
    version: DENO_VERSION,
    asset: asset.name,
    archiveSha256: asset.archiveSha256,
    upstreamSha256: asset.binarySha256,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(DENO_PATH)).digest('hex'),
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
    const bundledYtdlpSha256 = crypto.createHash('sha256').update(fs.readFileSync(YTDLP_PATH)).digest('hex');
    createGzBundle(YTDLP_PATH, YTDLP_GZ_PATH);

    const deno = await installDeno();
    fs.writeFileSync(RUNTIME_MANIFEST_PATH, `${JSON.stringify({
      ytdlp: {
        channel: 'nightly',
        version: ytdlpAsset.version,
        upstreamSha256: ytdlpAsset.sha256,
        sha256: bundledYtdlpSha256,
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
