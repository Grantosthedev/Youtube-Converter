const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');
const { fetchVideoInfo, startDownload, fetchCarouselVideos } = require('./ytdlp');
const { updateYtdlp, getCurrentYtdlpVersion, checkAppUpdate } = require('./updater');
const { isValidURL, detectPlatform, normalizeYouTubeURL, binaryExists, getYtdlpPath, getFfmpegPath, pathExists, checkDiskSpace } = require('./utils');
const { fetchMediaInfo, downloadImage, fetchImageAsDataUri } = require('./media-fetcher');

const store = new Store({
  defaults: {
    downloadPath: path.join(app.getPath('downloads'), 'YT Clips'),
    quality: 'best',
    autoPaste: true,
    showInFinder: false,
    windowBounds: { width: 880, height: 640 },
    downloadHistory: [],
  },
});

const videoInfoCache = new Map();

let mainWindow = null;
const activeDownloads = new Map();

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
  const downloadPath = options.outputPath || store.get('downloadPath');

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
      activeDownloads.delete(downloadId);

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
          clipStart: downloadOptions.startTime || null,
          clipEnd: downloadOptions.endTime || null,
          filePath: filePath || '',
          fileSize,
          format: ext || (downloadOptions.quality === 'audio' ? 'm4a' : 'mp4'),
          downloadedAt: new Date().toISOString(),
          platform: cachedInfo.platform || platform || 'youtube',
          mediaType: cachedInfo.mediaType || 'video',
        };

        const history = store.get('downloadHistory');
        history.unshift(historyEntry);
        if (history.length > 500) history.length = 500;
        store.set('downloadHistory', history);

        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Done, You Lucky Mother Fucka!',
            body: cachedInfo.title || path.basename(filePath || 'Video saved somehow, lol'),
            silent: false,
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
          title: 'What the Helly! Download Failed',
          body: errorMsg || 'idk how to tell you but... Something went wrong.',
          silent: false,
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
  return await fetchCarouselVideos(url);
});

ipcMain.handle('proxy-image', async (_event, url) => {
  try { return await fetchImageAsDataUri(url); } catch { return null; }
});

ipcMain.handle('download-image', async (_event, options) => {
  const downloadPath = options.outputPath || store.get('downloadPath');

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
      };
      history.unshift(parentEntry);
    }
  } else {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'you downloaded an image, well fucking done',
        body: options.title || options.filename || 'Image saved, fam',
        silent: false,
      });
      notif.on('click', () => {
        if (result.filePath) shell.showItemInFolder(result.filePath);
      });
      notif.show();
    }

    const historyEntry = {
      id: crypto.randomUUID(),
      videoId: '',
      title: options.title || options.filename || 'Instagram post, mother fucka',
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
    };
    history.unshift(historyEntry);
  }

  if (history.length > 500) history.length = 500;
  store.set('downloadHistory', history);

  return { filePath: result.filePath, fileSize: result.fileSize };
});

ipcMain.handle('cancel-download', async (_event, downloadId) => {
  if (downloadId) {
    const entry = activeDownloads.get(downloadId);
    if (entry) {
      entry.cancelled = true;
      entry.process.kill('SIGTERM');
      return { cancelled: true };
    }
    return { cancelled: false };
  }
  for (const [, entry] of activeDownloads) {
    entry.cancelled = true;
    entry.process.kill('SIGTERM');
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
  };
});

const ALLOWED_SETTINGS = new Set(['quality', 'autoPaste', 'downloadPath', 'showInFinder']);

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

ipcMain.handle('show-notification', async (_event, title, body, filePath) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, silent: false });
    notif.on('click', () => {
      if (filePath) shell.showItemInFolder(filePath);
      else if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
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
  const ytdlpOk = binaryExists(getYtdlpPath());
  if (!ytdlpOk) {
    dialog.showErrorBox(
      'Missing Binary, You Buffoon',
      'yt-dlp binary is missing, you inept noodle. Please reinstall the app or run "npm run postinstall".',
    );
    app.quit();
    return;
  }
  createWindow();
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
