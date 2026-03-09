/* ============================================================
   State
   ============================================================ */

const state = {
  videoInfo: null,
  isDownloading: false,
  isFetchingInfo: false,
  lastDownloadedFile: null,
  selectedQuality: 'best',
  downloadPath: '',
  lastClipboardUrl: '',
  settingsOpen: false,
  autoPaste: true,
  historyOpen: false,
  historyData: [],
  historyFilter: 'all',
  historySortNewest: true,
  historySearchTerm: '',
};

/* ============================================================
   DOM References
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const urlRow = $('.url-row');
const urlInput = $('#urlInput');
const urlClear = $('#urlClear');
const urlHint = $('#urlHint');
const videoCard = $('#videoCard');
const videoThumb = $('#videoThumb');
const videoTitle = $('#videoTitle');
const videoMeta = $('#videoMeta');
const videoQualities = $('#videoQualities');
const startTime = $('#startTime');
const endTime = $('#endTime');
const qualitySelector = $('#qualitySelector');
const pillIndicator = $('#pillIndicator');
const pathDisplay = $('#pathDisplay');
const downloadBtn = $('#downloadBtn');
const cancelBtn = $('#cancelBtn');
const progressWrapper = $('#progressWrapper');
const progressFill = $('#progressFill');
const progressPercent = $('#progressPercent');
const progressSpeed = $('#progressSpeed');
const statusMessage = $('#statusMessage');
const statusIcon = $('#statusIcon');
const statusText = $('#statusText');
const lastDownload = $('#lastDownload');
const lastDownloadName = $('#lastDownloadName');
const revealBtn = $('#revealBtn');
const dropOverlay = $('#dropOverlay');
const settingsBtn = $('#settingsBtn');
const settingsPopover = $('#settingsPopover');
const settingsBackdrop = $('#settingsBackdrop');
const autoPasteToggle = $('#autoPasteToggle');
const updateYtdlpBtn = $('#updateYtdlpBtn');
const appVersion = $('#appVersion');
const historyBtn = $('#historyBtn');
const historyView = $('#historyView');
const historyBack = $('#historyBack');
const historyClearBtn = $('#historyClearBtn');
const historySearch = $('#historySearch');
const historyList = $('#historyList');
const historyEmpty = $('#historyEmpty');
const historyCount = $('#historyCount');
const historySortBtn = $('#historySortBtn');
const activityCard = $('#activityCard');
const activityLabel = $('#activityLabel');
const activityFill = $('#activityFill');
const activityDetail = $('#activityDetail');

/* ============================================================
   Helpers
   ============================================================ */

