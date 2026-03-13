const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { getYtdlpPath, getFfmpegPath, sanitizeFilename } = require('./utils');
const path = require('path');

// Remove stale PyInstaller temp dirs (_MEI*) that accumulate when yt-dlp is
// killed mid-run or the disk fills up. Each one is ~45 MB so even a handful
// can cause "Could not create temporary directory!" errors on low-disk systems.
function cleanStaleYtdlpTemp() {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (!entry.startsWith('_MEI')) continue;
      const fullPath = path.join(tmpDir, entry);
      try {
        // Only remove dirs that haven't been touched in the last 10 minutes
        const stat = fs.statSync(fullPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 10 * 60 * 1000) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch { /* skip if we can't stat or remove */ }
    }
  } catch { /* non-fatal */ }
}

const ERROR_MAP = [
  { pattern: /Could not create temp|Could not create temporary/i, message: 'Your disk is almost full. Free up some space and try again.' },
  { pattern: /private video/i, message: 'This video is private. You need access to download it.' },
  { pattern: /age.?restrict|age.?gate|sign in to confirm your age/i, message: 'This video is age-restricted. It cannot be downloaded without authentication.' },
  { pattern: /not available in your country/i, message: 'This video is not available in your region.' },
  { pattern: /login.*page|locked behind/i, message: 'This content requires login. Try updating yt-dlp, or the content may be private.' },
  { pattern: /Unsupported URL/i, message: 'This URL type isn\'t supported yet. Downroad handles videos and audio -- image-only posts aren\'t supported via this method.' },
  { pattern: /unable to extract/i, message: 'Couldn\'t extract content. The post may be private, deleted, or require login. Try updating yt-dlp in Settings.' },
  { pattern: /HTTP Error 429/i, message: 'Rate-limiting detected. Wait a minute and try again.' },
  { pattern: /HTTP Error 403|Forbidden/i, message: 'Access denied. The platform is rate-limiting requests. Wait a moment and try again.' },
  { pattern: /urlopen error|timed out|(?:network|connection).*(?:error|refused|reset)/i, message: 'Network error. Check your internet connection and try again.' },
  { pattern: /video.*(?:unavailable|removed|deleted|not exist)/i, message: 'This video is unavailable or has been removed.' },
  { pattern: /is not a valid URL|no video/i, message: 'Please enter a valid URL.' },
  { pattern: /nsig extraction|signature extraction|player.*error|cipher/i, message: 'yt-dlp is outdated and can\'t decrypt this video. Hit "Update" in Settings to fix it.' },
  { pattern: /ExtractorError|extractor.*error/i, message: 'yt-dlp can\'t process this URL. Try updating yt-dlp in Settings.' },
  { pattern: /certificate verify failed|SSL/i, message: 'SSL certificate error. Check your network or try disabling VPN/proxy.' },
  { pattern: /Incomplete data|incomplete read/i, message: 'Download was interrupted. Check your connection and try again.' },
  { pattern: /content.*not available|currently unavailable/i, message: 'This content is currently unavailable on the platform.' },
  { pattern: /unable to download webpage/i, message: 'Couldn\'t reach the platform. Check your internet or try updating yt-dlp in Settings.' },
  { pattern: /Got error.*Traceback|ModuleNotFoundError|ImportError/i, message: 'yt-dlp binary is corrupted or incompatible. Try updating yt-dlp in Settings.' },
];

function mapError(stderr) {
  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(stderr)) return message;
  }
  const errorLine = stderr.split('\n').find(l => l.includes('ERROR:'));
  if (errorLine) return errorLine.replace('ERROR: ', '').trim();

  if (stderr.trim()) {
    console.error('[yt-dlp] raw stderr:', stderr.trim().slice(-500));
    const lastMeaningful = stderr.trim().split('\n').filter(l => l.trim()).slice(-2).join(' ').slice(0, 150);
    if (lastMeaningful) {
      return `yt-dlp error: ${lastMeaningful}. Try updating yt-dlp in Settings.`;
    }
  }

  return 'An unexpected error occurred. Try updating yt-dlp in Settings, or check your connection.';
}

