/* ============================================================
   State
   ============================================================ */

const state = {
  videoInfo: null,
  downloads: new Map(),
  isFetchingInfo: false,
  lastDownloadedFile: null,
  selectedQuality: 'best',
  downloadPath: '',
  lastClipboardUrl: '',
  settingsOpen: false,
  autoPaste: true,
  showInFinder: false,
  queueOpen: false,
  historyOpen: false,
  historyData: [],
  historyFilter: 'all',
  historySortNewest: true,
  historySearchTerm: '',
  carouselData: null,
  carouselSelected: new Set(),
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
const statusMessage = $('#statusMessage');
const statusIcon = $('#statusIcon');
const statusText = $('#statusText');
const dropOverlay = $('#dropOverlay');
const settingsBtn = $('#settingsBtn');
const settingsPopover = $('#settingsPopover');
const settingsBackdrop = $('#settingsBackdrop');
const autoPasteToggle = $('#autoPasteToggle');
const showInFinderToggle = $('#showInFinderToggle');
const updateYtdlpBtn = $('#updateYtdlpBtn');
const appVersion = $('#appVersion');
const appUpdateBtn = $('#appUpdateBtn');
const historyBtn = $('#historyBtn');
const historyView = $('#historyView');
const historyBack = $('#historyBack');
const historyClearBtn = $('#historyClearBtn');
const historySearch = $('#historySearch');
const historyList = $('#historyList');
const historyEmpty = $('#historyEmpty');
const historyCount = $('#historyCount');
const historySortBtn = $('#historySortBtn');
const queueBtn = $('#queueBtn');
const queuePanel = $('#queuePanel');
const queueList = $('#queueList');
const queueEmpty = $('#queueEmpty');
const queueBadge = $('#queueBadge');
const queueClearDone = $('#queueClearDone');
const queueBackdrop = $('#queueBackdrop');
const carouselCard = $('#carouselCard');
const carouselTitle = $('#carouselTitle');
const carouselGrid = $('#carouselGrid');
const carouselSelectAll = $('#carouselSelectAll');
const carouselCount = $('#carouselCount');
const statusRetry = $('#statusRetry');
const statusCopy = $('#statusCopy');
const btnHint = $('#btnHint');

/* ============================================================
   Helpers
   ============================================================ */

// SYNC: These regexes are duplicated from src/utils.js for instant UI feedback (no IPC round-trip).
// If you change them here, update the utils.js copy too.
const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const INSTAGRAM_URL_REGEX = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv|stories|share)\/[\w.-]+/;
const TIKTOK_URL_REGEX = /^https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/@[\w.-]+\/(?:video|photo)\/\d+|^https?:\/\/(?:vm|vt)\.tiktok\.com\/[\w]+|^https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/t\/[\w]+/;

function isValidYouTubeURL(url) {
  return YOUTUBE_URL_REGEX.test(url.trim());
}

function isValidURL(url) {
  const trimmed = url.trim();
  return YOUTUBE_URL_REGEX.test(trimmed) || INSTAGRAM_URL_REGEX.test(trimmed) || TIKTOK_URL_REGEX.test(trimmed);
}

function detectPlatform(url) {
  const trimmed = url.trim();
  if (YOUTUBE_URL_REGEX.test(trimmed)) return 'youtube';
  if (INSTAGRAM_URL_REGEX.test(trimmed)) return 'instagram';
  if (TIKTOK_URL_REGEX.test(trimmed)) return 'tiktok';
  return null;
}