const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function isValidYouTubeURL(url) {
  return YOUTUBE_URL_REGEX.test(url.trim());
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '00:00:00') return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function shakeElement(el) {
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

function truncatePath(p) {
  if (!p) return '';
  const home = p.replace(/^\/Users\/[^/]+/, '~');
  if (home.length <= 40) return home;
  const parts = home.split('/');
  if (parts.length <= 3) return home;
  return parts[0] + '/…/' + parts.slice(-2).join('/');
}

/* ============================================================
   Activity Card — top-right status indicator
   ============================================================ */

let activityHideTimer = null;

function showActivity(label, detail, mode) {
  clearTimeout(activityHideTimer);
  activityLabel.textContent = label;
  activityDetail.textContent = detail || '';

  activityFill.className = 'activity-bar__fill';
  if (mode === 'indeterminate') {
    activityFill.classList.add('indeterminate');
    activityFill.style.width = '';
  } else if (mode === 'complete') {
    activityFill.classList.add('complete');
    activityFill.style.width = '100%';
  } else if (typeof mode === 'number') {
    activityFill.style.width = `${mode}%`;
  } else {
    activityFill.style.width = '0%';
  }

  activityCard.classList.add('visible');
}

function hideActivity(delay) {
  clearTimeout(activityHideTimer);
  if (delay) {
    activityHideTimer = setTimeout(() => activityCard.classList.remove('visible'), delay);
  } else {
    activityCard.classList.remove('visible');
  }
}

/* ============================================================
   Pill Indicator Animation
   ============================================================ */

function updatePillPosition(animate) {
  const activeBtn = qualitySelector.querySelector('.quality-option.active');
  if (!activeBtn || !pillIndicator) return;

  const barRect = qualitySelector.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const offsetLeft = btnRect.left - barRect.left;

  if (!animate) {
    pillIndicator.style.transition = 'none';
  }

  pillIndicator.style.width = btnRect.width + 'px';
  pillIndicator.style.transform = `translateX(${offsetLeft - 6}px)`;

  if (!animate) {
    pillIndicator.offsetHeight;
    pillIndicator.style.transition = '';
  }
}

/* ============================================================
   Settings Popover (with backdrop for click-outside dismiss)
   ============================================================ */

function openSettings() {
  state.settingsOpen = true;
  settingsPopover.classList.add('open');
  settingsBackdrop.classList.add('visible');
}

function closeSettings() {
  state.settingsOpen = false;
  settingsPopover.classList.remove('open');
  settingsBackdrop.classList.remove('visible');
}

function toggleSettings() {
  if (state.settingsOpen) {
    closeSettings();
  } else {
    openSettings();
  }
}

settingsBackdrop.addEventListener('click', () => {
  closeSettings();
});

/* ============================================================
   Status & UI Updates
   ============================================================ */

let statusHideTimer = null;

function showStatus(type, message) {
  clearTimeout(statusHideTimer);
  const icons = { error: '✕', success: '✓', warning: '⚠', info: 'ℹ' };
  statusMessage.className = `status-message ${type}`;
  statusIcon.textContent = icons[type] || '';
  statusText.textContent = message;

  requestAnimationFrame(() => {
    statusMessage.classList.add('visible');
    if (type === 'error') shakeElement(statusMessage);
  });

  if (type !== 'error') {
    statusHideTimer = setTimeout(() => hideStatus(), 8000);
  }
}

function hideStatus() {
  clearTimeout(statusHideTimer);
  statusMessage.classList.remove('visible');
}

function setDownloading(active) {
  state.isDownloading = active;

  downloadBtn.style.opacity = active ? '0' : '1';
  downloadBtn.style.pointerEvents = active ? 'none' : 'auto';
  downloadBtn.style.position = active ? 'absolute' : 'relative';
  downloadBtn.style.visibility = active ? 'hidden' : 'visible';

  cancelBtn.style.opacity = active ? '1' : '0';
  cancelBtn.style.pointerEvents = active ? 'auto' : 'none';
  cancelBtn.style.position = active ? 'relative' : 'absolute';
  cancelBtn.style.visibility = active ? 'visible' : 'hidden';

  progressWrapper.classList.toggle('visible', active);
  urlInput.disabled = active;
  startTime.disabled = active || !state.videoInfo;
  endTime.disabled = active || !state.videoInfo;

  if (active) {
    showActivity('Downloading…', '0%', 0);
  }

  if (!active) {
    progressFill.style.width = '0%';
    progressFill.classList.remove('complete');
    progressPercent.textContent = '0%';
    progressSpeed.textContent = '';
  }
}

function updateDownloadBtnState() {
  const hasVideo = !!state.videoInfo;
  const timeValid = validateClipTimes();
  downloadBtn.disabled = !hasVideo || !timeValid || state.isDownloading || state.isFetchingInfo;
}

function validateClipTimes() {
  const startSec = parseTimeToSeconds(startTime.value);
  const endSec = parseTimeToSeconds(endTime.value);

  startTime.classList.remove('error');
  endTime.classList.remove('error');

  if (startSec === 0 && endSec === 0) return true;

  if (state.videoInfo) {
    if (startSec > state.videoInfo.duration) {
      startTime.classList.add('error');
      shakeElement(startTime);
      return false;
    }
    if (endSec > state.videoInfo.duration && endSec !== 0) {
      endTime.classList.add('error');
      shakeElement(endTime);
      return false;
    }
  }

  if (endSec !== 0 && startSec >= endSec) {
    startTime.classList.add('error');
    endTime.classList.add('error');
    shakeElement(startTime);
    shakeElement(endTime);
    return false;
  }

  return true;
}

/* ============================================================
   Time Input Formatting
   ============================================================ */

function enforceTimeFormat(input) {
  input.addEventListener('input', () => {
    let val = input.value.replace(/[^0-9:]/g, '');
    input.value = val;
    updateDownloadBtnState();
  });

  input.addEventListener('blur', () => {
    let val = input.value.trim();
    if (!val) { input.value = '00:00:00'; return; }

    const nums = val.replace(/[^0-9]/g, '');
    if (nums.length <= 2) {
      input.value = `00:00:${nums.padStart(2, '0')}`;
    } else if (nums.length <= 4) {
      const s = nums.slice(-2);
      const m = nums.slice(0, -2).padStart(2, '0');
      input.value = `00:${m}:${s}`;
    } else {
      const s = nums.slice(-2);
      const m = nums.slice(-4, -2);
      const h = nums.slice(0, -4).padStart(2, '0');
      input.value = `${h}:${m}:${s}`;
    }
    updateDownloadBtnState();
  });
}

/* ============================================================
   URL Input & Video Info
   ============================================================ */

let fetchDebounce = null;

async function handleUrlChange() {
  const url = urlInput.value.trim();
  urlClear.classList.toggle('visible', url.length > 0);

  clearTimeout(fetchDebounce);

  if (!url) {
    urlRow.classList.remove('error');
    resetVideoState();
    return;
  }

  if (!isValidYouTubeURL(url)) {
    urlRow.classList.add('error');
    shakeElement(urlRow);
    urlHint.textContent = '';
    urlHint.classList.remove('clipboard');
    resetVideoState();
    return;
  }

  urlRow.classList.remove('error');

  fetchDebounce = setTimeout(() => fetchInfo(url), 300);
}

async function fetchInfo(url) {
  if (state.isFetchingInfo) return;
  state.isFetchingInfo = true;
  hideStatus();

  showActivity('Fetching video info…', '', 'indeterminate');

  videoCard.className = 'video-card visible loading';
  videoThumb.classList.add('loaded');
  videoTitle.textContent = 'Loading...';
  videoMeta.textContent = '';
  videoQualities.textContent = '';
  videoThumb.src = '';
  updateDownloadBtnState();

  try {
    const info = await window.api.fetchVideoInfo(url);
    state.videoInfo = info;

    videoThumb.classList.remove('loaded');
    videoThumb.src = info.thumbnail;
    videoThumb.onload = () => videoThumb.classList.add('loaded');
    videoTitle.textContent = info.title;
    videoMeta.textContent = `Duration: ${formatDuration(info.duration)}${info.uploader ? ` · ${info.uploader}` : ''}`;
    videoQualities.textContent = info.formats.length > 0
      ? `Available: ${info.formats.join(', ')}`
      : '';

    videoCard.className = 'video-card visible';
    startTime.disabled = false;
    endTime.disabled = false;
    updateDownloadBtnState();

    showActivity('Ready to download', info.title, 'complete');
    hideActivity(3000);
  } catch (err) {
    videoCard.className = 'video-card';
    state.videoInfo = null;
    showStatus('error', err.message || 'Failed to fetch video info.');
    updateDownloadBtnState();

    showActivity('Failed', err.message || 'Error fetching info', 0);
    hideActivity(4000);
  } finally {
    state.isFetchingInfo = false;
    updateDownloadBtnState();
  }
}

function resetVideoState() {
  state.videoInfo = null;
  videoCard.className = 'video-card';
  startTime.disabled = true;
  endTime.disabled = true;
  startTime.value = '00:00:00';
  endTime.value = '00:00:00';
  updateDownloadBtnState();
  hideActivity();
}

/* ============================================================
   Download
   ============================================================ */

async function handleDownload() {
  if (!state.videoInfo || state.isDownloading) return;

  hideStatus();
  setDownloading(true);

  try {
    await window.api.startDownload({
      url: urlInput.value.trim(),
      quality: state.selectedQuality,
      startTime: startTime.value,
      endTime: endTime.value,
      outputPath: state.downloadPath,
      title: state.videoInfo.title,
    });
  } catch (err) {
    showStatus('error', err.message || 'Download failed.');
    setDownloading(false);
    showActivity('Download failed', err.message || '', 0);
    hideActivity(4000);
  }
}

async function handleCancel() {
  try {
    await window.api.cancelDownload();
    setDownloading(false);
    showStatus('warning', 'Download cancelled.');
    showActivity('Cancelled', '', 0);
    hideActivity(3000);
    await window.api.cleanupPartialFiles(state.downloadPath);
  } catch { /* ignore */ }
}

/* ============================================================
   IPC Listeners
   ============================================================ */

window.api.onDownloadProgress((data) => {
  progressFill.style.width = `${data.percent}%`;
  progressPercent.textContent = `${Math.round(data.percent)}%`;
  progressSpeed.textContent = data.speed || '';

  showActivity('Downloading…', `${Math.round(data.percent)}%${data.speed ? ' · ' + data.speed : ''}`, data.percent);
});

window.api.onDownloadComplete((data) => {
  setDownloading(false);
  progressFill.style.width = '100%';
  progressFill.classList.add('complete');
  progressPercent.textContent = '100%';
  progressWrapper.classList.add('visible');

  state.lastDownloadedFile = data.filePath;
  const fileName = data.filePath ? data.filePath.split('/').pop() : 'Download complete';
  lastDownloadName.textContent = fileName;
  lastDownload.classList.add('visible');

  showStatus('success', 'Download complete!');
  showActivity('Complete', fileName, 'complete');
  hideActivity(5000);

  setTimeout(() => {
    progressWrapper.classList.remove('visible');
  }, 3000);
});

window.api.onDownloadError((data) => {
  setDownloading(false);
  showStatus('error', data.error || 'Download failed.');
  showActivity('Download failed', data.error || '', 0);
  hideActivity(4000);
});

/* ============================================================
   Clipboard Auto-Detect (guarded by autoPaste setting)
   ============================================================ */

window.api.onWindowFocus(async () => {
  if (!state.autoPaste) return;
  if (state.isDownloading || state.isFetchingInfo) return;
  try {
    const text = await window.api.getClipboard();
    if (text && isValidYouTubeURL(text) && text !== state.lastClipboardUrl && text !== urlInput.value.trim()) {
      state.lastClipboardUrl = text;
      urlInput.value = text;
      urlHint.textContent = 'Pasted from clipboard';
      urlHint.classList.add('clipboard');
      handleUrlChange();

      setTimeout(() => {
        if (urlHint.textContent === 'Pasted from clipboard') {
          urlHint.textContent = '';
          urlHint.classList.remove('clipboard');
        }
      }, 4000);
    }
  } catch { /* ignore clipboard errors */ }
});

/* ============================================================
   Drag & Drop
   ============================================================ */

let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('visible');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove('visible');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('visible');

  const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
  if (text && isValidYouTubeURL(text)) {
    urlInput.value = text.trim();
    handleUrlChange();
  }
});