function fetchVideoInfo(url, platform) {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtdlpPath();
    const ffmpeg = getFfmpegPath();

    const args = [
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--ffmpeg-location', path.dirname(ffmpeg),
      url,
    ];

    cleanStaleYtdlpTemp();
    const timeout = platform === 'instagram' ? 60000 : platform === 'tiktok' ? 45000 : 30000;
    const proc = spawn(ytdlp, args);
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000);
    }, timeout);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error('Request timed out. Check your connection and try again.'));
        return;
      }
      if (code !== 0) {
        reject(new Error(mapError(stderr)));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const formats = info.formats || [];
        let estimatedFileSize = 0;
        for (let i = formats.length - 1; i >= 0; i--) {
          const f = formats[i];
          if (f.filesize || f.filesize_approx) {
            estimatedFileSize = f.filesize || f.filesize_approx;
            break;
          }
        }

        resolve({
          id: info.id,
          title: info.title || 'Unknown Title',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '',
          isLive: info.is_live || false,
          formats: extractAvailableQualities(formats),
          uploader: info.creator || info.uploader || info.channel || '',
          uploadDate: info.upload_date || '',
          description: (info.description || '').slice(0, 300),
          viewCount: info.view_count ?? null,
          likeCount: info.like_count ?? null,
          channel: info.channel || '',
          channelUrl: info.channel_url || '',
          webpageUrl: info.webpage_url || '',
          categories: info.categories || [],
          tags: (info.tags || []).slice(0, 10),
          license: info.license || '',
          platform: platform || 'youtube',
          mediaType: (info.duration === 0 || info.duration === null) && platform !== 'youtube' ? 'image' : 'video',
          estimatedFileSize,
        });
      } catch (e) {
        reject(new Error('Failed to parse video information.'));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to run yt-dlp: ${err.message}`));
    });
  });
}

function extractAvailableQualities(formats) {
  const heightSet = new Set();
  for (const f of formats) {
    if (f.height && f.vcodec !== 'none') heightSet.add(f.height);
  }
  const sorted = [...heightSet].sort((a, b) => b - a);
  const seen = new Set();
  const result = [];
  for (const h of sorted) {
    let label;
    if (h >= 2160) label = '4K';
    else if (h >= 1440) label = '1440p';
    else if (h >= 1080) label = '1080p';
    else if (h >= 720) label = '720p';
    else if (h >= 480) label = '480p';
    else label = `${h}p`;
    if (!seen.has(label)) {
      seen.add(label);
      result.push({ label, height: h });
    }
  }
  return result;
}

function buildDownloadArgs({ url, quality, startTime, endTime, outputPath, title, ffmpegDir, platform }) {
  // When no title is provided (instant download), let yt-dlp resolve the filename from metadata
  const safeName = title ? sanitizeFilename(title) : '';
  const outputTemplate = safeName ? `${safeName}.%(ext)s` : '%(title)s.%(ext)s';
  const isYouTube = !platform || platform === 'youtube';
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--newline',
    '--ffmpeg-location', ffmpegDir,
    '--concurrent-fragments', '4',
    '--retries', '5',
    '--fragment-retries', '5',
    '--buffer-size', '64K',
  ];

  if (quality === 'audio') {
    args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    args.push('-x', '--audio-format', 'm4a', '--audio-quality', '0');
    args.push('-o', path.join(outputPath, outputTemplate));
  } else if (isYouTube) {
    const isNumericHeight = /^\d+$/.test(quality);
    if (isNumericHeight) {
      const h = quality;
      args.push(
        '-f',
        `bestvideo[height=${h}]+bestaudio[acodec^=mp4a]/bestvideo[height=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio[acodec^=mp4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
        '--merge-output-format', 'mp4',
      );
    } else {
      args.push(
        '-f',
        'bestvideo+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
      );
    }
    // Sort by resolution first, then prefer H.264 video and AAC audio for reliability
    args.push('-S', 'res,vcodec:avc,acodec:mp4a');
    args.push('-o', path.join(outputPath, outputTemplate));
  } else if (platform === 'instagram') {
    args.push(
      '-f',
      'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best',
    );
    args.push('--merge-output-format', 'mp4');
    args.push('-o', path.join(outputPath, outputTemplate));
  } else {
    args.push(
      '-f',
      'bestvideo+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4',
    );
    args.push('-o', path.join(outputPath, outputTemplate));
  }

  if (isYouTube) {
    const hasStart = startTime && startTime !== '00:00:00';
    const hasEnd = endTime && endTime !== '00:00:00';
    if (hasStart || hasEnd) {
      const start = startTime || '00:00:00';
      const end = endTime || '';
      if (end) {
        args.push('--download-sections', `*${start}-${end}`);
      } else {
        args.push('--download-sections', `*${start}-inf`);
      }
    }
  }

  args.push(url);
  return args;
}

