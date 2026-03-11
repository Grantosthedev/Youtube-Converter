const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');
const { fetchVideoInfo, startDownload, fetchCarouselVideos } = require('./ytdlp');
const { updateYtdlp, getCurrentYtdlpVersion, checkAppUpdate, ensureYtdlpFresh } = require('./updater');
const { isValidURL, detectPlatform, normalizeYouTubeURL, binaryExists, getYtdlpPath, getFfmpegPath, pathExists, checkDiskSpace, sanitizeFilename } = require('./utils');
const { fetchMediaInfo, downloadImage, fetchImageAsDataUri } = require('./media-fetcher');

const GOOD_STICKERS = [
  'good14.png', 'good23.png', 'good24.png', 'good25.png', 'good26.png',
  'good27.png', 'good28.png', 'good29.png', 'good30.png', 'good31.png',
  'good32.png', 'good33.png',
];
const BAD_STICKERS = [
  'bad11.png', 'bad12.png', 'bad13.png', 'bad14.png',
  'bad15.png', 'bad16.png', 'bad17.png', 'bad18.png',
];

function getStickerIcon(type) {
  const pool = type === 'bad' ? BAD_STICKERS : GOOD_STICKERS;
  const name = pool[Math.floor(Math.random() * pool.length)];
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'renderer', 'stickers', name));
    return nativeImage.createFromBuffer(buf);
  } catch {
    return null;
  }
}

const store = new Store({
  defaults: {
    downloadPath: path.join(app.getPath('downloads'), 'YT Clips'),
    quality: 'best',
    autoPaste: true,
    showInFinder: false,
    mode: 'unhinged',
    windowBounds: { width: 880, height: 640 },
    downloadHistory: [],
    projects: [],
    projectHues: {},
    activeProject: null,
    lastYtdlpCheck: 0,
  },
});

function nt(unhinged, professional) {
  return store.get('mode') === 'professional' ? professional : unhinged;
}

const SEED_HUES = [180, 280, 80, 230, 130, 310, 55];

function assignOptimalHue(takenHues) {
  const MIN = 40, MAX = 320, MIN_DIST = 25;
  const taken = new Set(takenHues);

  for (const seed of SEED_HUES) {
    if ([...taken].every(h => Math.abs(h - seed) >= MIN_DIST)) return seed;
  }

  const sorted = [...takenHues].sort((a, b) => a - b);
  let bestGap = sorted[0] - MIN;
  let bestMid = MIN + bestGap / 2;

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > bestGap) { bestGap = gap; bestMid = sorted[i] + gap / 2; }
  }

  const lastGap = MAX - sorted[sorted.length - 1];
  if (lastGap > bestGap) bestMid = sorted[sorted.length - 1] + lastGap / 2;

  return Math.round(bestMid);
}

function ensureProjectHues() {
  const projects = store.get('projects');
  const hues = { ...store.get('projectHues') };
  let changed = false;

  for (const name of Object.keys(hues)) {
    if (!projects.includes(name)) { delete hues[name]; changed = true; }
  }
  for (const name of projects) {
    if (hues[name] == null) { hues[name] = assignOptimalHue(Object.values(hues)); changed = true; }
  }

  if (changed) store.set('projectHues', hues);
  return hues;
}

const videoInfoCache = new Map();

