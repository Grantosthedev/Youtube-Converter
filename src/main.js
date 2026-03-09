const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');
const { fetchVideoInfo, startDownload } = require('./ytdlp');
const { updateYtdlp, getCurrentYtdlpVersion, checkAppUpdate } = require('./updater');
const { isValidYouTubeURL, normalizeYouTubeURL, binaryExists, getYtdlpPath, getFfmpegPath, pathExists, checkDiskSpace } = require('./utils');

const store = new Store({
  defaults: {
    downloadPath: path.join(app.getPath('downloads'), 'YT Clips'),
    quality: 'best',
    autoPaste: true,
    windowBounds: { width: 880, height: 640 },
    downloadHistory: [],
  },
});

const videoInfoCache = new Map();

let mainWindow = null;
let activeDownloadProcess = null;
let downloadCancelled = false;

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC Handlers ---

ipcMain.handle('fetch-video-info', async (_event, url) => {
  if (!isValidYouTubeURL(url)) {
    throw new Error('YOU ABSOLUTE BUFFOON, that\'s not a YouTube URL. Paste a real fucking link before I scream.');
  }
  const normalized = normalizeYouTubeURL(url);
  const info = await fetchVideoInfo(normalized);
  if (info.isLive) {
    throw new Error('Live streams can\'t be clipped, you impatient nincompoop. Wait for the stream to end like everyone else.');
  }
  if (videoInfoCache.size > 50) {
    const oldest = videoInfoCache.keys().next().value;
    videoInfoCache.delete(oldest);
  }
  videoInfoCache.set(normalized, info);
  return info;
});

const VALID_QUALITIES = new Set(['best', 'hd', 'audio']);
const TIME_FORMAT = /^\d{2}:\d{2}:\d{2}$/;

ipcMain.handle('start-download', async (event, options) => {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid download options, you inept noodle.');
  }
  if (!isValidYouTubeURL(options.url)) {
    throw new Error('YOU ABSOLUTE BUFFOON, that\'s not a YouTube URL. Paste a real fucking link before I scream.');
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
    throw new Error('Disk space is fucking cooked, you fun vampire. Free some space or switch drives.');
  }

  try {
    fs.accessSync(downloadPath, fs.constants.W_OK);
  } catch {
    throw new Error('Cannot save to this folder, you clumsy oaf. Pick another goddamn folder.');
  }

  const downloadOptions = {
    url: normalizeYouTubeURL(options.url),
    quality: options.quality || 'best',
    startTime: options.startTime,
    endTime: options.endTime,
    outputPath: downloadPath,
    title: options.title || 'download',
  };

  downloadCancelled = false;

  return new Promise((resolve, reject) => {
    activeDownloadProcess = startDownload(
      downloadOptions,
      (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progress);
        }
      },
      (filePath) => {
        activeDownloadProcess = null;

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
        };

        const history = store.get('downloadHistory');
        history.unshift(historyEntry);
        if (history.length > 500) history.length = 500;
        store.set('downloadHistory', history);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-complete', { filePath });
        }

        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Download Complete, You Lucky Buffoon',
            body: cachedInfo.title || path.basename(filePath || 'Video downloaded somehow'),
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

        resolve({ filePath });
      },
      (errorMsg) => {
        activeDownloadProcess = null;

        if (downloadCancelled) {
          downloadCancelled = false;
          resolve({ cancelled: true });
          return;
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-error', { error: errorMsg });
        }

        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Download Failed, You Bungling Fool',
            body: errorMsg || 'Something went wrong, you numbskull.',
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

        reject(new Error(errorMsg));
      },
    );
  });
});

ipcMain.handle('cancel-download', async () => {
  if (activeDownloadProcess) {
    downloadCancelled = true;
    activeDownloadProcess.kill('SIGTERM');
    activeDownloadProcess = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle('select-folder', async () => {
  const dialogOpts = {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Download Folder, You Party Pooper',
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
  };
});

const ALLOWED_SETTINGS = new Set(['quality', 'autoPaste', 'downloadPath']);

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
  if (activeDownloadProcess) {
    const proc = activeDownloadProcess;
    activeDownloadProcess = null;
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 3000);
  }
});