function parseOutputLine(line, state, onProgress) {
  const trimmed = line.trim();
  if (!trimmed) return;

  const destMatch = trimmed.match(/Destination:\s*(.+)/);
  if (destMatch) {
    state.lastFile = destMatch[1];
    return;
  }

  const mergeMatch = trimmed.match(/Merging formats into "(.+)"/);
  if (mergeMatch) {
    state.lastFile = mergeMatch[1];
    state.lastPercent = 99.5;
    onProgress({ percent: 99.5, speed: '', eta: '', status: 'merging' });
    return;
  }

  if (trimmed.includes('has already been downloaded')) {
    state.lastFile = trimmed.replace('[download]', '').replace('has already been downloaded', '').trim();
    state.lastPercent = 100;
    onProgress({ percent: 100, speed: '', eta: '' });
    return;
  }

  if (/^\[ExtractAudio\]|^\[FixupM4a\]|^\[ffmpeg\] Fixing/.test(trimmed)) {
    state.lastPercent = 99.5;
    onProgress({ percent: 99.5, speed: '', eta: '', status: 'extracting_audio' });
    return;
  }

  if (/^\[Fixup\]|^\[MoveFiles\]|^\[FixupTimestamp\]/.test(trimmed)) {
    state.lastPercent = 99.5;
    onProgress({ percent: 99.5, speed: '', eta: '', status: 'still_working' });
    return;
  }

  const percentMatch = trimmed.match(/([\d.]+)%/);
  if (percentMatch) {
    const percent = parseFloat(percentMatch[1]);
    state.lastPercent = percent;
    const speedMatch = trimmed.match(/at\s+([\d.]+\S*\/s)/);
    const etaMatch = trimmed.match(/ETA\s+(\d+:\d+)/);
    onProgress({
      percent: Math.min(percent, 100),
      speed: speedMatch ? speedMatch[1] : '',
      eta: etaMatch ? etaMatch[1] : '',
    });
  }
}

function parseDurationSecs(probeOutput) {
  const m = probeOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
}

function trackFfmpegProgress(proc, durationSecs, onProgress, statusKey) {
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (timeMatch && durationSecs > 0) {
      const cur = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
      const pct = Math.min(Math.round((cur / durationSecs) * 100), 99);
      onProgress({ percent: 99.5, speed: '', eta: '', status: statusKey, convertPercent: pct });
    }
  });
}

function ensureMacCompatible(filePath, ffmpegPath, onProgress) {
  return new Promise((resolve) => {
    if (!filePath || !filePath.endsWith('.mp4')) {
      resolve(filePath);
      return;
    }

    const probe = spawn(ffmpegPath, ['-i', filePath]);
    let probeOutput = '';
    probe.stderr.on('data', (d) => { probeOutput += d.toString(); });

    const probeTimer = setTimeout(() => {
      try { probe.kill('SIGKILL'); } catch {}
    }, 10000);

    probe.on('close', () => {
      clearTimeout(probeTimer);
      const hasNonCompatible = /Video:.*(?:vp[89]|av01|av1)/i.test(probeOutput);
      const hasCompatible = /Video:.*(?:h264|avc|hevc|h265)/i.test(probeOutput);

      if (!hasNonCompatible || hasCompatible) {
        resolve(filePath);
        return;
      }

      const durationSecs = parseDurationSecs(probeOutput);
      onProgress({ percent: 99.5, speed: '', eta: '', status: 'converting_mac', convertPercent: 0 });

      const tmpPath = filePath.replace(/\.mp4$/, '.compat.tmp.mp4');

      const hwEncode = spawn(ffmpegPath, [
        '-i', filePath,
        '-c:v', 'hevc_videotoolbox',
        '-q:v', '55',
        '-tag:v', 'hvc1',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        '-y',
        tmpPath,
      ]);

      trackFfmpegProgress(hwEncode, durationSecs, onProgress, 'converting_mac');

      let hwFailed = false;

      hwEncode.on('close', (hwCode) => {
        if (hwFailed) return;
        if (hwCode === 0) {
          try {
            fs.unlinkSync(filePath);
            fs.renameSync(tmpPath, filePath);
          } catch {}
          resolve(filePath);
          return;
        }

        try { fs.unlinkSync(tmpPath); } catch {}
        softwareEncode(filePath, ffmpegPath, tmpPath, durationSecs, onProgress, resolve);
      });

      hwEncode.on('error', () => {
        hwFailed = true;
        softwareEncode(filePath, ffmpegPath, tmpPath, durationSecs, onProgress, resolve);
      });
    });

    probe.on('error', () => {
      clearTimeout(probeTimer);
      resolve(filePath);
    });
  });
}

