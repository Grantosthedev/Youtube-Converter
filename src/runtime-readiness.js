const crypto = require('crypto');
const fs = require('fs');
const { execFile } = require('child_process');
const { getDenoPath, getRuntimeManifestPath } = require('./utils');

function runVersion(binPath) {
  return new Promise((resolve, reject) => {
    execFile(binPath, ['--version'], { timeout: 10000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function verifyCodeSignature(binPath) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', binPath], { timeout: 10000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function validateDenoRuntime(options = {}) {
  const denoPath = options.denoPath || getDenoPath();
  const manifestPath = options.manifestPath || getRuntimeManifestPath();
  const architecture = options.architecture || process.arch;
  const execute = options.execute || runVersion;
  const packaged = options.packaged === true;
  const verifySignature = options.verifySignature || verifyCodeSignature;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.deno?.version || !/^[a-f0-9]{64}$/i.test(manifest.deno.sha256 || '')) {
    throw new Error('Deno runtime manifest is invalid');
  }
  if (manifest.architecture !== architecture) {
    throw new Error(`Deno runtime architecture mismatch: expected ${architecture}`);
  }

  fs.accessSync(denoPath, fs.constants.R_OK | fs.constants.X_OK);
  if (packaged) {
    await verifySignature(denoPath);
  } else {
    const actualSha256 = crypto.createHash('sha256').update(fs.readFileSync(denoPath)).digest('hex');
    if (actualSha256 !== manifest.deno.sha256.toLowerCase()) {
      throw new Error('Deno runtime checksum verification failed');
    }
  }

  const versionOutput = await execute(denoPath);
  if (!String(versionOutput).startsWith(`deno ${manifest.deno.version}`)) {
    throw new Error(`Deno runtime version mismatch: expected ${manifest.deno.version}`);
  }
  return { success: true, version: manifest.deno.version, architecture };
}

module.exports = { validateDenoRuntime };