let mainWindow = null;
const activeDownloads = new Map();
let ytdlpUpdatePromise = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 840,
    minHeight: 580,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.cdninstagram.com/*', 'https://*.fbcdn.net/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.instagram.com/';
      details.requestHeaders['Origin'] = 'https://www.instagram.com';
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window-focus');
  });

  mainWindow.on('resize', () => {
    try {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', { width: bounds.width, height: bounds.height });
    } catch { /* ignore persist errors */ }
  });

  mainWindow.on('close', (e) => {
    if (activeDownloads.size > 0) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Quit Anyway'],
        defaultId: 0,
        cancelId: 0,
        title: 'Active Downloads, Fam',
        message: `You got ${activeDownloads.size} download${activeDownloads.size > 1 ? 's' : ''} running. Quit anyway? smh`,
      });
      if (choice === 0) {
        e.preventDefault();
        return;
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC Handlers ---

ipcMain.handle('fetch-video-info', async (_event, url) => {
  if (ytdlpUpdatePromise) {
    await ytdlpUpdatePromise;
  }
  if (!isValidURL(url)) {
    throw new Error('That\'s not a valid URL. Paste a YouTube, Instagram, or TikTok link.');
  }
  const platform = detectPlatform(url);
  const cacheKey = platform === 'youtube' ? normalizeYouTubeURL(url) : url.trim();
  const fetchUrl = platform === 'youtube' ? normalizeYouTubeURL(url) : url.trim();

  const info = await fetchVideoInfo(fetchUrl, platform);

  if (platform === 'youtube' && info.isLive) {
    throw new Error('Live streams can\'t be clipped, bitch. Wait for the stream to end like everyone else.');
  }
  if (videoInfoCache.size > 50) {
    const oldest = videoInfoCache.keys().next().value;
    videoInfoCache.delete(oldest);
  }
  videoInfoCache.set(cacheKey, info);
  return info;
});

const VALID_QUALITIES = new Set(['best', 'hd', 'audio']);
const TIME_FORMAT = /^\d{2}:\d{2}:\d{2}$/;

ipcMain.handle('start-download', async (event, options) => {
  if (ytdlpUpdatePromise) {
    await ytdlpUpdatePromise;
  }
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid download options, you inept noodle.');
  }
  if (!isValidURL(options.url)) {
    throw new Error('That\'s not a valid URL. Paste a YouTube, Instagram, or TikTok link.');
  }
  if (options.quality && !VALID_QUALITIES.has(options.quality)) {
    throw new Error('Invalid quality setting, you thick as a brick.');
  }
  if (options.startTime && !TIME_FORMAT.test(options.startTime)) {
    throw new Error('Invalid start time format, you numbskull.');
  }
  if (options.endTime && !TIME_FORMAT.test(options.endTime)) {
    throw new Error('Invalid end time format, you clown.');
  }

  const platform = detectPlatform(options.url);
  const basePath = options.outputPath || store.get('downloadPath');
  const activeProject = store.get('activeProject');
  const downloadPath = activeProject ? path.join(basePath, activeProject) : basePath;

  if (!pathExists(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true });
    } catch {
      throw new Error('Cannot save to this folder, you clumsy oaf. Pick another goddamn folder.');
    }
  }

  const freeSpace = await checkDiskSpace(downloadPath);
  if (freeSpace < 100 * 1024 * 1024) {
    throw new Error('Disk space is fucking cooked. Free some space or switch drives.');
  }

  try {
    fs.accessSync(downloadPath, fs.constants.W_OK);
  } catch {
    throw new Error('Cannot save to this folder, you clumsy oaf. Pick another goddamn folder.');
  }

  const downloadId = crypto.randomUUID();
  const downloadUrl = platform === 'youtube' ? normalizeYouTubeURL(options.url) : options.url.trim();

  const downloadOptions = {
    url: downloadUrl,
    quality: options.quality || 'best',
    startTime: options.startTime,
    endTime: options.endTime,
    outputPath: downloadPath,
    title: options.title || 'download',
    platform,
  };

  const proc = startDownload(
    downloadOptions,
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', { id: downloadId, ...progress });
      }
    },
    (filePath) => {
      const wasCancelledLate = activeDownloads.get(downloadId)?.cancelled;
      activeDownloads.delete(downloadId);

      if (wasCancelledLate) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-cancelled', { id: downloadId });
        }
        return;
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-complete', { id: downloadId, filePath });
      }

      try {
        const cachedInfo = videoInfoCache.get(downloadOptions.url) || {};
        let fileSize = 0;
        try { fileSize = fs.statSync(filePath).size; } catch { /* ignore */ }
        const ext = path.extname(filePath || '').replace('.', '').toLowerCase();

        const historyEntry = {
          id: crypto.randomUUID(),
          videoId: cachedInfo.id || '',
          title: cachedInfo.title || downloadOptions.title,
          uploader: cachedInfo.uploader || '',
          channel: cachedInfo.channel || '',
          channelUrl: cachedInfo.channelUrl || '',
          webpageUrl: cachedInfo.webpageUrl || downloadOptions.url,
          uploadDate: cachedInfo.uploadDate || '',
          description: cachedInfo.description || '',
          duration: cachedInfo.duration || 0,
          viewCount: cachedInfo.viewCount ?? null,
          likeCount: cachedInfo.likeCount ?? null,
          categories: cachedInfo.categories || [],
          tags: cachedInfo.tags || [],
          license: cachedInfo.license || '',
          quality: downloadOptions.quality,
          resolution: cachedInfo.formats?.[0] || null,
          clipStart: downloadOptions.startTime || null,
          clipEnd: downloadOptions.endTime || null,
          filePath: filePath || '',
          fileSize,
          format: ext || (downloadOptions.quality === 'audio' ? 'm4a' : 'mp4'),
          downloadedAt: new Date().toISOString(),
          platform: cachedInfo.platform || platform || 'youtube',
          mediaType: cachedInfo.mediaType || 'video',
          project: activeProject || null,
        };

        const history = store.get('downloadHistory');
        history.unshift(historyEntry);
        if (history.length > 500) history.length = 500;
        store.set('downloadHistory', history);

        if (Notification.isSupported()) {
          const notif = new Notification({
            title: nt('WTF it actually worked, download complete', 'Download complete'),
            body: cachedInfo.title || path.basename(filePath || nt('Video saved somehow, lol', 'Video saved')),
            silent: false,
            icon: getStickerIcon('good'),
            actions: [{ type: 'button', text: 'Show File' }],
          });
          notif.on('click', () => {
            if (filePath) shell.showItemInFolder(filePath);
          });
          notif.on('action', () => {
            if (filePath) shell.showItemInFolder(filePath);
          });
          notif.show();
        }

        if (store.get('showInFinder') && filePath) {
          shell.showItemInFolder(filePath);
        }
      } catch { /* history/notification must never block the completion event */ }
    },
    (errorMsg) => {
      const entry = activeDownloads.get(downloadId);
      const wasCancelled = entry?.cancelled;
      activeDownloads.delete(downloadId);

      if (wasCancelled) {
        try {
          const files = fs.readdirSync(downloadPath);
          for (const file of files) {
            if (file.endsWith('.part') || file.endsWith('.ytdl')) {
              fs.unlinkSync(path.join(downloadPath, file));
            }
          }
        } catch { /* ignore cleanup errors */ }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-cancelled', { id: downloadId });
        }
        return;
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-error', { id: downloadId, error: errorMsg });
      }

      if (Notification.isSupported()) {
        const notif = new Notification({
          title: nt('What the Helly! Download Failed', 'Download failed'),
          body: errorMsg || nt('idk how to tell you but... Something went wrong.', 'Something went wrong.'),
          silent: false,
          icon: getStickerIcon('bad'),
        });
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notif.show();
      }
    },
  );

  activeDownloads.set(downloadId, { process: proc, options: downloadOptions, cancelled: false });
  return { id: downloadId };
});