function softwareEncode(filePath, ffmpegPath, tmpPath, durationSecs, onProgress, resolve) {
  onProgress({ percent: 99.5, speed: '', eta: '', status: 'converting_sw', convertPercent: 0 });
  const swEncode = spawn(ffmpegPath, [
    '-i', filePath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-y',
    tmpPath,
  ]);

  trackFfmpegProgress(swEncode, durationSecs, onProgress, 'converting_sw');

  swEncode.on('close', (code) => {
    if (code === 0) {
      try {
        fs.unlinkSync(filePath);
        fs.renameSync(tmpPath, filePath);
      } catch { /* keep original if rename fails */ }
    } else {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
    resolve(filePath);
  });

  swEncode.on('error', () => resolve(filePath));
}

function ensureAacAudio(filePath, ffmpegPath, onProgress) {
  return new Promise((resolve) => {
    if (!filePath || !filePath.endsWith('.mp4')) {
      resolve(filePath);
      return;
    }

    const probe = spawn(ffmpegPath, ['-i', filePath]);
    let probeOutput = '';
    probe.stderr.on('data', (d) => { probeOutput += d.toString(); });

    const probeTimer = setTimeout(() => {
      try { probe.kill('SIGKILL'); } catch {}
    }, 10000);

    probe.on('close', () => {
      clearTimeout(probeTimer);
      const hasAudio = /Audio:/i.test(probeOutput);
      const hasNonAacAudio = /Audio:.*(?:opus|vorbis)/i.test(probeOutput);
      const hasAacAudio = /Audio:.*(?:aac|mp4a)/i.test(probeOutput);

      // Skip if no audio, already AAC, or no known non-AAC codec detected
      if (!hasAudio || hasAacAudio || !hasNonAacAudio) {
        resolve(filePath);
        return;
      }

      const durationSecs = parseDurationSecs(probeOutput);
      onProgress({ percent: 99.5, speed: '', eta: '', status: 'converting_audio', convertPercent: 0 });

      const tmpPath = filePath.replace(/\.mp4$/, '.aac.tmp.mp4');
      const proc = spawn(ffmpegPath, [
        '-i', filePath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        '-y',
        tmpPath,
      ]);

      trackFfmpegProgress(proc, durationSecs, onProgress, 'converting_audio');

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            fs.unlinkSync(filePath);
            fs.renameSync(tmpPath, filePath);
          } catch {}
        } else {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
        resolve(filePath);
      });

      proc.on('error', () => resolve(filePath));
    });

    probe.on('error', () => {
      clearTimeout(probeTimer);
      resolve(filePath);
    });
  });
}

function startDownload(options, onProgress, onComplete, onError) {
  const ytdlp = getYtdlpPath();
  const ffmpegPath = getFfmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);

  cleanStaleYtdlpTemp();
  const args = buildDownloadArgs({ ...options, ffmpegDir });
  console.log('[yt-dlp] spawn:', args.join(' '));
  const proc = spawn(ytdlp, args);

  const MAX_STDERR = 10 * 1024;
  let stderrBuf = '';
  const parseState = { lastFile: '', lastPercent: 0, lastOutputTime: Date.now() };

  const parseLine = (line) => {
    const t = line.trim();
    if (t) {
      parseState.lastOutputTime = Date.now();
      console.log('[yt-dlp]', t);
    }
    parseOutputLine(line, parseState, onProgress);
  };

  const heartbeat = setInterval(() => {
    const silentMs = Date.now() - parseState.lastOutputTime;
    if (silentMs >= 5000 && parseState.lastPercent >= 99) {
      onProgress({ percent: 99.5, speed: '', eta: '', status: 'still_working' });
    }
  }, 3000);

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(parseLine);
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuf += text;
    if (stderrBuf.length > MAX_STDERR) {
      stderrBuf = stderrBuf.slice(-MAX_STDERR);
    }
    text.split('\n').forEach(parseLine);
  });

  proc.on('close', (code) => {
    clearInterval(heartbeat);
    if (code === 0) {
      const filePath = parseState.lastFile;
      if (filePath && filePath.endsWith('.mp4')) {
        ensureMacCompatible(filePath, ffmpegPath, onProgress)
          .then((compatPath) => ensureAacAudio(compatPath, ffmpegPath, onProgress))
          .then((finalPath) => onComplete(finalPath));
      } else {
        onComplete(filePath);
      }
    } else {
      onError(mapError(stderrBuf));
    }
  });

  proc.on('error', (err) => {
    clearInterval(heartbeat);
    onError(`Failed to run yt-dlp: ${err.message}`);
  });

  return proc;
}

function fetchCarouselVideos(url) {
  return new Promise((resolve) => {
    const ytdlp = getYtdlpPath();
    const ffmpeg = getFfmpegPath();

    const args = [
      '--dump-json',
      '--no-warnings',
      '--ffmpeg-location', path.dirname(ffmpeg),
      url,
    ];

    cleanStaleYtdlpTemp();
    const proc = spawn(ytdlp, args, { timeout: 60000 });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      try {
        const items = [];
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
          try {
            const info = JSON.parse(line);
            const videoUrl = info.url || '';
            const thumbnail = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';

            if (videoUrl && info.duration > 0) {
              items.push({
                type: 'video',
                url: videoUrl,
                thumbnail,
                width: info.width || 0,
                height: info.height || 0,
              });
            }
          } catch { /* skip unparseable lines */ }
        }

        resolve(items);
      } catch {
        resolve([]);
      }
    });

    proc.on('error', () => resolve([]));
  });
}

module.exports = { fetchVideoInfo, startDownload, fetchCarouselVideos, cleanStaleYtdlpTemp };