/* ============================================================
   Quality Selector — with pill animation
   ============================================================ */

qualitySelector.addEventListener('click', (e) => {
  const option = e.target.closest('.quality-option');
  if (!option) return;

  qualitySelector.querySelectorAll('.quality-option').forEach(o => o.classList.remove('active'));
  option.classList.add('active');
  state.selectedQuality = option.dataset.quality;
  window.api.setSetting('quality', state.selectedQuality);

  updatePillPosition(true);
});

/* ============================================================
   Event Bindings
   ============================================================ */

urlInput.addEventListener('input', handleUrlChange);
urlInput.addEventListener('paste', () => setTimeout(handleUrlChange, 50));

urlClear.addEventListener('click', () => {
  urlInput.value = '';
  urlHint.textContent = '';
  urlHint.classList.remove('clipboard');
  urlRow.classList.remove('error');
  resetVideoState();
  hideStatus();
  urlClear.classList.remove('visible');
});

downloadBtn.addEventListener('click', handleDownload);
cancelBtn.addEventListener('click', handleCancel);

pathDisplay.addEventListener('click', async () => {
  const selected = await window.api.selectFolder();
  if (selected) {
    state.downloadPath = selected;
    pathDisplay.textContent = truncatePath(selected);
    pathDisplay.title = selected;
  }
});

