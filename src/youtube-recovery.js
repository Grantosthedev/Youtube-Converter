const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const {
  binaryExists,
  getPotProviderPath,
  getYtdlpPluginDir,
} = require('./utils');

const RECOVERABLE_CODES = new Set([
  'access_forbidden',
  'login_required',
  'po_token_required',
  'sabr_only',
]);

let providerProcess = null;
let providerBaseUrl = '';
let providerStartup = null;

function isYoutubeRecoveryError(errorOrDiagnosis) {
  return RECOVERABLE_CODES.has(errorOrDiagnosis?.code);
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function pingProvider(baseUrl, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${baseUrl}/ping`, { timeout: timeoutMs }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`PO-token provider health check returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(body);
        } catch {
          reject(new Error('PO-token provider returned an invalid health response'));
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('PO-token provider health check timed out')));
    request.once('error', reject);
  });
}

async function waitForProvider(baseUrl, proc, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (proc.downroadSpawnError) throw proc.downroadSpawnError;
    if (proc.exitCode !== null) {
      throw new Error(`PO-token provider exited during startup with code ${proc.exitCode}`);
    }
    try {
      return await pingProvider(baseUrl);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  throw lastError || new Error('PO-token provider did not become ready');
}

function recoveryArgs(baseUrl = providerBaseUrl) {
  const pluginDir = getYtdlpPluginDir();
  if (!baseUrl) return [];
  return [
    '--plugin-dirs', pluginDir,
    '--extractor-args', 'youtube:player_client=mweb',
    '--extractor-args', `youtubepot-bgutilhttp:base_url=${baseUrl}`,
  ];
}

async function ensureYoutubeRecovery() {
  if (providerStartup) return providerStartup;
  if (providerProcess?.exitCode === null && providerBaseUrl) {
    try {
      await pingProvider(providerBaseUrl);
      return recoveryArgs();
    } catch {
      stopYoutubeRecovery();
    }
  }

  providerStartup = (async () => {
    const executable = getPotProviderPath();
    const pluginDir = getYtdlpPluginDir();
    const pluginArchive = path.join(pluginDir, 'bgutil-ytdlp-pot-provider-rs.zip');
    if (!binaryExists(executable) || !fs.existsSync(pluginArchive)) {
      throw new Error('Automatic YouTube recovery is unavailable. Reinstall or update Downroad.');
    }

    const port = await findOpenPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const proc = spawn(executable, [
      'server',
      '--host', '127.0.0.1',
      '--port', String(port),
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    providerProcess = proc;
    providerBaseUrl = baseUrl;

    let stderr = '';
    proc.once('error', error => {
      proc.downroadSpawnError = error;
    });
    proc.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    proc.once('exit', code => {
      if (providerProcess === proc) {
        providerProcess = null;
        providerBaseUrl = '';
      }
      if (code && stderr.trim()) {
        console.warn('[youtube-recovery] provider stopped:', stderr.trim());
      }
    });

    try {
      const health = await waitForProvider(baseUrl, proc);
      console.log(`[youtube-recovery] provider ready: ${health.version || 'unknown version'}`);
      return recoveryArgs(baseUrl);
    } catch (error) {
      try { proc.kill('SIGTERM'); } catch {}
      throw error;
    }
  })().finally(() => {
    providerStartup = null;
  });

  return providerStartup;
}

function stopYoutubeRecovery() {
  const proc = providerProcess;
  providerProcess = null;
  providerBaseUrl = '';
  if (!proc || proc.exitCode !== null) return;
  try { proc.kill('SIGTERM'); } catch {}
  const timer = setTimeout(() => {
    if (proc.exitCode === null) {
      try { proc.kill('SIGKILL'); } catch {}
    }
  }, 2000);
  timer.unref();
}

module.exports = {
  ensureYoutubeRecovery,
  isYoutubeRecoveryError,
  pingProvider,
  recoveryArgs,
  stopYoutubeRecovery,
};