ipcMain.handle('fetch-media-info', async (_event, url) => {
  return await fetchMediaInfo(url);
});

ipcMain.handle('fetch-carousel-videos', async (_event, url) => {
  if (ytdlpUpdatePromise) await ytdlpUpdatePromise;
  return await fetchCarouselVideos(url);
});

ipcMain.handle('proxy-image', async (_event, url) => {
  try { return await fetchImageAsDataUri(url); } catch { return null; }
});

ipcMain.handle('download-image', async (_event, options) => {
  const imageBasePath = options.outputPath || store.get('downloadPath');
  const imageActiveProject = store.get('activeProject');
  const downloadPath = imageActiveProject ? path.join(imageBasePath, imageActiveProject) : imageBasePath;

  if (!pathExists(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true });
    } catch {
      throw new Error('Cannot save to this folder. Pick another folder.');
    }
  }

  const freeSpace = await checkDiskSpace(downloadPath);
  if (freeSpace < 50 * 1024 * 1024) {
    throw new Error('Not enough disk space. Free some space or switch drives.');
  }

  try {
    fs.accessSync(downloadPath, fs.constants.W_OK);
  } catch {
    throw new Error('Cannot write to this folder. Pick another folder.');
  }

  const result = await downloadImage(options.url, downloadPath, options.filename || 'image', options.mediaType);

  if (store.get('showInFinder') && result.filePath) {
    shell.showItemInFolder(result.filePath);
  }

  const history = store.get('downloadHistory');
  const groupId = options.carouselGroupId;

  if (groupId) {
    const existing = history.find(e => e.carouselGroupId === groupId);
    const childItem = {
      filePath: result.filePath,
      fileSize: result.fileSize,
      mediaType: options.mediaType || 'image',
      format: path.extname(result.filePath).replace('.', '').toLowerCase() || 'jpg',
    };

    if (existing) {
      existing.carouselItems.push(childItem);
      existing.fileSize = existing.carouselItems.reduce((sum, ci) => sum + (ci.fileSize || 0), 0);
    } else {
      const parentEntry = {
        id: crypto.randomUUID(),
        carouselGroupId: groupId,
        videoId: '',
        title: options.title || options.filename || 'Instagram carousel',
        uploader: options.postOwner || '',
        channel: options.postOwner || '',
        channelUrl: '',
        webpageUrl: options.webpageUrl || '',
        uploadDate: '',
        description: (options.caption || '').slice(0, 300),
        duration: 0,
        viewCount: null,
        likeCount: null,
        categories: [],
        tags: [],
        license: '',
        quality: 'best',
        clipStart: null,
        clipEnd: null,
        filePath: result.filePath,
        fileSize: result.fileSize,
        format: path.extname(result.filePath).replace('.', '').toLowerCase() || 'jpg',
        downloadedAt: new Date().toISOString(),
        platform: 'instagram',
        mediaType: 'carousel',
        carouselItems: [childItem],
        project: imageActiveProject || null,
      };
      history.unshift(parentEntry);
    }
  } else {
    if (Notification.isSupported()) {
      const isVideo = options.mediaType === 'video';
      const notif = new Notification({
        title: isVideo
          ? nt('Reel downloaded, you legend', 'Reel downloaded')
          : nt('you downloaded an image, well fucking done', 'Image downloaded'),
        body: options.title || options.filename || (isVideo
          ? nt('Reel saved, fam', 'Reel saved')
          : nt('Image saved, fam', 'Image saved')),
        silent: false,
        icon: getStickerIcon('good'),
      });
      notif.on('click', () => {
        if (result.filePath) shell.showItemInFolder(result.filePath);
      });
      notif.show();
    }

    const historyEntry = {
      id: crypto.randomUUID(),
      videoId: '',
      title: options.title || options.filename || 'Instagram post',
      uploader: options.postOwner || '',
      channel: options.postOwner || '',
      channelUrl: '',
      webpageUrl: options.webpageUrl || '',
      uploadDate: '',
      description: (options.caption || '').slice(0, 300),
      duration: 0,
      viewCount: null,
      likeCount: null,
      categories: [],
      tags: [],
      license: '',
      quality: 'best',
      clipStart: null,
      clipEnd: null,
      filePath: result.filePath,
      fileSize: result.fileSize,
      format: path.extname(result.filePath).replace('.', '').toLowerCase() || 'jpg',
      downloadedAt: new Date().toISOString(),
      platform: 'instagram',
      mediaType: options.mediaType || 'image',
      project: imageActiveProject || null,
    };
    history.unshift(historyEntry);
  }

  if (history.length > 500) history.length = 500;
  store.set('downloadHistory', history);

  return { filePath: result.filePath, fileSize: result.fileSize };
});

