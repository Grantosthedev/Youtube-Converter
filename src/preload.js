const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchVideoInfo: (url) => ipcRenderer.invoke('fetch-video-info', url),
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  revealInFinder: (filePath) => ipcRenderer.invoke('reveal-in-finder', filePath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  getYtdlpVersion: () => ipcRenderer.invoke('get-ytdlp-version'),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  cleanupPartialFiles: (dir) => ipcRenderer.invoke('cleanup-partial-files', dir),
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteHistoryEntry: (id) => ipcRenderer.invoke('delete-history-entry', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onDownloadComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-complete', listener);
    return () => ipcRenderer.removeListener('download-complete', listener);
  },
  onDownloadError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-error', listener);
    return () => ipcRenderer.removeListener('download-error', listener);
  },
  onWindowFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-focus', listener);
    return () => ipcRenderer.removeListener('window-focus', listener);
  },
});