revealBtn.addEventListener('click', async () => {
  if (!state.lastDownloadedFile) return;
  const result = await window.api.revealInFinder(state.lastDownloadedFile);
  if (!result.found) {
    showStatus('warning', 'File was moved or deleted. Opened download folder instead.');
  }
});

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSettings();
});

autoPasteToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  state.autoPaste = !state.autoPaste;
  autoPasteToggle.classList.toggle('active', state.autoPaste);
  window.api.setSetting('autoPaste', state.autoPaste);
});

enforceTimeFormat(startTime);
enforceTimeFormat(endTime);

updateYtdlpBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  updateYtdlpBtn.disabled = true;
  updateYtdlpBtn.textContent = 'Updating…';
  updateYtdlpBtn.classList.add('updating');
  try {
    const result = await window.api.updateYtdlp();
    if (result.success) {
      showStatus('success', `yt-dlp updated to ${result.version}`);
    } else {
      showStatus('error', `Update failed: ${result.error}`);
    }
  } catch (err) {
    showStatus('error', 'Failed to update yt-dlp.');
  } finally {
    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.textContent = 'Update yt-dlp';
    updateYtdlpBtn.classList.remove('updating');
  }
});

/* ============================================================
   History View
   ============================================================ */

function formatRelativeDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 5) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return date.toLocaleDateString();
}

function formatFullDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatUploadDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return '';
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

function qualityLabel(q) {
  if (q === 'best') return 'Best';
  if (q === 'hd') return '1080p';
  if (q === 'audio') return 'Audio';
  return q;
}

async function openHistory() {
  state.historyOpen = true;
  closeSettings();
  historyView.classList.add('visible');
  await loadHistory();
}

function closeHistory() {
  state.historyOpen = false;
  historyView.classList.remove('visible');
  historySearch.value = '';
  state.historySearchTerm = '';
}

async function loadHistory() {
  state.historyData = await window.api.getHistory();
  renderHistoryList();
}

function getFilteredHistory() {
  let entries = [...state.historyData];

  if (state.historyFilter === 'video') {
    entries = entries.filter(e => e.quality !== 'audio');
  } else if (state.historyFilter === 'audio') {
    entries = entries.filter(e => e.quality === 'audio');
  }

  if (state.historySearchTerm) {
    const term = state.historySearchTerm.toLowerCase();
    entries = entries.filter(e => {
      const searchable = [
        e.title, e.uploader, e.channel,
        e.webpageUrl, e.description,
        ...(e.tags || []), ...(e.categories || []),
      ].join(' ').toLowerCase();
      return searchable.includes(term);
    });
  }

  entries.sort((a, b) => {
    const da = new Date(a.downloadedAt);
    const db = new Date(b.downloadedAt);
    return state.historySortNewest ? db - da : da - db;
  });

  return entries;
}

function renderHistoryList() {
  const entries = getFilteredHistory();
  historyList.innerHTML = '';

  const count = entries.length;
  historyCount.textContent = `${count} download${count !== 1 ? 's' : ''}`;

  if (count === 0) {
    historyEmpty.classList.add('visible');
    historyList.style.display = 'none';
    return;
  }

  historyEmpty.classList.remove('visible');
  historyList.style.display = '';

  for (const entry of entries) {
    historyList.appendChild(createHistoryEntryEl(entry));
  }
}