ipcMain.handle('cancel-download', async (_event, downloadId) => {
  function killEntry(entry) {
    entry.cancelled = true;
    entry.process.kill('SIGTERM');
    setTimeout(() => { try { entry.process.kill('SIGKILL'); } catch {} }, 3000);
  }
  if (downloadId) {
    const entry = activeDownloads.get(downloadId);
    if (entry) {
      killEntry(entry);
      return { cancelled: true };
    }
    return { cancelled: false };
  }
  for (const [, entry] of activeDownloads) {
    killEntry(entry);
  }
  return { cancelled: true };
});

ipcMain.handle('select-folder', async () => {
  const dialogOpts = {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Pick a folder, mother fucka',
    defaultPath: store.get('downloadPath'),
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts);
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    store.set('downloadPath', selected);
    return selected;
  }
  return null;
});

ipcMain.handle('reveal-in-finder', async (_event, filePath) => {
  const downloadDir = path.resolve(store.get('downloadPath'));
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (resolved.startsWith(downloadDir) && fs.existsSync(resolved)) {
      shell.showItemInFolder(resolved);
      return { found: true };
    }
  }
  shell.openPath(downloadDir);
  return { found: false };
});

ipcMain.handle('get-settings', async () => {
  return {
    downloadPath: store.get('downloadPath'),
    quality: store.get('quality'),
    autoPaste: store.get('autoPaste'),
    showInFinder: store.get('showInFinder'),
    mode: store.get('mode'),
    activeProject: store.get('activeProject'),
    projects: store.get('projects'),
    projectHues: ensureProjectHues(),
  };
});

const ALLOWED_SETTINGS = new Set(['quality', 'autoPaste', 'downloadPath', 'showInFinder', 'mode']);

ipcMain.handle('set-setting', async (_event, key, value) => {
  if (!ALLOWED_SETTINGS.has(key)) return;
  store.set(key, value);
});

ipcMain.handle('update-ytdlp', async () => {
  return await updateYtdlp();
});

ipcMain.handle('get-ytdlp-version', async () => {
  return await getCurrentYtdlpVersion();
});

ipcMain.handle('check-app-update', async () => {
  const currentVersion = app.getVersion();
  return await checkAppUpdate(currentVersion);
});

