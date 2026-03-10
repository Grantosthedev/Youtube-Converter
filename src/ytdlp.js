const { spawn } = require('child_process');
const { getYtdlpPath, getFfmpegPath, sanitizeFilename } = require('./utils');
const path = require('path');

const ERROR_MAP = [
  { pattern: /private video/i, message: 'This video is private. You need access to download it.' },
  { pattern: /age.?restrict|age.?gate|sign in to confirm your age/i, message: 'This video is age-restricted. It cannot be downloaded without authentication.' },
  { pattern: /not available in your country/i, message: 'This video is not available in your region.' },
  { pattern: /login.*page|locked behind/i, message: 'This content requires login. Try updating yt-dlp, or the content may be private.' },
  { pattern: /Unsupported URL/i, message: 'This URL type isn\'t supported yet. DL Buddy handles videos and audio -- image-only posts aren\'t supported via this method.' },
  { pattern: /unable to extract/i, message: 'Couldn\'t extract content. The post may be private, deleted, or require login.' },
  { pattern: /HTTP Error 429/i, message: 'Rate-limiting detected. Wait a minute and try again.' },
  { pattern: /HTTP Error 403|Forbidden/i, message: 'Access denied. The platform is rate-limiting requests. Wait a moment and try again.' },
  { pattern: /urlopen error|timed out|network/i, message: 'Network error. Check your internet connection and try again.' },
  { pattern: /video.*(?:unavailable|removed|deleted|not exist)/i, message: 'This video is unavailable or has been removed.' },
  { pattern: /is not a valid URL|no video/i, message: 'Please enter a valid URL.' },
];

function mapError(stderr) {
  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(stderr)) return message;
  }
  const errorLine = stderr.split('\n').find(l => l.includes('ERROR:'));
  if (errorLine) return errorLine.replace('ERROR: ', '').trim();
  return 'An unexpected error occurred. Please try again.';
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

    const timeout = platform === 'instagram' ? 60000 : platform === 'tiktok' ? 45000 : 30000;
    const proc = spawn(ytdlp, args, { timeout });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
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
      reject(new Error(`Failed to run yt-dlp: ${err.message}`));
    });
  });
}

function extractAvailableQualities(formats) {
  const heights = new Set();
  for (const f of formats) {
    if (f.height && f.vcodec !== 'none') heights.add(f.height);
  }
  const sorted = [...heights].sort((a, b) => b - a);
  return sorted.map(h => {
    if (h >= 2160) return '4K';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return `${h}p`;
  });
}

function buildDownloadArgs({ url, quality, startTime, endTime, outputPath, title, ffmpegDir, platform }) {
  const safeName = sanitizeFilename(title);
  const isYouTube = !platform || platform === 'youtube';
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--newline',
    '--ffmpeg-location', ffmpegDir,
    '--concurrent-fragments', '4',
    '--retries', '3',
    '--fragment-retries', '3',
    '--buffer-size', '64K',
  ];

  if (quality === 'audio') {
    args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    args.push('-x', '--audio-format', 'm4a', '--audio-quality', '0');
    args.push('-o', path.join(outputPath, `${safeName}.%(ext)s`));
  } else if (isYouTube) {
    if (quality === 'hd') {
      args.push(
        '-f',
        'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio',
        '--merge-output-format', 'mp4',
      );
    } else {
      args.push(
        '-f',
        'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio',
        '--merge-output-format', 'mp4',
      );
    }
    args.push('-o', path.join(outputPath, `${safeName}.%(ext)s`));
  } else {
    if (quality === 'hd') {
      args.push(
        '-f',
        'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
        '--merge-output-format', 'mp4',
      );
    } else {
      args.push(
        '-f',
        'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
      );
    }
    args.push('-o', path.join(outputPath, `${safeName}.%(ext)s`));
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
      args.push('--force-keyframes-at-cuts');
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
    return;
  }

  if (trimmed.includes('has already been downloaded')) {
    state.lastFile = trimmed.replace('[download]', '').replace('has already been downloaded', '').trim();
    onProgress({ percent: 100, speed: '', eta: '' });
    return;
  }

  const percentMatch = trimmed.match(/([\d.]+)%/);
  if (percentMatch) {
    const percent = parseFloat(percentMatch[1]);
    const speedMatch = trimmed.match(/at\s+([\d.]+\S*\/s)/);
    const etaMatch = trimmed.match(/ETA\s+(\d+:\d+)/);
    onProgress({
      percent: Math.min(percent, 100),
      speed: speedMatch ? speedMatch[1] : '',
      eta: etaMatch ? etaMatch[1] : '',
    });
  }
}

function startDownload(options, onProgress, onComplete, onError) {
  const ytdlp = getYtdlpPath();
  const ffmpegPath = getFfmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);

  const args = buildDownloadArgs({ ...options, ffmpegDir });
  const proc = spawn(ytdlp, args);

  const MAX_STDERR = 10 * 1024;
  let stderrBuf = '';
  const parseState = { lastFile: '' };

  const parseLine = (line) => parseOutputLine(line, parseState, onProgress);

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
    if (code === 0) {
      onComplete(parseState.lastFile);
    } else {
      onError(mapError(stderrBuf));
    }
  });

  proc.on('error', (err) => {
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

module.exports = { fetchVideoInfo, startDownload, fetchCarouselVideos };