function isTiktokPhotoUrl(url) {
  return /\/photo\//.test(url.trim());
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
   Download Queue — panel, progress managers, rendering
   ============================================================ */

const MAX_CONCURRENT = 5;
const queueElements = new Map();
const progressManagers = new Map();

function createProgressManager(fillEl) {
  let raf = null, current = 0, target = 0, trickle = null, active = false, gotReal = false;

  function tick() {
    if (!active) return;
    const diff = target - current;
    if (Math.abs(diff) > 0.1) {
      current += diff * (diff > 5 ? 0.08 : 0.04);
    } else {
      current = target;
    }
    fillEl.style.width = `${current}%`;
    if (current >= 99.9) { fillEl.style.width = '100%'; current = 100; return; }
    raf = requestAnimationFrame(tick);
  }

  return {
    start() {
      this.stop();
      active = true; current = 0; target = 1.5; gotReal = false;
      fillEl.className = 'queue-item__fill downloading';
      fillEl.style.width = '0%';
      trickle = setInterval(() => {
        if (!gotReal && target < 14) target += 0.3 + Math.random() * 0.5;
      }, 250);
      tick();
    },
    set(percent) {
      if (!active) return;
      if (!gotReal) { gotReal = true; clearInterval(trickle); }
      target = Math.max(target, Math.min(percent, 96));
    },
    finish() { clearInterval(trickle); trickle = null; target = 100; },
    stop() {
      active = false; clearInterval(trickle);
      if (raf) cancelAnimationFrame(raf);
      raf = null; trickle = null; current = 0; target = 0;
    },
  };
}

function openQueue() {
  state.queueOpen = true;
  queuePanel.classList.add('open');
  queueBackdrop.classList.add('visible');
  closeSettings();
}

function closeQueue() {
  state.queueOpen = false;
  queuePanel.classList.remove('open');
  queueBackdrop.classList.remove('visible');
}

function toggleQueue() {
  if (state.queueOpen) closeQueue(); else openQueue();
}

function updateQueueBadge() {
  const active = [...state.downloads.values()].filter(d => d.status === 'preparing' || d.status === 'downloading').length;
  if (active > 0) {
    const prev = queueBadge.textContent;
    queueBadge.textContent = active;
    queueBadge.classList.add('visible');
    if (prev !== String(active)) {
      queueBadge.classList.remove('pop');
      void queueBadge.offsetWidth;
      queueBadge.classList.add('pop');
      queueBadge.addEventListener('animationend', () => queueBadge.classList.remove('pop'), { once: true });
    }
  } else {
    queueBadge.classList.remove('visible');
  }
}

function updateQueueEmpty() {
  const hasItems = state.downloads.size > 0;
  queueEmpty.classList.toggle('visible', !hasItems);
  queueList.style.display = hasItems ? '' : 'none';
  const hasDone = [...state.downloads.values()].some(d =>
    d.status === 'complete' || d.status === 'error' || d.status === 'cancelled'
  );
  queueClearDone.style.display = hasDone ? '' : 'none';
}

function addDownloadToQueue(id, title, quality) {
  state.downloads.set(id, {
    id, title, quality,
    percent: 0, speed: '', status: 'preparing',
    filePath: '', error: '',
  });

  const el = document.createElement('div');
  el.className = 'queue-item preparing';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="queue-item__row">
      <span class="queue-item__title">${escapeHtml(title)}</span>
      <button class="queue-item__action" aria-label="Cancel">✕</button>
    </div>
    <div class="queue-item__bar">
      <div class="queue-item__fill downloading"></div>
    </div>
    <div class="queue-item__row">
      <span class="queue-item__detail">Preparing, hold your goddamn horses...</span>
      <span class="queue-item__quality">${escapeHtml(qualityLabel(quality))}</span>
    </div>
  `;

  queueList.prepend(el);
  queueElements.set(id, el);

  const fillEl = el.querySelector('.queue-item__fill');
  const pm = createProgressManager(fillEl);
  progressManagers.set(id, pm);
  pm.start();

  queueBtn.classList.add('nudge');
  queueBtn.addEventListener('animationend', () => queueBtn.classList.remove('nudge'), { once: true });

  updateQueueBadge();
  updateQueueEmpty();
}

function updateQueueItem(id) {
  const dl = state.downloads.get(id);
  const el = queueElements.get(id);
  if (!dl || !el) return;

  el.className = `queue-item ${dl.status}`;
  const detail = el.querySelector('.queue-item__detail');
  const fill = el.querySelector('.queue-item__fill');

  switch (dl.status) {
    case 'preparing':
      detail.textContent = 'Preparing, hold your goddamn horses...';
      break;
    case 'downloading':
      if (dl.percent >= 99.5) {
        fill.classList.add('processing');
        detail.textContent = 'Processing clip, sit your ass down...';
      } else {
        fill.classList.remove('processing');
        detail.textContent = `${Math.round(dl.percent)}%${dl.speed ? ' · ' + dl.speed : ''}`;
      }
      break;
    case 'complete': {
      fill.className = 'queue-item__fill complete';
      fill.style.width = '100%';
      const svg = '<svg class="check-icon" viewBox="0 0 12 12"><circle cx="6" cy="6" r="6"/><path d="M3.5 6.5l2 2 3-4"/></svg>';
      detail.innerHTML = svg + 'Done, you lucky bastard';
      if (!el.querySelector('.queue-item__show-file')) {
        const btn = document.createElement('button');
        btn.className = 'queue-item__show-file';
        btn.textContent = 'Show File';
        detail.parentNode.appendChild(btn);
      }
      break;
    }
    case 'error':
      fill.className = 'queue-item__fill error';
      detail.textContent = dl.error || 'Failed miserably';
      detail.title = dl.error || '';
      break;
    case 'cancelled':
      fill.className = 'queue-item__fill cancelled';
      detail.textContent = 'Cancelled, you indecisive clown';
      break;
  }

  updateQueueBadge();
  updateQueueEmpty();
}

function removeQueueItem(id) {
  progressManagers.get(id)?.stop();
  progressManagers.delete(id);
  state.downloads.delete(id);
  const el = queueElements.get(id);
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
    el.style.transition = 'opacity 200ms, transform 200ms';
    setTimeout(() => el.remove(), 200);
  }
  queueElements.delete(id);
  updateQueueBadge();
  setTimeout(() => updateQueueEmpty(), 220);
}

function clearDoneDownloads() {
  const toRemove = [];
  for (const [id, dl] of state.downloads) {
    if (dl.status === 'complete' || dl.status === 'error' || dl.status === 'cancelled') {
      toRemove.push(id);
    }
  }
  toRemove.forEach(id => removeQueueItem(id));
}

queueList.addEventListener('click', (e) => {
  const actionBtn = e.target.closest('.queue-item__action');
  if (actionBtn) {
    const item = actionBtn.closest('.queue-item');
    const id = item?.dataset.id;
    if (!id) return;
    const dl = state.downloads.get(id);
    if (dl && (dl.status === 'preparing' || dl.status === 'downloading')) {
      if (dl.isCarousel) {
        const tracker = activeCarouselDownloads.get(id);
        if (tracker) tracker.cancelled = true;
      } else {
        window.api.cancelDownload(id);
      }
    } else {
      removeQueueItem(id);
    }
    return;
  }
  const showFileBtn = e.target.closest('.queue-item__show-file');
  if (showFileBtn) {
    const item = showFileBtn.closest('.queue-item');
    const id = item?.dataset.id;
    const dl = state.downloads.get(id);
    if (dl?.filePath) {
      window.api.revealInFinder(dl.filePath).then(result => {
        if (!result.found) {
          showStatus('warning', 'File vanished, you probably deleted it yourself. Opened the folder instead.');
        }
      });
    }
  }
});

queueBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleQueue();
});

queueBackdrop.addEventListener('click', () => closeQueue());
queueClearDone.addEventListener('click', () => clearDoneDownloads());

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
  closeQueue();
  settingsPopover.classList.add('open');
  settingsBackdrop.classList.add('visible');
  settingsBtn.closest('.settings-anchor').classList.add('open');
}

function closeSettings() {
  state.settingsOpen = false;
  settingsPopover.classList.remove('open');
  settingsBackdrop.classList.remove('visible');
  settingsBtn.closest('.settings-anchor').classList.remove('open');
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
   Meme Sticker
   ============================================================ */

const memeSticker = $('#memeSticker');

const STICKERS = {
  default: ['stickers/Default.avif', 'stickers/Default.png'],
  good: [
    'stickers/good1.avif',  'stickers/good2.avif',  'stickers/good3.avif',
    'stickers/good4.avif',  'stickers/good5.avif',  'stickers/good6.avif',
    'stickers/good7.avif',  'stickers/good8.avif',  'stickers/good9.avif',
    'stickers/good10.avif', 'stickers/good11.avif', 'stickers/good12.avif',
    'stickers/good13.webp',
  ],
  bad: [
    'stickers/bad1.avif', 'stickers/bad2.avif', 'stickers/bad3.avif',
    'stickers/bad4.avif', 'stickers/bad.webp',  'stickers/bad5.webp',
    'stickers/bad6.webp',
  ],
};

function setSticker(type) {
  const pool = STICKERS[type] || STICKERS.default;
  const src = pool[Math.floor(Math.random() * pool.length)];

  memeSticker.classList.add('swap-out');
  setTimeout(() => {
    memeSticker.src = src;
    memeSticker.classList.remove('swap-out');
    memeSticker.classList.add('swap-in');
    memeSticker.addEventListener('animationend', () => {
      memeSticker.classList.remove('swap-in');
    }, { once: true });
  }, 150);
}

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
  if (type !== 'error') statusRetry.style.display = 'none';

  requestAnimationFrame(() => {
    statusMessage.classList.add('visible');
  });

  if (type === 'success') setSticker('good');
  else if (type === 'error') setSticker('bad');
  else if (type === 'warning') setSticker('bad');

  if (type !== 'error') {
    statusHideTimer = setTimeout(() => hideStatus(), 8000);
  }
}

function hideStatus() {
  clearTimeout(statusHideTimer);
  statusMessage.classList.remove('visible');
}

statusCopy.addEventListener('click', async () => {
  const text = statusText.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  const orig = statusCopy.textContent;
  statusCopy.textContent = 'Copied!';
  setTimeout(() => { statusCopy.textContent = orig; }, 1500);
});

function updateDownloadBtnState() {
  if (state.carouselData) {
    downloadBtn.disabled = state.carouselSelected.size === 0 || state.isFetchingInfo;
    return;
  }
  const hasVideo = !!state.videoInfo;
  const timeValid = validateClipTimes();
  downloadBtn.disabled = !hasVideo || !timeValid || state.isFetchingInfo;
}

function getDownloadDisabledReason() {
  if (state.carouselData) {
    if (state.isFetchingInfo) return 'Hold on, fetching...';
    if (state.carouselSelected.size === 0) return 'Select items to download';
  }
  if (state.isFetchingInfo) return 'Hold on, fetching video info...';
  if (!state.videoInfo) return 'Paste a URL first';
  if (!validateClipTimes()) return 'Fix clip times (start must be before end)';
  return 'Not ready yet';
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
    let h = 0, m = 0, s = 0;
    if (nums.length <= 2) {
      s = Math.min(parseInt(nums, 10) || 0, 59);
    } else if (nums.length <= 4) {
      s = Math.min(parseInt(nums.slice(-2), 10) || 0, 59);
      m = Math.min(parseInt(nums.slice(0, -2), 10) || 0, 59);
    } else {
      s = Math.min(parseInt(nums.slice(-2), 10) || 0, 59);
      m = Math.min(parseInt(nums.slice(-4, -2), 10) || 0, 59);
      h = parseInt(nums.slice(0, -4), 10) || 0;
    }
    input.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  const platform = detectPlatform(url);
  if (!platform) {
    urlRow.classList.add('error');
    shakeElement(urlRow);
    urlHint.textContent = '';
    urlHint.classList.remove('clipboard');
    resetVideoState();
    return;
  }

  if (platform === 'tiktok' && isTiktokPhotoUrl(url)) {
    showStatus('warning', 'TikTok photo slideshows aren\'t supported yet. Video posts work great though!');
    resetVideoState();
    return;
  }

  urlRow.classList.remove('error');

  if (platform === 'instagram') {
    fetchDebounce = setTimeout(() => fetchInstagramContent(url), 300);
  } else {
    fetchDebounce = setTimeout(() => fetchInfo(url), 300);
  }
}

async function fetchInfo(url) {
  if (state.isFetchingInfo) return;
  state.isFetchingInfo = true;
  hideStatus();
  statusRetry.style.display = 'none';
  hideCarousel();

  urlHint.textContent = 'Scanning the goddamn link...';
  urlHint.classList.remove('clipboard');
  downloadBtn.textContent = 'Download This Shit';

  videoCard.className = 'video-card visible loading';
  videoThumb.classList.remove('loaded');
  videoThumb.removeAttribute('src');
  videoTitle.textContent = 'Loading...';
  videoMeta.textContent = '';
  videoQualities.textContent = '';
  updateDownloadBtnState();

  try {
    const info = await window.api.fetchVideoInfo(url);
    state.videoInfo = info;

    videoThumb.classList.remove('loaded');
    videoThumb.src = info.thumbnail;
    videoThumb.onload = () => videoThumb.classList.add('loaded');
    videoTitle.textContent = info.title;

    const platformLabel = info.platform && info.platform !== 'youtube'
      ? info.platform.charAt(0).toUpperCase() + info.platform.slice(1) + ' · ' : '';
    const sizeLabel = info.estimatedFileSize ? ` · ~${formatFileSize(info.estimatedFileSize)}` : '';
    const isImage = info.mediaType === 'image';
    const durationPart = isImage ? 'Image' : `Duration: ${formatDuration(info.duration)}`;
    videoMeta.textContent = `${platformLabel}${durationPart}${info.uploader ? ` · ${info.uploader}` : ''}${sizeLabel}`;

    videoQualities.textContent = info.formats.length > 0
      ? `Available: ${info.formats.join(', ')}`
      : '';

    videoCard.className = 'video-card visible';

    const isYouTube = info.platform === 'youtube' || !info.platform;
    startTime.disabled = !isYouTube;
    endTime.disabled = !isYouTube;
    if (isImage) downloadBtn.textContent = 'Download Image';
    updateQualityLabels(info.platform, info.mediaType);
    updateDownloadBtnState();

    urlHint.textContent = 'Locked in. Ready to rip.';
    urlHint.classList.add('clipboard');
    setTimeout(() => {
      if (urlHint.textContent === 'Locked in. Ready to rip.') {
        urlHint.textContent = '';
        urlHint.classList.remove('clipboard');
      }
    }, 3000);
  } catch (err) {
    videoCard.className = 'video-card';
    state.videoInfo = null;
    showStatus('error', err.message || 'Failed to fetch video info.');
    lastFailedUrl = url;
    statusRetry.style.display = '';
    updateDownloadBtnState();

    urlHint.textContent = '';
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
  hideCarousel();
  resetQualityLabels();
  updateDownloadBtnState();
}

let lastFailedUrl = '';

/* ============================================================
   Instagram Content Fetching (media-fetcher + yt-dlp fallback)
   ============================================================ */

async function fetchInstagramContent(url) {
  if (state.isFetchingInfo) return;
  state.isFetchingInfo = true;
  hideStatus();
  statusRetry.style.display = 'none';
  hideCarousel();

  urlHint.textContent = 'Checking Instagram post...';
  urlHint.classList.remove('clipboard');
  updateDownloadBtnState();

  try {
    const mediaInfo = await window.api.fetchMediaInfo(url);

    if (mediaInfo && mediaInfo.items && mediaInfo.items.length > 0) {
      if (mediaInfo.isCarousel && mediaInfo.items.length > 1) {
        showCarouselPicker(mediaInfo, url);
        updateQualityLabels('instagram', 'carousel');
        urlHint.textContent = 'Select items to download';
        urlHint.classList.add('clipboard');

        if (!mediaInfo.items.some(i => i.type === 'video')) {
          fetchAndMergeCarouselVideos(url);
        }
        return;
      }

      const singleItem = mediaInfo.items[0];

      if (singleItem.type === 'video') {
        showSingleVideoCard(mediaInfo, url);
        updateQualityLabels('instagram', 'video');
        urlHint.textContent = 'Reel ready to download';
        urlHint.classList.add('clipboard');
        return;
      }

      showSingleImageCard(mediaInfo, url);
      updateQualityLabels('instagram', 'image');
      urlHint.textContent = 'Image ready to download';
      urlHint.classList.add('clipboard');
      return;
    }

    showStatus('error', 'Couldn\'t fetch this Instagram post. It may be private or require login.');
    lastFailedUrl = url;
    statusRetry.style.display = '';
  } catch (err) {
    showStatus('error', err.message || 'Failed to fetch Instagram content. It may be private or require login.');
    lastFailedUrl = url;
    statusRetry.style.display = '';
  } finally {
    state.isFetchingInfo = false;
    updateDownloadBtnState();
  }
}

function fetchAndMergeCarouselVideos(url) {
  window.api.fetchCarouselVideos(url).then((videos) => {
    if (!state.carouselData || !videos || videos.length === 0) return;
    if (state.carouselData.webpageUrl !== url) return;

    for (const vid of videos) {
      state.carouselData.items.push(vid);
    }

    const total = state.carouselData.items.length;
    carouselTitle.textContent = `@${state.carouselData.owner || 'unknown'} · ${total} items`;

    for (let i = state.carouselData.items.length - videos.length; i < total; i++) {
      const item = state.carouselData.items[i];
      appendCarouselThumb(item, i);
    }

    updateCarouselCount();
    urlHint.textContent = `Found ${videos.length} video${videos.length > 1 ? 's' : ''} — ${total} items total`;
    urlHint.classList.add('clipboard');
  }).catch(() => { /* yt-dlp failed silently, images-only carousel is fine */ });
}

function showSingleImageCard(mediaInfo, webpageUrl) {
  const item = mediaInfo.items[0];

  state.videoInfo = {
    id: '',
    title: mediaInfo.caption ? mediaInfo.caption.slice(0, 80) : `Instagram post by @${mediaInfo.owner || 'unknown'}`,
    duration: 0,
    thumbnail: item.thumbnail || item.url,
    isLive: false,
    formats: [],
    uploader: mediaInfo.owner || '',
    platform: 'instagram',
    mediaType: 'image',
    _imageUrl: item.url,
    _webpageUrl: webpageUrl,
    _caption: mediaInfo.caption || '',
    _owner: mediaInfo.owner || '',
  };

  videoThumb.classList.remove('loaded');
  videoThumb.src = item.thumbnail || item.url;
  videoThumb.onload = () => videoThumb.classList.add('loaded');
  videoTitle.textContent = state.videoInfo.title;
  videoMeta.textContent = `Instagram · @${mediaInfo.owner || 'unknown'} · Image`;
  videoQualities.textContent = item.width && item.height ? `${item.width}×${item.height}` : '';

  videoCard.className = 'video-card visible';
  startTime.disabled = true;
  endTime.disabled = true;
  downloadBtn.disabled = false;
  downloadBtn.textContent = 'Download Image';
}

function showSingleVideoCard(mediaInfo, webpageUrl) {
  const item = mediaInfo.items[0];

  state.videoInfo = {
    id: '',
    title: mediaInfo.caption ? mediaInfo.caption.slice(0, 80) : `Instagram reel by @${mediaInfo.owner || 'unknown'}`,
    duration: 0,
    thumbnail: item.thumbnail || '',
    isLive: false,
    formats: [],
    uploader: mediaInfo.owner || '',
    platform: 'instagram',
    mediaType: 'video',
    _directVideoUrl: item.url,
    _webpageUrl: webpageUrl,
    _caption: mediaInfo.caption || '',
    _owner: mediaInfo.owner || '',
  };

  videoThumb.classList.remove('loaded');
  if (item.thumbnail) {
    videoThumb.src = item.thumbnail;
    videoThumb.onload = () => videoThumb.classList.add('loaded');
  }
  videoTitle.textContent = state.videoInfo.title;
  videoMeta.textContent = `Instagram · @${mediaInfo.owner || 'unknown'} · Reel`;
  videoQualities.textContent = item.width && item.height ? `${item.width}×${item.height}` : '';

  videoCard.className = 'video-card visible';
  startTime.disabled = true;
  endTime.disabled = true;
  downloadBtn.disabled = false;
  downloadBtn.textContent = 'Download Reel';
}

/* ============================================================
   Carousel Picker
   ============================================================ */

function showCarouselPicker(data, webpageUrl) {
  state.carouselData = { ...data, webpageUrl };
  state.carouselSelected = new Set();

  carouselTitle.textContent = `@${data.owner || 'unknown'} · ${data.items.length} items`;
  carouselGrid.innerHTML = '';

  data.items.forEach((item, i) => {
    state.carouselSelected.add(i);
    appendCarouselThumb(item, i, true);
  });

  carouselCard.classList.add('visible');
  videoCard.className = 'video-card';
  state.videoInfo = null;
  updateCarouselCount();
  updateDownloadBtnState();
}

function appendCarouselThumb(item, i, selected = false) {
  const thumb = document.createElement('div');
  thumb.className = `carousel-thumb loading${selected ? ' selected' : ''}`;
  thumb.dataset.index = i;
  thumb.innerHTML = `
    <span class="carousel-thumb__check">✓</span>
    <span class="carousel-thumb__type">${item.type === 'video' ? 'VID' : 'IMG'}</span>
  `;

  const thumbUrl = item.thumbnail || item.url;
  if (thumbUrl) {
    window.api.proxyImage(thumbUrl).then((dataUri) => {
      if (dataUri) {
        thumb.style.backgroundImage = `url("${dataUri}")`;
      }
      thumb.classList.remove('loading');
    }).catch(() => {
      thumb.classList.remove('loading');
    });
  } else {
    thumb.classList.remove('loading');
  }

  thumb.addEventListener('click', () => {
    if (state.carouselSelected.has(i)) {
      state.carouselSelected.delete(i);
      thumb.classList.remove('selected');
    } else {
      state.carouselSelected.add(i);
      thumb.classList.add('selected');
    }
    updateCarouselCount();
  });

  carouselGrid.appendChild(thumb);
}

function updateCarouselCount() {
  const count = state.carouselSelected.size;
  const total = state.carouselData?.items?.length || 0;
  carouselCount.textContent = `${count} of ${total} selected`;

  downloadBtn.disabled = count === 0;
  downloadBtn.textContent = count > 0 ? `Download ${count} Item${count > 1 ? 's' : ''}` : 'Download This Shit';

  carouselSelectAll.textContent = count === total ? 'Deselect All' : 'Select All';
}

function hideCarousel() {
  carouselCard.classList.remove('visible');
  state.carouselData = null;
  state.carouselSelected = new Set();
  downloadBtn.textContent = 'Download This Shit';
}

carouselSelectAll.addEventListener('click', () => {
  if (!state.carouselData) return;
  const total = state.carouselData.items.length;

  if (state.carouselSelected.size === total) {
    state.carouselSelected.clear();
    carouselGrid.querySelectorAll('.carousel-thumb').forEach(t => t.classList.remove('selected'));
  } else {
    for (let i = 0; i < total; i++) state.carouselSelected.add(i);
    carouselGrid.querySelectorAll('.carousel-thumb').forEach(t => t.classList.add('selected'));
  }
  updateCarouselCount();
});

const activeCarouselDownloads = new Map();

async function handleCarouselDownload() {
  if (!state.carouselData || state.carouselSelected.size === 0) return;

  downloadBtn.disabled = true;
  const data = state.carouselData;
  const selected = [...state.carouselSelected].sort((a, b) => a - b);
  const total = selected.length;
  const title = data.caption
    ? data.caption.slice(0, 60)
    : `@${data.owner || 'unknown'} carousel`;
  const queueId = `carousel-${Date.now()}`;

  const carouselGroupId = queueId;

  state.downloads.set(queueId, {
    id: queueId, title, quality: 'best',
    percent: 0, speed: '', status: 'downloading',
    filePath: '', error: '', isCarousel: true,
    carouselTotal: total, carouselDone: 0, carouselErrors: 0,
  });

  const el = document.createElement('div');
  el.className = 'queue-item downloading';
  el.dataset.id = queueId;
  el.innerHTML = `
    <div class="queue-item__row">
      <span class="queue-item__title">${escapeHtml(title)}</span>
      <button class="queue-item__action" aria-label="Cancel">✕</button>
    </div>
    <div class="queue-item__bar">
      <div class="queue-item__fill downloading" style="width: 0%"></div>
    </div>
    <div class="queue-item__row">
      <span class="queue-item__detail">0 of ${total} items...</span>
      <span class="queue-item__quality">${total} items</span>
    </div>
  `;

  queueList.prepend(el);
  queueElements.set(queueId, el);

  queueBtn.classList.add('nudge');
  queueBtn.addEventListener('animationend', () => queueBtn.classList.remove('nudge'), { once: true });
  if (!state.queueOpen) openQueue();
  updateQueueBadge();
  updateQueueEmpty();

  activeCarouselDownloads.set(queueId, { cancelled: false });

  let downloadedCount = 0;
  let errorCount = 0;
  const filePaths = [];

  for (const idx of selected) {
    const tracker = activeCarouselDownloads.get(queueId);
    if (tracker?.cancelled) break;

    const item = data.items[idx];
    if (!item) continue;

    const baseName = data.owner
      ? `${data.owner}_${idx + 1}`
      : `instagram_${idx + 1}`;

    try {
      const result = await window.api.downloadImage({
        url: item.url,
        filename: baseName,
        title: data.caption ? data.caption.slice(0, 80) : `Instagram post by @${data.owner}`,
        postOwner: data.owner,
        caption: data.caption,
        webpageUrl: data.webpageUrl,
        outputPath: state.downloadPath,
        mediaType: item.type,
        carouselGroupId,
      });
      downloadedCount++;
      if (result?.filePath) filePaths.push(result.filePath);
    } catch (err) {
      errorCount++;
    }

    const done = downloadedCount + errorCount;
    const pct = Math.round((done / total) * 100);
    const dl = state.downloads.get(queueId);
    if (dl) {
      dl.percent = pct;
      dl.carouselDone = downloadedCount;
      dl.carouselErrors = errorCount;
    }

    const fill = el.querySelector('.queue-item__fill');
    const detail = el.querySelector('.queue-item__detail');
    if (fill) fill.style.width = `${pct}%`;
    if (detail) detail.textContent = `${done} of ${total} items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`;
  }

  activeCarouselDownloads.delete(queueId);

  const dl = state.downloads.get(queueId);
  const wasCancelled = activeCarouselDownloads.get(queueId)?.cancelled;

  if (wasCancelled) {
    if (dl) dl.status = 'cancelled';
    const detail = el.querySelector('.queue-item__detail');
    const fill = el.querySelector('.queue-item__fill');
    if (fill) fill.className = 'queue-item__fill cancelled';
    if (detail) detail.textContent = `Cancelled — ${downloadedCount} of ${total} saved`;
    el.className = 'queue-item cancelled';
  } else if (errorCount > 0 && downloadedCount === 0) {
    if (dl) { dl.status = 'error'; dl.error = `All ${errorCount} items failed`; }
    const detail = el.querySelector('.queue-item__detail');
    const fill = el.querySelector('.queue-item__fill');
    if (fill) fill.className = 'queue-item__fill error';
    if (detail) detail.textContent = `All ${errorCount} items failed`;
    el.className = 'queue-item error';
  } else {
    if (dl) { dl.status = 'complete'; dl.percent = 100; dl.filePath = filePaths[0] || ''; }
    const detail = el.querySelector('.queue-item__detail');
    const fill = el.querySelector('.queue-item__fill');
    if (fill) { fill.className = 'queue-item__fill complete'; fill.style.width = '100%'; }
    const svg = '<svg class="check-icon" viewBox="0 0 12 12"><circle cx="6" cy="6" r="6"/><path d="M3.5 6.5l2 2 3-4"/></svg>';
    if (detail) detail.innerHTML = svg + `${downloadedCount} of ${total} saved${errorCount > 0 ? ` (${errorCount} failed)` : ''}`;
    el.className = 'queue-item complete';

    if (filePaths.length > 0 && !el.querySelector('.queue-item__show-file')) {
      const btn = document.createElement('button');
      btn.className = 'queue-item__show-file';
      btn.textContent = 'Show Files';
      detail.parentNode.appendChild(btn);
    }
  }

  updateQueueBadge();
  updateQueueEmpty();
  downloadBtn.disabled = false;
  updateDownloadBtnState();

  if (errorCount > 0 && downloadedCount > 0) {
    showStatus('warning', `Downloaded ${downloadedCount} items, ${errorCount} failed.`);
    window.api.showNotification('Carousel partially done', `${downloadedCount} of ${total} saved`, filePaths[0] || '');
  } else if (errorCount > 0 && downloadedCount === 0) {
    showStatus('error', `Failed to download all ${errorCount} items.`);
  } else {
    showStatus('success', `Downloaded ${downloadedCount} item${downloadedCount > 1 ? 's' : ''}.`);
    window.api.showNotification('Carousel downloaded, you absolute legend', `${downloadedCount} item${downloadedCount > 1 ? 's' : ''} saved`, filePaths[0] || '');
  }
}

/* ============================================================
   Retry Button
   ============================================================ */

statusRetry.addEventListener('click', () => {
  if (lastFailedUrl) {
    state.isFetchingInfo = false;
    hideStatus();
    statusRetry.style.display = 'none';
    const platform = detectPlatform(lastFailedUrl);
    if (platform === 'instagram') {
      fetchInstagramContent(lastFailedUrl);
    } else {
      fetchInfo(lastFailedUrl);
    }
  }
});

/* ============================================================
   Download
   ============================================================ */

async function handleDownload() {
  if (state.carouselData && state.carouselSelected.size > 0) {
    await handleCarouselDownload();
    return;
  }

  if (!state.videoInfo) return;

  if (state.videoInfo._imageUrl) {
    hideStatus();

    const queueId = `img-${Date.now()}`;
    const title = state.videoInfo.title || 'instagram_image';
    addDownloadToQueue(queueId, title, 'best');
    if (!state.queueOpen) openQueue();

    downloadBtn.classList.add('kick');
    downloadBtn.addEventListener('animationend', () => downloadBtn.classList.remove('kick'), { once: true });

    const dl = state.downloads.get(queueId);
    if (dl) { dl.status = 'downloading'; dl.percent = 0; }
    const pm = progressManagers.get(queueId);
    if (pm) pm.set(30);
    updateQueueItem(queueId);

    try {
      const result = await window.api.downloadImage({
        url: state.videoInfo._imageUrl,
        filename: title,
        title,
        postOwner: state.videoInfo._owner,
        caption: state.videoInfo._caption,
        webpageUrl: state.videoInfo._webpageUrl,
        outputPath: state.downloadPath,
        mediaType: 'image',
      });

      if (dl) { dl.status = 'complete'; dl.percent = 100; dl.filePath = result.filePath; }
      if (pm) {
        pm.finish();
        setTimeout(() => { pm.stop(); progressManagers.delete(queueId); updateQueueItem(queueId); }, 600);
      } else {
        updateQueueItem(queueId);
      }
    } catch (err) {
      if (dl) { dl.status = 'error'; dl.error = err.message || 'Failed to download image.'; }
      if (pm) pm.stop();
      progressManagers.delete(queueId);
      updateQueueItem(queueId);
      showStatus('error', err.message || 'Failed to download image.');
    }
    return;
  }

  if (state.videoInfo._directVideoUrl) {
    hideStatus();

    const queueId = `reel-${Date.now()}`;
    const title = state.videoInfo.title || 'instagram_reel';
    addDownloadToQueue(queueId, title, 'best');
    if (!state.queueOpen) openQueue();

    downloadBtn.classList.add('kick');
    downloadBtn.addEventListener('animationend', () => downloadBtn.classList.remove('kick'), { once: true });

    const dl = state.downloads.get(queueId);
    if (dl) {
      dl.status = 'downloading';
      dl.percent = 0;
    }
    const pm = progressManagers.get(queueId);
    if (pm) pm.set(15);
    updateQueueItem(queueId);

    try {
      if (pm) pm.set(40);
      updateQueueItem(queueId);

      const result = await window.api.downloadImage({
        url: state.videoInfo._directVideoUrl,
        filename: title,
        title,
        postOwner: state.videoInfo._owner,
        caption: state.videoInfo._caption,
        webpageUrl: state.videoInfo._webpageUrl,
        outputPath: state.downloadPath,
        mediaType: 'video',
      });

      if (dl) {
        dl.status = 'complete';
        dl.percent = 100;
        dl.filePath = result.filePath;
      }
      if (pm) {
        pm.finish();
        setTimeout(() => { pm.stop(); progressManagers.delete(queueId); updateQueueItem(queueId); }, 600);
      } else {
        updateQueueItem(queueId);
      }
    } catch (err) {
      if (dl) {
        dl.status = 'error';
        dl.error = err.message || 'Failed to download reel.';
      }
      if (pm) pm.stop();
      progressManagers.delete(queueId);
      updateQueueItem(queueId);
      showStatus('error', err.message || 'Failed to download reel.');
    }
    return;
  }

  const activeCount = [...state.downloads.values()].filter(
    d => d.status === 'preparing' || d.status === 'downloading'
  ).length;
  if (activeCount >= MAX_CONCURRENT) {
    showStatus('warning', `Slow down, you greedy bastard! Max ${MAX_CONCURRENT} at once.`);
    shakeElement(downloadBtn);
    return;
  }

  hideStatus();

  try {
    const result = await window.api.startDownload({
      url: urlInput.value.trim(),
      quality: state.selectedQuality,
      startTime: startTime.value,
      endTime: endTime.value,
      outputPath: state.downloadPath,
      title: state.videoInfo.title,
    });

    addDownloadToQueue(result.id, state.videoInfo.title, state.selectedQuality);
    downloadBtn.classList.add('kick');
    downloadBtn.addEventListener('animationend', () => downloadBtn.classList.remove('kick'), { once: true });
    if (!state.queueOpen) openQueue();
  } catch (err) {
    showStatus('error', err.message || 'Download crashed and burned, you buffoon. Try again.');
  }
}

/* ============================================================
   IPC Listeners
   ============================================================ */

window.api.onDownloadProgress((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'downloading';
  dl.percent = data.percent;
  dl.speed = data.speed || '';
  progressManagers.get(data.id)?.set(data.percent);
  updateQueueItem(data.id);
});

window.api.onDownloadComplete((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'complete';
  dl.filePath = data.filePath;
  dl.percent = 100;
  state.lastDownloadedFile = data.filePath;

  const pm = progressManagers.get(data.id);
  if (pm) {
    pm.finish();
    setTimeout(() => {
      pm.stop();
      progressManagers.delete(data.id);
      updateQueueItem(data.id);
    }, 600);
  } else {
    updateQueueItem(data.id);
  }

  showStatus('success', 'Done, you lucky bastard!');
});

window.api.onDownloadError((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'error';
  dl.error = data.error || 'Failed miserably';
  progressManagers.get(data.id)?.stop();
  progressManagers.delete(data.id);
  updateQueueItem(data.id);
  showStatus('error', data.error || 'Download failed.');
});

window.api.onDownloadCancelled((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'cancelled';
  progressManagers.get(data.id)?.stop();
  progressManagers.delete(data.id);
  updateQueueItem(data.id);
});

/* ============================================================
   Clipboard Auto-Detect (guarded by autoPaste setting)
   ============================================================ */

window.api.onWindowFocus(async () => {
  if (!state.autoPaste) return;
  if (state.isFetchingInfo) return;
  try {
    const text = await window.api.getClipboard();
    if (text && isValidURL(text) && text !== state.lastClipboardUrl && text !== urlInput.value.trim()) {
      state.lastClipboardUrl = text;
      urlInput.value = text;
      const platform = detectPlatform(text);
      const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : '';
      urlHint.textContent = `${platformName} link detected in clipboard`;
      urlHint.classList.add('clipboard');
      handleUrlChange();

      setTimeout(() => {
        if (urlHint.textContent.includes('detected in clipboard')) {
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
  if (text && isValidURL(text)) {
    urlInput.value = text.trim();
    handleUrlChange();
  }
});

/* ============================================================
   Quality Selector — context-adaptive labels
   ============================================================ */

const DEFAULT_QUALITY_LABELS = ['Best / 4K', 'HD 1080p', 'Audio Only'];

function updateQualityLabels(platform, contentType) {
  const buttons = qualitySelector.querySelectorAll('.quality-option');
  if (buttons.length < 3) return;

  if (contentType === 'image' || contentType === 'carousel') {
    buttons[0].textContent = 'Original Quality';
    buttons[1].classList.add('collapsed');
    buttons[2].classList.add('collapsed');
    qualitySelector.classList.add('compact');
    buttons.forEach(b => b.classList.remove('active'));
    buttons[0].classList.add('active');
    state.selectedQuality = 'best';
  } else {
    qualitySelector.classList.remove('compact');
    buttons[1].classList.remove('collapsed');
    buttons[2].classList.remove('collapsed');
    if (platform === 'youtube' || !platform) {
      buttons[0].textContent = DEFAULT_QUALITY_LABELS[0];
      buttons[1].textContent = DEFAULT_QUALITY_LABELS[1];
      buttons[2].textContent = DEFAULT_QUALITY_LABELS[2];
    } else {
      buttons[0].textContent = 'Best Quality';
      buttons[1].textContent = 'HD';
      buttons[2].textContent = 'Audio Only';
    }
  }
  requestAnimationFrame(() => updatePillPosition(true));
}

function resetQualityLabels() {
  const buttons = qualitySelector.querySelectorAll('.quality-option');
  if (buttons.length < 3) return;
  qualitySelector.classList.remove('compact');
  buttons[1].classList.remove('collapsed');
  buttons[2].classList.remove('collapsed');
  buttons[0].textContent = DEFAULT_QUALITY_LABELS[0];
  buttons[1].textContent = DEFAULT_QUALITY_LABELS[1];
  buttons[2].textContent = DEFAULT_QUALITY_LABELS[2];
  requestAnimationFrame(() => updatePillPosition(true));
}

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

urlClear.addEventListener('click', () => {
  clearTimeout(fetchDebounce);
  state.isFetchingInfo = false;
  urlInput.value = '';
  urlHint.textContent = '';
  urlHint.classList.remove('clipboard');
  urlRow.classList.remove('error');
  resetVideoState();
  hideStatus();
  statusRetry.style.display = 'none';
  urlClear.classList.remove('visible');
  setSticker('default');
});

downloadBtn.addEventListener('click', handleDownload);

let disabledHintTimer = null;
downloadBtn.addEventListener('pointerdown', () => {
  if (!downloadBtn.disabled) return;
  shakeElement(downloadBtn);
  const reason = getDownloadDisabledReason();
  clearTimeout(disabledHintTimer);
  btnHint.textContent = reason;
  btnHint.classList.add('visible');
  disabledHintTimer = setTimeout(() => {
    btnHint.classList.remove('visible');
  }, 2500);
});

pathDisplay.addEventListener('click', async () => {
  const selected = await window.api.selectFolder();
  if (selected) {
    state.downloadPath = selected;
    pathDisplay.textContent = truncatePath(selected);
    pathDisplay.title = selected;
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

showInFinderToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  state.showInFinder = !state.showInFinder;
  showInFinderToggle.classList.toggle('active', state.showInFinder);
  window.api.setSetting('showInFinder', state.showInFinder);
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
      showStatus('success', `yt-dlp fucking updated to ${result.version}, bitch!`);
    } else {
      showStatus('error', `Update failed: ${result.error} - what did you expect, you dim bulb?`);
    }
  } catch (err) {
    showStatus('error', 'Failed to update yt-dlp, you clumsy oaf.');
  } finally {
    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.textContent = 'Update';
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
  closeQueue();
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
    entries = entries.filter(e => e.quality !== 'audio' && e.mediaType !== 'image' && e.mediaType !== 'carousel');
  } else if (state.historyFilter === 'audio') {
    entries = entries.filter(e => e.quality === 'audio');
  } else if (state.historyFilter === 'image') {
    entries = entries.filter(e => e.mediaType === 'image' || e.mediaType === 'carousel');
  }

  if (state.historySearchTerm) {
    const term = state.historySearchTerm.toLowerCase();
    entries = entries.filter(e => {
      const searchable = [
        e.title, e.uploader, e.channel,
        e.webpageUrl, e.description, e.videoId,
        e.platform || '',
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

  const isCarousel = entry.mediaType === 'carousel' && entry.carouselItems?.length > 0;
  const clipInfo = (entry.clipStart && entry.clipStart !== '00:00:00') || (entry.clipEnd && entry.clipEnd !== '00:00:00')
    ? ` (clip ${entry.clipStart || '00:00:00'}–${entry.clipEnd || 'end'})`
    : '';

  const isImage = entry.mediaType === 'image' || isCarousel;
  const uploaderText = entry.uploader || entry.channel || '';
  const metaParts = [uploaderText];
  if (isCarousel) {
    const imgCount = entry.carouselItems.filter(ci => ci.mediaType !== 'video').length;
    const vidCount = entry.carouselItems.filter(ci => ci.mediaType === 'video').length;
    const parts = [];
    if (imgCount > 0) parts.push(`${imgCount} image${imgCount > 1 ? 's' : ''}`);
    if (vidCount > 0) parts.push(`${vidCount} video${vidCount > 1 ? 's' : ''}`);
    metaParts.push(parts.join(', '));
  } else if (!isImage) {
    metaParts.push(formatDuration(entry.duration) + clipInfo);
  }
  const filteredMeta = metaParts.filter(Boolean);

  const detailRows = [];

  if (entry.webpageUrl) {
    detailRows.push({ label: 'Source', value: entry.webpageUrl, copyable: true });
  }
  if (entry.channel || entry.uploader) {
    const channelLabel = (entry.platform === 'instagram' || entry.platform === 'tiktok') ? 'Creator' : 'Channel';
    let channelVal = entry.channel || entry.uploader;
    if (entry.channelUrl) channelVal += ` (${entry.channelUrl})`;
    detailRows.push({ label: channelLabel, value: channelVal });
  }
  if (entry.uploadDate) {
    detailRows.push({ label: 'Uploaded', value: formatUploadDate(entry.uploadDate) });
  }
  if (!isImage) {
    detailRows.push({ label: 'Duration', value: formatDuration(entry.duration) + clipInfo });
  }
  if (isCarousel) {
    detailRows.push({ label: 'Items', value: `${entry.carouselItems.length} files` });
  } else if (isImage) {
    detailRows.push({ label: 'Format', value: (entry.format || 'jpg').toUpperCase() });
  } else {
    detailRows.push({ label: 'Quality', value: qualityLabel(entry.quality) + ' · ' + (entry.format || '').toUpperCase() });
  }
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
  if (isCarousel) {
    for (let ci = 0; ci < entry.carouselItems.length; ci++) {
      const child = entry.carouselItems[ci];
      detailRows.push({
        label: `File ${ci + 1}`,
        value: child.filePath || '—',
        clickToReveal: !!child.filePath,
      });
    }
    detailRows.push({ label: 'Total Size', value: formatFileSize(entry.fileSize) });
  } else {
    detailRows.push({ label: 'File', value: entry.filePath || '—', clickToReveal: !!entry.filePath });
    detailRows.push({ label: 'Size', value: formatFileSize(entry.fileSize) });
  }
  detailRows.push({ label: 'Downloaded', value: formatFullDate(entry.downloadedAt) });

  const dlHtml = detailRows.map(r => {
    if (r.clickToReveal) {
      const display = truncatePath(r.value);
      return `<dt>${r.label}</dt><dd class="file-link" data-filepath="${escapeHtml(r.value)}" title="${escapeHtml(r.value)}">${escapeHtml(display)}</dd>`;
    }
    return `<dt>${r.label}</dt><dd${r.copyable ? ' class="copyable"' : ''}>${escapeHtml(r.value)}</dd>`;
  }).join('');

  const qualityBadge = isCarousel
    ? `<span class="history-entry__quality">${entry.carouselItems.length} items</span>`
    : `<span class="history-entry__quality">${escapeHtml(qualityLabel(entry.quality))}</span>`;

  el.innerHTML = `
    <div class="history-entry__header">
      <div class="history-entry__info">
        <div class="history-entry__title">${escapeHtml(entry.title)}</div>
        <div class="history-entry__meta">${escapeHtml(filteredMeta.join(' · '))}</div>
      </div>
      ${qualityBadge}
      ${entry.platform && entry.platform !== 'youtube' ? `<span class="history-entry__platform">${escapeHtml(entry.platform)}</span>` : ''}
      <span class="history-entry__date">${escapeHtml(formatRelativeDate(entry.downloadedAt))}</span>
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
        ${entry.webpageUrl ? '<button class="history-action-btn history-action-btn--redownload" data-action="redownload">Download Again</button>' : ''}
        <button class="history-action-btn history-action-btn--copyinfo" data-action="copyinfo">Copy Info</button>
        <button class="history-action-btn history-action-btn--copy" data-action="copy">Copy URL</button>
        <button class="history-action-btn history-action-btn--open" data-action="open">Open</button>
        <button class="history-action-btn history-action-btn--delete" data-action="delete">Remove</button>
      </div>
    </div>
  `;

  const header = el.querySelector('.history-entry__header');
  header.addEventListener('click', () => {
    el.classList.toggle('expanded');
  });

  el.querySelectorAll('.file-link').forEach(fileLink => {
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
  });

  el.querySelector('[data-action="copyinfo"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const lines = [];
    lines.push(`Title: ${entry.title}`);
    if (entry.channel || entry.uploader) lines.push(`Channel: ${entry.channel || entry.uploader}`);
    if (entry.channelUrl) lines.push(`Channel URL: ${entry.channelUrl}`);
    if (entry.webpageUrl) lines.push(`Source: ${entry.webpageUrl}`);
    if (entry.uploadDate) lines.push(`Upload Date: ${formatUploadDate(entry.uploadDate)}`);
    lines.push(`Duration: ${formatDuration(entry.duration)}`);
    if ((entry.clipStart && entry.clipStart !== '00:00:00') || (entry.clipEnd && entry.clipEnd !== '00:00:00')) {
      lines.push(`Clip: ${entry.clipStart || '00:00:00'} – ${entry.clipEnd || 'end'}`);
    }
    if (entry.mediaType === 'carousel' && entry.carouselItems?.length) {
      lines.push(`Items: ${entry.carouselItems.length} files`);
    } else {
      lines.push(`Quality: ${qualityLabel(entry.quality)} · ${(entry.format || '').toUpperCase()}`);
    }
    if (entry.viewCount != null) lines.push(`Views: ${formatNumber(entry.viewCount)}`);
    if (entry.likeCount != null) lines.push(`Likes: ${formatNumber(entry.likeCount)}`);
    if (entry.categories && entry.categories.length) lines.push(`Categories: ${entry.categories.join(', ')}`);
    if (entry.tags && entry.tags.length) lines.push(`Tags: ${entry.tags.join(', ')}`);
    if (entry.license) lines.push(`License: ${entry.license}`);
    if (entry.carouselItems?.length) {
      entry.carouselItems.forEach((ci, i) => {
        if (ci.filePath) lines.push(`File ${i + 1}: ${ci.filePath}`);
      });
      lines.push(`Total Size: ${formatFileSize(entry.fileSize)}`);
    } else {
      if (entry.filePath) lines.push(`File: ${entry.filePath}`);
      if (entry.fileSize) lines.push(`Size: ${formatFileSize(entry.fileSize)}`);
    }
    lines.push(`Downloaded: ${formatFullDate(entry.downloadedAt)}`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      const btn = e.currentTarget;
      btn.textContent = 'Copied!';
      btn.classList.add('pop');
      btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
      setTimeout(() => { btn.textContent = 'Copy Info'; }, 1500);
    } catch { /* clipboard access denied */ }
  });

  el.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (entry.webpageUrl) {
      try {
        await navigator.clipboard.writeText(entry.webpageUrl);
        const btn = e.currentTarget;
        btn.textContent = 'Copied!';
        btn.classList.add('pop');
        btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
        setTimeout(() => { btn.textContent = 'Copy URL'; }, 1500);
      } catch { /* clipboard access denied */ }
    }
  });

  const redownloadBtn = el.querySelector('[data-action="redownload"]');
  if (redownloadBtn) {
    redownloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!entry.webpageUrl) return;
      closeHistory();
      urlInput.value = entry.webpageUrl;
      handleUrlChange();
    });
  }

  el.querySelector('[data-action="open"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (entry.webpageUrl) window.api.openExternal(entry.webpageUrl);
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.historyOpen) {
    closeHistory();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!downloadBtn.disabled) handleDownload();
  }
});

historyClearBtn.addEventListener('click', async () => {
  if (state.historyData.length === 0) return;
  if (historyClearBtn.classList.contains('confirm')) return;
  const count = state.historyData.length;
  historyClearBtn.textContent = `Nuke these ${count} worthless entries, bitch?`;
  historyClearBtn.classList.add('confirm');

  const onConfirm = async () => {
    historyClearBtn.removeEventListener('click', onConfirm);
    await window.api.clearHistory();
    state.historyData = [];
    renderHistoryList();
    historyClearBtn.textContent = 'Clear All, You Coward';
    historyClearBtn.classList.remove('confirm');
  };

  const onCancel = () => {
    historyClearBtn.textContent = 'Clear All, You Coward';
    historyClearBtn.classList.remove('confirm');
    historyClearBtn.removeEventListener('click', onConfirm);
    document.removeEventListener('click', onOutside);
  };

  const onOutside = (e) => {
    if (!historyClearBtn.contains(e.target)) {
      onCancel();
    }
  };

  setTimeout(() => {
    historyClearBtn.addEventListener('click', onConfirm, { once: true });
    document.addEventListener('click', onOutside, { once: true });
  }, 10);
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
  state.showInFinder = settings.showInFinder === true;
  pathDisplay.textContent = truncatePath(settings.downloadPath);
  pathDisplay.title = settings.downloadPath;
  appVersion.textContent = `v${version}`;

  autoPasteToggle.classList.toggle('active', state.autoPaste);
  showInFinderToggle.classList.toggle('active', state.showInFinder);

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
      appUpdateBtn.style.display = '';
      appUpdateBtn.textContent = `Update to v${update.version}`;
      appUpdateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (update.url) window.api.openExternal(update.url);
      });
      showStatus('info', `New version v${update.version} available! Check Settings.`);
    }
  } catch { /* no update check errors shown */ }
}

init();