ipcMain.handle('show-notification', async (_event, title, body, filePath, stickerType = 'good') => {
  if (Notification.isSupported()) {
    const notifOptions = { title, body, silent: false, icon: getStickerIcon(stickerType) };
    if (filePath) notifOptions.actions = [{ type: 'button', text: 'Show File' }];
    const notif = new Notification(notifOptions);
    notif.on('click', () => {
      if (filePath) shell.showItemInFolder(filePath);
      else if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    });
    notif.on('action', () => {
      if (filePath) shell.showItemInFolder(filePath);
    });
    notif.show();
  }
});

ipcMain.handle('get-clipboard', async () => {
  return clipboard.readText();
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('cleanup-partial-files', async (_event, dir) => {
  const allowedBase = store.get('downloadPath');
  const targetDir = dir || allowedBase;
  const resolved = path.resolve(targetDir);
  if (!resolved.startsWith(path.resolve(allowedBase))) return;
  try {
    const files = fs.readdirSync(resolved);
    for (const file of files) {
      if (file.endsWith('.part') || file.endsWith('.ytdl')) {
        fs.unlinkSync(path.join(resolved, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
});

ipcMain.handle('get-projects', async () => {
  return store.get('projects');
});

ipcMain.handle('get-active-project', async () => {
  return store.get('activeProject');
});

ipcMain.handle('set-active-project', async (_event, projectName) => {
  if (projectName && typeof projectName === 'string') {
    const sanitized = sanitizeFilename(projectName).substring(0, 50);
    if (!sanitized) return null;
    store.set('activeProject', sanitized);
    const projects = store.get('projects');
    const filtered = projects.filter(p => p !== sanitized);
    filtered.unshift(sanitized);
    store.set('projects', filtered);

    const hues = store.get('projectHues');
    if (hues[sanitized] == null) {
      hues[sanitized] = assignOptimalHue(Object.values(hues));
      store.set('projectHues', hues);
    }

    return { name: sanitized, projectHues: hues };
  }
  store.set('activeProject', null);
  return null;
});

ipcMain.handle('delete-project', async (_event, projectName) => {
  if (!projectName) return { projects: store.get('projects'), projectHues: store.get('projectHues') };
  const projects = store.get('projects').filter(p => p !== projectName);
  store.set('projects', projects);
  const hues = store.get('projectHues');
  delete hues[projectName];
  store.set('projectHues', hues);
  if (store.get('activeProject') === projectName) {
    store.set('activeProject', null);
  }
  return { projects, projectHues: hues };
});

ipcMain.handle('get-history', async () => {
  return store.get('downloadHistory');
});

ipcMain.handle('delete-history-entry', async (_event, id) => {
  const history = store.get('downloadHistory');
  store.set('downloadHistory', history.filter(e => e.id !== id));
});

ipcMain.handle('clear-history', async () => {
  store.set('downloadHistory', []);
});

ipcMain.handle('open-external', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// --- App lifecycle ---

app.on('ready', () => {
  app.setName('DL Buddy');
  createWindow();

  const sendActivity = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-activity', data);
    }
  };

  let activityNotified = false;
  let pendingActivityResult = null;
  const needsInitialDownload = !binaryExists(getYtdlpPath());

  ytdlpUpdatePromise = (async () => {
    if (needsInitialDownload) {
      console.log('[startup] yt-dlp not found, downloading...');
      sendActivity({ type: 'ytdlp-check', status: 'downloading' });
      const result = await updateYtdlp();
      if (!result.success) {
        dialog.showErrorBox(
          'Setup Failed',
          `Could not download yt-dlp: ${result.error}\n\nCheck your internet connection and restart the app.`,
        );
        app.quit();
        return null;
      }
      return result;
    }
    return ensureYtdlpFresh(store);
  })().then((result) => {
    if (!result) return;
    if (result.success && !result.skipped) {
      console.log(`[startup] yt-dlp ready: ${result.version}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ytdlp-updated', result.version);
      }
      pendingActivityResult = { type: 'ytdlp-check', status: 'updated' };
    } else {
      pendingActivityResult = { type: 'ytdlp-check', status: 'up-to-date' };
    }
    if (activityNotified) sendActivity(pendingActivityResult);
  }).catch(() => {
    pendingActivityResult = { type: 'ytdlp-check', status: 'failed' };
    if (activityNotified) sendActivity(pendingActivityResult);
  }).finally(() => {
    ytdlpUpdatePromise = null;
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (!pendingActivityResult) {
      activityNotified = true;
      sendActivity({ type: 'ytdlp-check', status: needsInitialDownload ? 'downloading' : 'checking' });
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  for (const [, entry] of activeDownloads) {
    try { entry.process.kill('SIGTERM'); } catch { /* already dead */ }
    setTimeout(() => {
      try { entry.process.kill('SIGKILL'); } catch { /* already dead */ }
    }, 3000);
  }
  activeDownloads.clear();
});