function createHistoryEntryEl(entry) {
  const el = document.createElement('div');
  el.className = 'history-entry';
  el.dataset.id = entry.id;

  const clipInfo = (entry.clipStart && entry.clipStart !== '00:00:00') || (entry.clipEnd && entry.clipEnd !== '00:00:00')
    ? ` (clip ${entry.clipStart || '00:00:00'}–${entry.clipEnd || 'end'})`
    : '';

  const uploaderText = entry.uploader || entry.channel || '';
  const metaParts = [uploaderText, formatDuration(entry.duration) + clipInfo].filter(Boolean);

  const detailRows = [];

  if (entry.webpageUrl) {
    detailRows.push({ label: 'Source', value: entry.webpageUrl, copyable: true });
  }
  if (entry.channel || entry.uploader) {
    let channelVal = entry.channel || entry.uploader;
    if (entry.channelUrl) channelVal += ` (${entry.channelUrl})`;
    detailRows.push({ label: 'Channel', value: channelVal });
  }
  if (entry.uploadDate) {
    detailRows.push({ label: 'Uploaded', value: formatUploadDate(entry.uploadDate) });
  }
  detailRows.push({ label: 'Duration', value: formatDuration(entry.duration) + clipInfo });
  detailRows.push({ label: 'Quality', value: qualityLabel(entry.quality) + ' · ' + (entry.format || '').toUpperCase() });
  if (entry.viewCount != null) {
    detailRows.push({ label: 'Views', value: formatNumber(entry.viewCount) });
  }
  if (entry.likeCount != null) {
    detailRows.push({ label: 'Likes', value: formatNumber(entry.likeCount) });
  }
  if (entry.categories && entry.categories.length > 0) {
    detailRows.push({ label: 'Categories', value: entry.categories.join(', ') });
  }
  if (entry.tags && entry.tags.length > 0) {
    detailRows.push({ label: 'Tags', value: entry.tags.join(', ') });
  }
  if (entry.license) {
    detailRows.push({ label: 'License', value: entry.license });
  }
  if (entry.description) {
    detailRows.push({ label: 'Description', value: entry.description });
  }
  detailRows.push({ label: 'File', value: entry.filePath || '—', clickToReveal: !!entry.filePath });
  detailRows.push({ label: 'Size', value: formatFileSize(entry.fileSize) });
  detailRows.push({ label: 'Downloaded', value: formatFullDate(entry.downloadedAt) });

  const dlHtml = detailRows.map(r => {
    if (r.clickToReveal) {
      const display = truncatePath(r.value);
      return `<dt>${r.label}</dt><dd class="file-link" data-filepath="${escapeHtml(r.value)}" title="${escapeHtml(r.value)}">${escapeHtml(display)}</dd>`;
    }
    return `<dt>${r.label}</dt><dd${r.copyable ? ' class="copyable"' : ''}>${escapeHtml(r.value)}</dd>`;
  }).join('');

  el.innerHTML = `
    <div class="history-entry__header">
      <div class="history-entry__info">
        <div class="history-entry__title">${escapeHtml(entry.title)}</div>
        <div class="history-entry__meta">${escapeHtml(metaParts.join(' · '))}</div>
      </div>
      <span class="history-entry__quality">${qualityLabel(entry.quality)}</span>
      <span class="history-entry__date">${formatRelativeDate(entry.downloadedAt)}</span>
      <span class="history-entry__chevron">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
          <path d="M7.5 5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </div>
    <div class="history-entry__detail">
      <div class="history-entry__detail-divider"></div>
      <dl class="history-detail-grid">${dlHtml}</dl>
      <div class="history-entry__actions">
        <button class="history-action-btn history-action-btn--copy" data-action="copy">Copy URL</button>
        <button class="history-action-btn history-action-btn--delete" data-action="delete">Remove</button>
      </div>
    </div>
  `;

  const header = el.querySelector('.history-entry__header');
  header.addEventListener('click', () => {
    el.classList.toggle('expanded');
  });

  const fileLink = el.querySelector('.file-link');
  if (fileLink) {
    fileLink.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fp = fileLink.dataset.filepath;
      if (!fp) return;
      const result = await window.api.revealInFinder(fp);
      if (!result.found) {
        fileLink.classList.add('missing');
        fileLink.title = 'File was moved or deleted — opened download folder';
      }
    });
  }

  el.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (entry.webpageUrl) {
      navigator.clipboard.writeText(entry.webpageUrl);
      const btn = e.currentTarget;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy URL'; }, 1500);
    }
  });

  el.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.deleteHistoryEntry(entry.id);
    state.historyData = state.historyData.filter(h => h.id !== entry.id);
    renderHistoryList();
  });

  return el;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let historySearchDebounce = null;

historySearch.addEventListener('input', () => {
  clearTimeout(historySearchDebounce);
  historySearchDebounce = setTimeout(() => {
    state.historySearchTerm = historySearch.value.trim();
    renderHistoryList();
  }, 300);
});

historyBtn.addEventListener('click', () => {
  openHistory();
});

historyBack.addEventListener('click', () => {
  closeHistory();
});

historyClearBtn.addEventListener('click', async () => {
  if (state.historyData.length === 0) return;
  await window.api.clearHistory();
  state.historyData = [];
  renderHistoryList();
});

historySortBtn.addEventListener('click', () => {
  state.historySortNewest = !state.historySortNewest;
  historySortBtn.textContent = state.historySortNewest ? 'Newest first' : 'Oldest first';
  renderHistoryList();
});

document.querySelector('.history-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.history-filter');
  if (!btn) return;
  document.querySelectorAll('.history-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.historyFilter = btn.dataset.filter;
  renderHistoryList();
});

/* ============================================================
   Init
   ============================================================ */

async function init() {
  const [settings, version] = await Promise.all([
    window.api.getSettings(),
    window.api.getAppVersion(),
  ]);

  state.downloadPath = settings.downloadPath;
  state.selectedQuality = settings.quality || 'best';
  state.autoPaste = settings.autoPaste !== false;
  pathDisplay.textContent = truncatePath(settings.downloadPath);
  pathDisplay.title = settings.downloadPath;
  appVersion.textContent = `v${version}`;

  autoPasteToggle.classList.toggle('active', state.autoPaste);

  const qualityBtns = qualitySelector.querySelectorAll('.quality-option');
  qualityBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.quality === state.selectedQuality);
  });

  updateDownloadBtnState();

  requestAnimationFrame(() => {
    updatePillPosition(false);
  });

  window.addEventListener('resize', () => updatePillPosition(false));

  try {
    const update = await window.api.checkAppUpdate();
    if (update.available) {
      showStatus('info', `New version v${update.version} available! Open Settings to update.`);
    }
  } catch { /* no update check errors shown */ }
}

init();
