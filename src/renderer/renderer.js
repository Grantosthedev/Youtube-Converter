/* ============================================================
   State
   ============================================================ */

const state = {
  videoInfo: null,
  downloads: new Map(),
  isFetchingInfo: false,
  lastDownloadedFile: null,
  selectedQuality: 'best',
  selectedResolutionHeight: null,
  qualityDropdownOpen: false,
  downloadPath: '',
  lastClipboardUrl: '',
  settingsOpen: false,
  autoPaste: true,
  showInFinder: false,
  instantDownload: false,
  queueOpen: false,
  historyOpen: false,
  historyData: [],
  historyFilter: 'all',
  historySortNewest: true,
  historyViewMode: localStorage.getItem('historyViewMode') || 'list',
  historySearchTerm: '',
  carouselData: null,
  carouselSelected: new Set(),
  mode: 'unhinged',
  activeProject: null,
  projects: [],
  projectHues: {},
  projectDropdownOpen: false,
  historyProjectFilter: null,
  helpOpen: false,
  theme: 'auto',
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
const historyFilterPill = $('#historyFilterPill');
const qualityBtnLabel = $('#qualityBtnLabel');
const qualityChevron = $('#qualityChevron');
const qualityDropdown = $('#qualityDropdown');
const qualityDropdownList = $('#qualityDropdownList');
const qualityBackdrop = $('#qualityBackdrop');
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
const instantDownloadToggle = $('#instantDownloadToggle');
const modeToggle = $('#modeToggle');
const updateYtdlpBtn = $('#updateYtdlpBtn');
const updateStatus = $('#updateStatus');
const appVersion = $('#appVersion');
const appUpdateBtn = $('#appUpdateBtn');
const historyBtn = $('#historyBtn');
const historyView = $('#historyView');
const historyBack = $('#historyBack');
const historyExportBtn = $('#historyExportBtn');
const historyClearBtn = $('#historyClearBtn');
const historySearch = $('#historySearch');
const historyList = $('#historyList');
const historyEmpty = $('#historyEmpty');
const historyCount = $('#historyCount');
const historySortBtn = $('#historySortBtn');
const historyViewToggles = document.querySelector('.history-view-toggles');
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
const projectBtn = $('#projectBtn');
const projectPill = $('#projectPill');
const projectPillName = $('#projectPillName');
const projectPillClear = $('#projectPillClear');
const projectDropdown = $('#projectDropdown');
const projectInput = $('#projectInput');
const projectList = $('#projectList');
const projectEmpty = $('#projectEmpty');
const projectHint = $('#projectHint');
const projectBackdrop = $('#projectBackdrop');
const pathRow = document.querySelector('.path-row');
const historyProjectFilter = $('#historyProjectFilter');
const historyProjectBtn = $('#historyProjectBtn');
const historyProjectMenu = $('#historyProjectMenu');
const helpBtn = $('#helpBtn');
const helpPopover = $('#helpPopover');
const themeToggle = $('#themeToggle');
const activityToast = $('#activityToast');
const activitySpinner = document.querySelector('.activity-toast__spinner');
const activityText = $('#activityText');

/* ============================================================
   Tooltip
   ============================================================ */

(function () {
  const tip = document.getElementById('tooltip');
  if (!tip) return;

  let showTimer = null;

  function show(el) {
    tip.textContent = el.dataset.tooltip;
    tip.classList.remove('visible');

    // Measure at top-left off-screen so getBoundingClientRect is accurate
    tip.style.left = '0px';
    tip.style.top  = '0px';

    const r  = el.getBoundingClientRect();
    const GAP = 8;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    let left = r.left;
    let top  = r.bottom + GAP;

    // Clamp right edge
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    // Flip above if it would overflow the bottom
    if (top + th > window.innerHeight - 8) top = r.top - th - GAP;

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
    tip.classList.add('visible');
  }

  function hide() {
    clearTimeout(showTimer);
    tip.classList.remove('visible');
  }

  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(el), 500);
    });
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', hide);
  });
})();

/* ============================================================
   Theme
   ============================================================ */

const systemLight = window.matchMedia('(prefers-color-scheme: light)');

function applyTheme(theme) {
  const isLight = theme === 'light' ||
    (theme === 'auto' && systemLight.matches);
  document.documentElement.classList.toggle('light-mode', isLight);
  if (themeToggle) {
    themeToggle.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }
}

systemLight.addEventListener('change', () => {
  if (state.theme === 'auto') applyTheme('auto');
});

themeToggle?.addEventListener('click', (e) => {
  const btn = e.target.closest('.theme-btn');
  if (!btn) return;
  state.theme = btn.dataset.theme;
  applyTheme(state.theme);
  window.api.setSetting('theme', state.theme);
});

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

function brightTextColor(hue) {
  // Compute relative luminance of hsl(hue, 85%, 48%) to pick a readable foreground.
  // Returns dark text for high-luminance hues (green, yellow, cyan) and white for dark hues.
  const s = 0.85, l = 0.48;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (hue < 60)  { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  r += m; g += m; b += m;
  const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.179 ? '#12120f' : '#ffffff';
}

function projectColors(name) {
  let hue = state.projectHues?.[name];
  if (hue == null) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    hue = (h % 280) + 40;
  }
  return {
    bright:     `hsl(${hue}, 85%, 48%)`,
    dark:       `hsl(${hue}, 60%, 13%)`,
    subtle:     `hsla(${hue}, 85%, 48%, 0.15)`,
    hover:      `hsla(${hue}, 85%, 48%, 0.15)`,
    brightSub:  `hsla(${hue}, 45%, 65%, 0.75)`,
    shimmerLo:  `hsla(${hue}, 85%, 48%, 0.06)`,
    shimmerHi:  `hsla(${hue}, 85%, 48%, 0.14)`,
    onBright:   brightTextColor(hue),
    pillText:   `hsl(${hue}, 100%, 76%)`,
    lightBg:    `hsl(${hue}, 50%, 70%)`,
    lightText:  `hsl(${hue}, 90%, 15%)`,
  };
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

function extractYouTubeTimestamp(url) {
  try {
    const urlObj = new URL(url);
    const t = urlObj.searchParams.get('t') || urlObj.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    let seconds = 0;
    const h = t.match(/(\d+)h/);
    const m = t.match(/(\d+)m/);
    const s = t.match(/(\d+)s/);
    if (h) seconds += parseInt(h[1], 10) * 3600;
    if (m) seconds += parseInt(m[1], 10) * 60;
    if (s) seconds += parseInt(s[1], 10);
    return seconds;
  } catch { return 0; }
}

function secondsToTimeString(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

function icon(name, extraClass = '') {
  const classes = `hgi-stroke hgi-${name}${extraClass ? ` ${extraClass}` : ''}`;
  return `<i class="${classes}" aria-hidden="true"></i>`;
}

let urlHintTimer = null;

function setUrlHint(text, showTick = false) {
  clearTimeout(urlHintTimer);

  if (!text) {
    urlHint.classList.remove('visible');
    urlHintTimer = setTimeout(() => {
      urlHint.textContent = '';
      urlHint.classList.remove('clipboard');
    }, 220);
    return;
  }

  const wasVisible = urlHint.classList.contains('visible');

  if (wasVisible) {
    urlHint.classList.remove('visible');
    urlHintTimer = setTimeout(() => {
      applyHintContent(text, showTick);
      requestAnimationFrame(() => urlHint.classList.add('visible'));
    }, 180);
  } else {
    applyHintContent(text, showTick);
    requestAnimationFrame(() => urlHint.classList.add('visible'));
  }
}

function applyHintContent(text, showTick) {
  if (showTick) {
    urlHint.innerHTML = `<span class="url-hint__tick">${icon('tick-01')}</span>${escapeHtml(text)}`;
    urlHint.classList.add('clipboard');
  } else {
    urlHint.textContent = text;
    urlHint.classList.remove('clipboard');
  }
}

/* ============================================================
   Professional / Unhinged Mode — string translations
   ============================================================ */

const PROFESSIONAL_STRINGS = new Map([
  ['No downloads yet fam, go and steal some videos already', 'No downloads yet. Paste a URL to get started.'],
  ['Hurry up and paste a link, my ninja', 'Paste a video or image URL'],
  ['Download This Shit', 'Download'],
  ['Preparing, hold your goddamn horses...', 'Preparing download...'],
  ['Processing clip, sit your ass down...', 'Processing clip...'],
  ['Done, you lucky bastard', 'Download complete'],
  ['Done, you lucky bastard!', 'Download complete!'],
  ['Failed miserably', 'Download failed'],
  ['Cancelled, you indecisive clown', 'Download cancelled'],
  ['File vanished, you probably deleted it yourself. Opened the folder instead.', 'File not found. Opened the download folder.'],
  ['Scanning the goddamn link...', 'Analyzing link...'],
  ['Locked in. Ready to rip.', 'Ready to download.'],
  ['Download crashed and burned, you buffoon. Try again.', 'Download failed. Please try again.'],
  ['Failed to update download engine, what the helly!', 'Download engine update failed.'],
  ['Stitching video and audio together, chill...', 'Merging video and audio...'],
  ['Making it work on your fancy Mac...', 'Converting for QuickTime...'],
  ['Software converting, this ones gonna take a sec...', 'Converting (software fallback)...'],
  ['Ripping the audio out, one sec...', 'Extracting audio...'],
  ['Still cookin, hang tight...', 'Still processing...'],
  ['Clear All, champ', 'Clear All'],
  ['No downloads yet. Go download something.', 'No download history yet.'],
  ['Download Image', 'Download Image'],
  ['Download Reel', 'Download Reel'],
  ['Show File', 'Show File'],
  ['Show Files', 'Show Files'],
  ['Checking Instagram post...', 'Checking Instagram post...'],
  ['Select items to download', 'Select items to download'],
  ['Reel ready to download', 'Reel ready to download'],
  ['Image ready to download', 'Image ready to download'],
  ['Hold on, fetching...', 'Fetching content...'],
  ['Hold on, fetching video info...', 'Fetching video info...'],
  ['Paste a URL first', 'Paste a URL first'],
  ['Paste a URL first champ', 'Please paste a URL first'],
  ['Fix clip times (start must be before end)', 'Fix clip times (start must be before end)'],
  ['Not ready yet', 'Not ready yet'],
  ['TikTok photo slideshows aren\'t supported yet. Video posts work great though!', 'TikTok photo slideshows are not supported. Video posts are supported.'],
  ['Couldn\'t fetch this Instagram post. It may be private or require login.', 'Could not fetch this Instagram post. It may be private or require login.'],
  ['Loading...', 'Loading...'],
  ['Newest first', 'Newest first'],
  ['Oldest first', 'Oldest first'],
  ['Deselect All', 'Deselect All'],
  ['Select All', 'Select All'],
  ['Updating…', 'Updating…'],
  ['Update', 'Update'],
  ['Copied!', 'Copied!'],
  ['Copy Info', 'Copy Info'],
  ['Copy URL', 'Copy URL'],
  ['Drop a link here', 'Drop a link here'],
  ['File was moved or deleted. Opened the download folder.', 'File not found. Opened the download folder.'],
  ['Name this project, fam', 'Enter a project name'],
  ['Add new project', 'Add new project'],
  ['No projects yet. Type one in, genius.', 'No projects yet. Enter a name to create one.'],
  ['Hold tight, making sure everything works…', 'Running background checks…'],
  ['First-time setup: downloading engine…', 'Setting up: downloading engine…'],
  ['Downloading latest version…', 'Downloading latest version…'],
  ['Done!', 'Done!'],
  ['Something went wrong', 'Something went wrong'],
  ['Couldn\'t reach the server. Check your connection.', 'Could not reach the server. Check your connection.'],
  ['All systems go, baby', 'Ready'],
  ['Instant Download', 'Instant Download'],
  ['Ready: click Instant Download', 'Ready: click Instant Download'],
  ['Instant Downloads on: paste a link and hit download, no waiting', 'Instant Downloads enabled: paste a URL and download immediately, no scan required'],
  ['Instant Downloads off: links will scan first so you can preview and confirm', 'Instant Downloads disabled: links will be scanned before downloading'],
]);

const PROFESSIONAL_TEMPLATES = {
  ytdlpUpdated: (version) => `Download engine updated to ${version}.`,
  ytdlpUpdateFailed: (error) => `Update failed: ${error}`,
  maxConcurrent: (max) => `Maximum ${max} concurrent downloads reached.`,
  nukeEntries: (count) => `Delete all ${count} entries?`,
  carouselNotifTitle: () => 'Carousel download complete',
  carouselPartialTitle: () => 'Carousel partially downloaded',
  carouselFailTitle: () => 'Carousel download failed',
  ytdlpAutoUpdated: (version) => `Download engine updated to ${version}.`,
  clipboardDetected: (platformName) => `${platformName} link detected in clipboard`,
  newVersionAvailable: (version) => `New version v${version} available. Check Settings.`,
};

function t(str) {
  if (state.mode === 'professional' && PROFESSIONAL_STRINGS.has(str)) {
    return PROFESSIONAL_STRINGS.get(str);
  }
  return str;
}

function tp(key, ...args) {
  if (state.mode === 'professional' && PROFESSIONAL_TEMPLATES[key]) {
    return PROFESSIONAL_TEMPLATES[key](...args);
  }
  return null;
}

function applyMode() {
  const yaMumChip = document.getElementById('yaMumChip');
  if (yaMumChip) yaMumChip.style.display = state.mode === 'unhinged' ? '' : 'none';

  const queueEmptyText = queueEmpty.querySelector('.queue-panel__empty-text');
  if (queueEmptyText) {
    queueEmptyText.textContent = t('No downloads yet fam, go and steal some videos already');
  }

  urlInput.placeholder = t('Hurry up and paste a link, my ninja');

  if (!state.videoInfo && !state.carouselData && !state.instantDownload) {
    downloadBtn.textContent = t('Download This Shit');
  }

  const historyEmptySpan = historyEmpty.querySelector('span');
  if (historyEmptySpan) {
    historyEmptySpan.textContent = t('No downloads yet. Go download something.');
  }

  if (!historyClearBtn.classList.contains('confirm')) {
    historyClearBtn.textContent = t('Clear All, champ');
  }

  historySortBtn.textContent = state.historySortNewest ? t('Newest first') : t('Oldest first');

  const dropContent = document.querySelector('.drop-overlay__content');
  if (dropContent) {
    dropContent.textContent = t('Drop a link here');
  }

  if (projectInput) {
    projectInput.placeholder = t('Name this project, fam');
  }

  if (projectEmpty) {
    projectEmpty.textContent = t('No projects yet. Type one in, genius.');
  }
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
  closeProjectDropdown();
  closeHelp();
  closeQualityDropdown();
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

function applyQueueItemProjectColors(el) {
  if (!state.activeProject) return;
  const c = projectColors(state.activeProject);
  el.style.setProperty('--proj-dark', c.dark);
  el.style.setProperty('--proj-bright', c.bright);
  el.style.setProperty('--proj-bright-sub', c.brightSub);
  el.style.setProperty('--proj-subtle', c.subtle);
  el.style.setProperty('--proj-pill-text', c.pillText);
  el.style.setProperty('--proj-light-bg', c.lightBg);
  el.style.setProperty('--proj-light-text', c.lightText);
}

function addDownloadToQueue(id, title, quality) {
  state.downloads.set(id, {
    id, title, quality,
    percent: 0, speed: '', status: 'preparing',
    filePath: '', error: '',
  });

  const projectBadge = state.activeProject
    ? `<span class="queue-item__project">${escapeHtml(state.activeProject)}</span>` : '';

  const el = document.createElement('div');
  el.className = 'queue-item preparing';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="queue-item__row">
      <span class="queue-item__title">${escapeHtml(title)}</span>
      ${projectBadge}
      <button class="queue-item__action" aria-label="Cancel">${icon('cancel-01', 'ui-icon')}</button>
    </div>
    <div class="queue-item__bar">
      <div class="queue-item__fill downloading"></div>
    </div>
    <div class="queue-item__row">
      <span class="queue-item__detail">${t('Preparing, hold your goddamn horses...')}</span>
      <span class="queue-item__quality">${escapeHtml(qualityLabel(quality))}</span>
    </div>
  `;

  applyQueueItemProjectColors(el);
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
  detail.classList.remove('has-stats');

  switch (dl.status) {
    case 'preparing':
      detail.textContent = t('Preparing, hold your goddamn horses...');
      break;
    case 'downloading':
      if (dl.percent >= 99.5) {
        fill.classList.add('processing');
        const STATUS_LABELS = {
          merging:           t('Stitching video and audio together, chill...'),
          converting_mac:    t('Making it work on your fancy Mac...'),
          converting_sw:     t('Software converting, this ones gonna take a sec...'),
          extracting_audio:  t('Ripping the audio out, one sec...'),
          converting_audio:  t('Re-encoding audio for compatibility...'),
          still_working:     t('Still cookin, hang tight...'),
        };
        const statusMsg = STATUS_LABELS[dl.statusKey] || t('Processing clip, sit your ass down...');
        let stats = '';
        if (dl.convertPercent > 0) stats += `${dl.convertPercent}%`;
        if (dl.processingStarted) {
          const elapsed = Math.floor((Date.now() - dl.processingStarted) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`;
          stats += (stats ? ' · ' : '') + timeStr;
        }
        detail.classList.add('has-stats');
        detail.innerHTML = `<span class="queue-item__detail-msg">${escapeHtml(statusMsg)}</span>`
          + (stats ? `<span class="queue-item__detail-stats">${escapeHtml(stats)}</span>` : '');
      } else {
        fill.classList.remove('processing');
        detail.classList.remove('has-stats');
        detail.textContent = `${Math.round(dl.percent)}%${dl.speed ? ' · ' + dl.speed : ''}`;
      }
      break;
    case 'complete': {
      fill.className = 'queue-item__fill complete';
      fill.style.width = '100%';
      detail.innerHTML = icon('checkmark-circle-02', 'ui-icon') + t('Done, you lucky bastard');
      if (!el.querySelector('.queue-item__show-file')) {
        const btn = document.createElement('button');
        btn.className = 'queue-item__show-file';
        btn.textContent = t('Show File');
        detail.parentNode.appendChild(btn);
      }
      break;
    }
    case 'error':
      fill.className = 'queue-item__fill error';
      detail.textContent = dl.error || t('Failed miserably');
      detail.title = dl.error || '';
      break;
    case 'cancelled':
      fill.className = 'queue-item__fill cancelled';
      detail.textContent = t('Cancelled, you indecisive clown');
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
      dl.status = 'cancelled';
      progressManagers.get(id)?.stop();
      progressManagers.delete(id);
      updateQueueItem(id);
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
          showStatus('warning', t('File vanished, you probably deleted it yourself. Opened the folder instead.'));
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
   History Filter Pill Animation
   ============================================================ */

function updateHistoryFilterPill(animate = true) {
  const container = document.querySelector('.history-filters');
  const activeBtn = container?.querySelector('.history-filter[data-filter].active');
  if (!activeBtn || !historyFilterPill) return;

  const barRect = container.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const offsetLeft = btnRect.left - barRect.left;

  if (!animate) {
    historyFilterPill.style.transition = 'none';
  }

  historyFilterPill.style.width = btnRect.width + 'px';
  historyFilterPill.style.transform = `translateX(${offsetLeft - 4}px)`;

  if (!animate) {
    historyFilterPill.offsetHeight;
    historyFilterPill.style.transition = '';
  }
}

/* ============================================================
   Settings Popover (with backdrop for click-outside dismiss)
   ============================================================ */

function openSettings() {
  state.settingsOpen = true;
  closeQueue();
  closeProjectDropdown();
  closeHelp();
  closeQualityDropdown();
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
  closeHelp();
});

/* ============================================================
   Help / Supported Services Popover
   ============================================================ */

function openHelp() {
  state.helpOpen = true;
  closeSettings();
  closeQueue();
  closeProjectDropdown();
  closeQualityDropdown();
  helpPopover.classList.add('open');
  settingsBackdrop.classList.add('visible');
}

function closeHelp() {
  state.helpOpen = false;
  helpPopover.classList.remove('open');
  if (!state.settingsOpen) {
    settingsBackdrop.classList.remove('visible');
  }
}

function toggleHelp() {
  if (state.helpOpen) closeHelp(); else openHelp();
}

helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleHelp();
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
    'stickers/good13.webp', 'stickers/good14.avif', 'stickers/good15.avif',
    'stickers/good16.avif', 'stickers/good17.avif', 'stickers/good18.webp',
    'stickers/good19.webp', 'stickers/good20.webp', 'stickers/good21.webp',
    'stickers/good22.webp', 'stickers/good23.png',  'stickers/good24.png',
    'stickers/good25.png',  'stickers/good26.png',  'stickers/good27.png',
    'stickers/good28.png',  'stickers/good29.png',  'stickers/good30.png',
    'stickers/good31.png',  'stickers/good14.png',  'stickers/good32.png',
    'stickers/good33.png',
  ],
  bad: [
    'stickers/bad1.avif',  'stickers/bad2.avif',
    'stickers/bad3.avif',  'stickers/bad4.avif',  'stickers/bad5.webp',
    'stickers/bad6.webp',  'stickers/bad7.avif',  'stickers/bad8.avif',
    'stickers/bad9.webp',  'stickers/bad10.webp', 'stickers/bad11.png',
    'stickers/bad12.png',  'stickers/bad13.png',  'stickers/bad14.png',
    'stickers/bad15.png',  'stickers/bad16.png',  'stickers/bad17.png',
    'stickers/bad18.png',
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
  const icons = {
    error: icon('cancel-01', 'ui-icon'),
    success: icon('checkmark-circle-02', 'ui-icon'),
    warning: icon('alert-circle', 'ui-icon'),
    info: '',
  };
  statusMessage.className = `status-message ${type}`;
  statusIcon.innerHTML = icons[type] || '';
  statusText.textContent = message;
  if (type === 'error') {
    statusCopy.style.display = '';
  } else {
    statusCopy.style.display = 'none';
    statusRetry.style.display = 'none';
  }

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
  statusCopy.style.display = 'none';
  statusRetry.style.display = 'none';
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
  const origHTML = statusCopy.innerHTML;
  statusCopy.innerHTML = icon('checkmark-circle-02', 'ui-icon ui-icon--action');
  setTimeout(() => { statusCopy.innerHTML = origHTML; }, 1500);
});

/* ============================================================
   Activity Toast — subtle background task indicator
   ============================================================ */

let activityHideTimer = null;

function setActivitySpinnerIcon(name) {
  if (!activitySpinner) return;
  activitySpinner.className = `activity-toast__spinner hgi-stroke hgi-${name} ui-icon`;
}

function showActivityToast(message) {
  clearTimeout(activityHideTimer);
  activityText.textContent = message;
  setActivitySpinnerIcon('loading-02');
  activityToast.classList.remove('done');
  activityToast.classList.add('visible');
  activityHideTimer = setTimeout(() => hideActivityToast(), 15000);
}

function completeActivityToast(message, duration = 2500) {
  if (!activityToast.classList.contains('visible')) return;
  activityText.textContent = message;
  setActivitySpinnerIcon('checkmark-circle-02');
  activityToast.classList.add('done');
  activityHideTimer = setTimeout(() => hideActivityToast(), duration);
}

function hideActivityToast() {
  clearTimeout(activityHideTimer);
  activityToast.classList.remove('visible');
  setTimeout(() => activityToast.classList.remove('done'), 300);
}

function updateDownloadBtnState() {
  if (state.carouselData) {
    downloadBtn.disabled = state.carouselSelected.size === 0 || state.isFetchingInfo;
    return;
  }
  if (state.instantDownload) {
    const url = urlInput.value.trim();
    const validUrl = isValidURL(url) && !(detectPlatform(url) === 'tiktok' && isTiktokPhotoUrl(url));
    downloadBtn.disabled = !validUrl || state.isFetchingInfo;
    return;
  }
  const hasVideo = !!state.videoInfo;
  const timeValid = validateClipTimes(true);
  downloadBtn.disabled = !hasVideo || !timeValid || state.isFetchingInfo;
}

function getDownloadDisabledReason() {
  if (state.carouselData) {
    if (state.isFetchingInfo) return t('Hold on, fetching...');
    if (state.carouselSelected.size === 0) return t('Select items to download');
  }
  if (state.isFetchingInfo) return t('Hold on, fetching video info...');
  if (state.instantDownload) return t('Paste a URL first champ');
  if (!state.videoInfo) return t('Paste a URL first champ');
  if (!validateClipTimes()) return t('Fix clip times (start must be before end)');
  return t('Not ready yet');
}

function validateClipTimes(silent = false) {
  const startSec = parseTimeToSeconds(startTime.value);
  const endSec = parseTimeToSeconds(endTime.value);

  startTime.classList.remove('error');
  endTime.classList.remove('error');

  if (startSec === 0 && endSec === 0) return true;

  if (state.videoInfo) {
    if (startSec > state.videoInfo.duration) {
      startTime.classList.add('error');
      if (!silent) shakeElement(startTime);
      return false;
    }
    if (endSec > state.videoInfo.duration && endSec !== 0) {
      endTime.classList.add('error');
      if (!silent) shakeElement(endTime);
      return false;
    }
  }

  if (endSec !== 0 && startSec >= endSec) {
    startTime.classList.add('error');
    endTime.classList.add('error');
    if (!silent) {
      shakeElement(startTime);
      shakeElement(endTime);
    }
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
    input.classList.remove('auto-filled');
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
    // After formatting, run full validation with shake so user sees errors on blur
    updateDownloadBtnState();
    validateClipTimes(false);
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
    setUrlHint('');
    resetVideoState();
    return;
  }

  if (platform === 'tiktok' && isTiktokPhotoUrl(url)) {
    showStatus('warning', t('TikTok photo slideshows aren\'t supported yet. Video posts work great though!'));
    resetVideoState();
    return;
  }

  urlRow.classList.remove('error');

  // Instant download mode: skip scanning, enable download button immediately
  if (state.instantDownload) {
    if (state.videoInfo) {
      // Clear any previously scanned video so we use the instant path in handleDownload
      state.videoInfo = null;
      videoCard.className = 'video-card';
      startTime.disabled = true;
      endTime.disabled = true;
      hideCarousel();
    }
    setUrlHint(t('Ready: click Instant Download'), true);
    updateDownloadBtnState();
    return;
  }

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
  startTime.classList.remove('auto-filled');

  setUrlHint(t('Scanning the goddamn link...'));
  downloadBtn.textContent = t('Download This Shit');

  videoCard.className = 'video-card visible loading';
  videoThumb.classList.remove('loaded');
  videoThumb.removeAttribute('src');
  videoTitle.textContent = t('Loading...');
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
      ? `Available: ${info.formats.map(f => f.label).join(', ')}`
      : '';

    videoCard.className = 'video-card visible';

    const isYouTube = info.platform === 'youtube' || !info.platform;
    startTime.disabled = !isYouTube;
    endTime.disabled = !isYouTube;

    if (isYouTube) {
      const urlTimestamp = extractYouTubeTimestamp(url);
      if (urlTimestamp > 0) {
        startTime.value = secondsToTimeString(urlTimestamp);
        startTime.classList.add('auto-filled');
        updateTimeHasValue();
      }
    }

    if (isImage) downloadBtn.textContent = t('Download Image');
    updateQualityLabels(info.platform, info.mediaType);
    updateDownloadBtnState();

    setUrlHint(t('Locked in. Ready to rip.'), true);
    setTimeout(() => {
      if (urlHint.textContent.includes(t('Locked in. Ready to rip.'))) {
        setUrlHint('');
      }
    }, 3000);
  } catch (err) {
    videoCard.className = 'video-card';
    state.videoInfo = null;
    showStatus('error', err.message || 'Failed to fetch video info.');
    lastFailedUrl = url;
    statusRetry.style.display = '';
    updateDownloadBtnState();

    setUrlHint('');
  } finally {
    state.isFetchingInfo = false;
    updateDownloadBtnState();
  }
}

function updateTimeHasValue() {
  const zero = '00:00:00';
  startTime.classList.toggle('has-value', startTime.value.trim() !== zero && startTime.value.trim() !== '');
  endTime.classList.toggle('has-value', endTime.value.trim() !== zero && endTime.value.trim() !== '');
}

function resetVideoState() {
  state.videoInfo = null;
  videoCard.className = 'video-card';
  startTime.disabled = true;
  endTime.disabled = true;
  startTime.value = '00:00:00';
  endTime.value = '00:00:00';
  startTime.classList.remove('auto-filled');
  updateTimeHasValue();
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

  setUrlHint(t('Checking Instagram post...'));
  updateDownloadBtnState();

  try {
    const mediaInfo = await window.api.fetchMediaInfo(url);

    if (mediaInfo && mediaInfo.items && mediaInfo.items.length > 0) {
      if (mediaInfo.isCarousel && mediaInfo.items.length > 1) {
        showCarouselPicker(mediaInfo, url);
        updateQualityLabels('instagram', 'carousel');
        setUrlHint(t('Select items to download'), true);

        if (!mediaInfo.items.some(i => i.type === 'video')) {
          fetchAndMergeCarouselVideos(url);
        }
        return;
      }

      const singleItem = mediaInfo.items[0];

      if (singleItem.type === 'video') {
        showSingleVideoCard(mediaInfo, url);
        updateQualityLabels('instagram', 'video');
        setUrlHint(t('Reel ready to download'), true);
        return;
      }

      showSingleImageCard(mediaInfo, url);
      updateQualityLabels('instagram', 'image');
      setUrlHint(t('Image ready to download'), true);
      return;
    }

    showStatus('error', t('Couldn\'t fetch this Instagram post. It may be private or require login.'));
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
    setUrlHint(`Found ${videos.length} video${videos.length > 1 ? 's' : ''} · ${total} items total`, true);
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
  downloadBtn.textContent = t('Download Image');
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
  downloadBtn.textContent = t('Download Reel');
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
    <span class="carousel-thumb__check">${icon('checkmark-circle-02', 'ui-icon ui-icon--sm')}</span>
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
  downloadBtn.textContent = count > 0 ? `Download ${count} Item${count > 1 ? 's' : ''}` : t('Download This Shit');

  carouselSelectAll.textContent = count === total ? t('Deselect All') : t('Select All');
}

function hideCarousel() {
  carouselCard.classList.remove('visible');
  state.carouselData = null;
  state.carouselSelected = new Set();
  downloadBtn.textContent = t('Download This Shit');
}

carouselSelectAll.addEventListener('click', () => {
  if (!state.carouselData) return;
  const total = state.carouselData.items.length;

  if (state.carouselSelected.size === total) {
    state.carouselSelected.clear();
    carouselGrid.querySelectorAll('.carousel-thumb').forEach(el => el.classList.remove('selected'));
  } else {
    for (let i = 0; i < total; i++) state.carouselSelected.add(i);
    carouselGrid.querySelectorAll('.carousel-thumb').forEach(el => el.classList.add('selected'));
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
      <button class="queue-item__action" aria-label="Cancel">${icon('cancel-01', 'ui-icon')}</button>
    </div>
    <div class="queue-item__bar">
      <div class="queue-item__fill downloading" style="width: 0%"></div>
    </div>
    <div class="queue-item__row">
      <span class="queue-item__detail">0 of ${total} items...</span>
      <span class="queue-item__quality">${total} items</span>
    </div>
  `;

  applyQueueItemProjectColors(el);
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
    if (detail) detail.textContent = `Cancelled: ${downloadedCount} of ${total} saved`;
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
    if (detail) detail.innerHTML = icon('checkmark-circle-02', 'ui-icon') + `${downloadedCount} of ${total} saved${errorCount > 0 ? ` (${errorCount} failed)` : ''}`;
    el.className = 'queue-item complete';

    if (filePaths.length > 0 && !el.querySelector('.queue-item__show-file')) {
      const btn = document.createElement('button');
      btn.className = 'queue-item__show-file';
      btn.textContent = t('Show Files');
      detail.parentNode.appendChild(btn);
    }
  }

  updateQueueBadge();
  updateQueueEmpty();
  downloadBtn.disabled = false;
  updateDownloadBtnState();

  if (errorCount > 0 && downloadedCount > 0) {
    showStatus('warning', `Downloaded ${downloadedCount} items, ${errorCount} failed.`);
    const partialTitle = tp('carouselPartialTitle') || 'Carousel partially done, not your best work';
    window.api.showNotification(partialTitle, `${downloadedCount} of ${total} saved`, filePaths[0] || '', 'bad');
  } else if (errorCount > 0 && downloadedCount === 0) {
    showStatus('error', `Failed to download all ${errorCount} items.`);
    const failTitle = tp('carouselFailTitle') || 'Carousel download failed, absolute disaster';
    window.api.showNotification(
      failTitle,
      `All ${errorCount} item${errorCount > 1 ? 's' : ''} failed to download.`,
      '',
      'bad'
    );
  } else {
    showStatus('success', `Downloaded ${downloadedCount} item${downloadedCount > 1 ? 's' : ''}.`);
    const notifTitle = tp('carouselNotifTitle') || 'Carousel downloaded, you absolute legend';
    window.api.showNotification(notifTitle, `${downloadedCount} item${downloadedCount > 1 ? 's' : ''} saved`, filePaths[0] || '', 'good');
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

async function handleInstantInstagramDownload(url) {
  state.isFetchingInfo = true;
  downloadBtn.disabled = true;
  downloadBtn.textContent = t('Hold on, fetching...');

  try {
    const mediaInfo = await window.api.fetchMediaInfo(url);

    if (!mediaInfo || !mediaInfo.items || mediaInfo.items.length === 0) {
      showStatus('error', t('Couldn\'t fetch this Instagram post. It may be private or require login.'));
      return;
    }

    const owner = mediaInfo.owner || 'unknown';
    const caption = mediaInfo.caption || '';

    if (mediaInfo.isCarousel && mediaInfo.items.length > 1) {
      // Auto-select and download all carousel items
      state.carouselData = { items: mediaInfo.items, owner, caption, webpageUrl: url };
      state.carouselSelected = new Set(mediaInfo.items.map((_, i) => i));
      state.isFetchingInfo = false;
      await handleCarouselDownload();
      state.carouselData = null;
      state.carouselSelected = new Set();
      return;
    }

    const singleItem = mediaInfo.items[0];
    const title = caption
      ? caption.slice(0, 80)
      : (singleItem.type === 'video'
          ? `Instagram reel by @${owner}`
          : `Instagram post by @${owner}`);
    const mediaType = singleItem.type === 'video' ? 'video' : 'image';
    const queueId = `${mediaType === 'video' ? 'reel' : 'img'}-${Date.now()}`;

    addDownloadToQueue(queueId, title, 'best');
    if (!state.queueOpen) openQueue();
    downloadBtn.classList.add('kick');
    downloadBtn.addEventListener('animationend', () => downloadBtn.classList.remove('kick'), { once: true });

    const dl = state.downloads.get(queueId);
    if (dl) { dl.status = 'downloading'; dl.percent = 0; }
    const pm = progressManagers.get(queueId);
    if (pm) pm.set(mediaType === 'video' ? 15 : 30);
    updateQueueItem(queueId);

    try {
      if (mediaType === 'video' && pm) pm.set(40);
      const result = await window.api.downloadImage({
        url: singleItem.url,
        filename: title,
        title,
        postOwner: owner,
        caption,
        webpageUrl: url,
        outputPath: state.downloadPath,
        mediaType,
      });
      if (dl) { dl.status = 'complete'; dl.percent = 100; dl.filePath = result.filePath; }
      if (pm) {
        pm.finish();
        setTimeout(() => { pm.stop(); progressManagers.delete(queueId); updateQueueItem(queueId); }, 600);
      } else {
        updateQueueItem(queueId);
      }
    } catch (err) {
      if (dl) { dl.status = 'error'; dl.error = err.message || `Failed to download ${mediaType}.`; }
      if (pm) pm.stop();
      progressManagers.delete(queueId);
      updateQueueItem(queueId);
      showStatus('error', err.message || `Failed to download ${mediaType}.`);
    }
  } catch (err) {
    showStatus('error', err.message || 'Failed to fetch Instagram content. It may be private or require login.');
  } finally {
    state.isFetchingInfo = false;
    updateDownloadBtnLabel();
    updateDownloadBtnState();
  }
}

async function handleDownload() {
  if (state.carouselData && state.carouselSelected.size > 0) {
    await handleCarouselDownload();
    return;
  }

  // Instant download mode: download directly without prior scan
  if (state.instantDownload && !state.videoInfo) {
    const url = urlInput.value.trim();
    const platform = detectPlatform(url);

    if (platform === 'instagram') {
      await handleInstantInstagramDownload(url);
      return;
    }

    // YouTube / TikTok — pass directly to yt-dlp
    const activeCount = [...state.downloads.values()].filter(
      d => d.status === 'preparing' || d.status === 'downloading'
    ).length;
    if (activeCount >= MAX_CONCURRENT) {
      showStatus('warning', tp('maxConcurrent', MAX_CONCURRENT) || `Slow down, you greedy bastard! Max ${MAX_CONCURRENT} at once.`);
      shakeElement(downloadBtn);
      return;
    }

    hideStatus();
    const platformTitle = platform === 'tiktok' ? 'TikTok video' : 'YouTube video';

    try {
      const result = await window.api.startDownload({
        url,
        quality: state.selectedQuality,
        startTime: startTime.value,
        endTime: endTime.value,
        outputPath: state.downloadPath,
        title: null,
      });
      addDownloadToQueue(result.id, platformTitle, state.selectedQuality);
      downloadBtn.classList.add('kick');
      downloadBtn.addEventListener('animationend', () => downloadBtn.classList.remove('kick'), { once: true });
      if (!state.queueOpen) openQueue();
    } catch (err) {
      showStatus('error', err.message || t('Download crashed and burned, you buffoon. Try again.'));
    }
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
    showStatus('warning', tp('maxConcurrent', MAX_CONCURRENT) || `Slow down, you greedy bastard! Max ${MAX_CONCURRENT} at once.`);
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
    showStatus('error', err.message || t('Download crashed and burned, you buffoon. Try again.'));
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
  if (data.status) dl.statusKey = data.status;
  if (data.convertPercent != null) dl.convertPercent = data.convertPercent;
  if (data.percent >= 99.5) {
    if (!dl.processingStarted) dl.processingStarted = Date.now();
  } else {
    dl.processingStarted = null;
    dl.statusKey = null;
    dl.convertPercent = null;
  }
  progressManagers.get(data.id)?.set(data.percent);
  updateQueueItem(data.id);
});

setInterval(() => {
  for (const [id, dl] of state.downloads) {
    if (dl.status === 'downloading' && dl.processingStarted) {
      updateQueueItem(id);
    }
  }
}, 1000);

window.api.onDownloadComplete((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'complete';
  dl.filePath = data.filePath;
  dl.percent = 100;
  state.lastDownloadedFile = data.filePath;

  // For instant downloads, the queue title is a placeholder — extract real title from filename
  if (data.filePath && (dl.title === 'YouTube video' || dl.title === 'TikTok video')) {
    const filename = data.filePath.split('/').pop().replace(/\.[^.]+$/, '');
    if (filename) dl.title = filename;
  }

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

  showStatus('success', t('Done, you lucky bastard!'));
});

window.api.onDownloadError((data) => {
  const dl = state.downloads.get(data.id);
  if (!dl) return;
  dl.status = 'error';
  dl.error = data.error || t('Failed miserably');
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
  showStatus('info', t('Download cancelled'));
});

/* ============================================================
   Clipboard Auto-Detect (guarded by autoPaste setting)
   ============================================================ */

window.api.onYtdlpUpdated((version) => {
  showStatus('success', tp('ytdlpAutoUpdated', version) || `Download engine updated to ${version}. Let's go!`);
});

window.api.onBackgroundActivity((data) => {
  if (data.type === 'ytdlp-check') {
    if (data.status === 'downloading') {
      showActivityToast(t('First-time setup: downloading engine…'));
    } else if (data.status === 'checking') {
      showActivityToast(t('Hold tight, making sure everything works…'));
    } else if (data.status === 'updated') {
      completeActivityToast(t('All systems go, baby'));
    } else if (data.status === 'up-to-date') {
      completeActivityToast(t('All systems go, baby'));
    } else {
      completeActivityToast(t('Ready'), 2000);
    }
  }
});

let isFirstFocus = true;

window.api.onWindowFocus(async () => {
  if (isFirstFocus) { isFirstFocus = false; return; }
  if (!state.autoPaste) return;
  if (state.isFetchingInfo) return;
  try {
    const text = await window.api.getClipboard();
    if (text && isValidURL(text) && text !== state.lastClipboardUrl && text !== urlInput.value.trim()) {
      state.lastClipboardUrl = text;
      urlInput.value = text;
      const platform = detectPlatform(text);
      const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : '';
      setUrlHint(`${platformName} link detected in clipboard`, true);
      handleUrlChange();

      setTimeout(() => {
        if (urlHint.textContent.includes('detected in clipboard')) {
          setUrlHint('');
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
   Quality Selector — context-adaptive labels + resolution dropdown
   ============================================================ */

const PRESET_QUALITIES = [
  { label: 'Best',   height: 'best' },
  { label: '4K',     height: '2160' },
  { label: '1440p',  height: '1440' },
  { label: '1080p',  height: '1080' },
  { label: '720p',   height: '720'  },
  { label: '480p',   height: '480'  },
];

function qualityToLabel(quality) {
  if (!quality || quality === 'best') return 'Best';
  if (quality === 'audio') return 'Audio Only';
  const h = parseInt(quality, 10);
  if (h >= 2160) return '4K';
  if (h >= 1440) return '1440p';
  if (h >= 1080) return '1080p';
  if (h >= 720)  return '720p';
  if (h >= 480)  return '480p';
  return `${h}p`;
}

// When "best" is selected, show "Best / 4K" so users know it adapts to the video
function bestLabel(formats) {
  return formats?.[0] ? `Best / ${formats[0].label}` : 'Best';
}

function buildPresetDropdown(selectedQuality) {
  qualityDropdownList.innerHTML = '';
  for (const preset of PRESET_QUALITIES) {
    const isActive = preset.height === 'best'
      ? (!selectedQuality || selectedQuality === 'best')
      : String(selectedQuality) === preset.height;
    const item = document.createElement('button');
    item.className = 'quality-dropdown__item' + (isActive ? ' active' : '');
    item.dataset.height = preset.height;
    item.innerHTML = `
      <span class="quality-dropdown__item-label">${preset.label}</span>
      <i class="hgi-stroke hgi-tick-01 quality-dropdown__item-check" aria-hidden="true"></i>
    `;
    qualityDropdownList.appendChild(item);
  }
}

function updateDownloadBtnLabel() {
  if (state.instantDownload) {
    downloadBtn.textContent = t('Instant Download');
    return;
  }
  if (state.videoInfo?.mediaType === 'image') {
    downloadBtn.textContent = t('Download Image');
  } else if (state.videoInfo?._directVideoUrl) {
    downloadBtn.textContent = t('Download Reel');
  } else if (state.carouselData) {
    const count = state.carouselSelected.size;
    const total = state.carouselData.items.length;
    downloadBtn.textContent = count > 0 ? `Download ${count} Item${count > 1 ? 's' : ''}` : t('Download This Shit');
    carouselSelectAll.textContent = count === total ? t('Deselect All') : t('Select All');
  } else {
    downloadBtn.textContent = t('Download This Shit');
  }
}

function openQualityDropdown() {
  if (state.qualityDropdownOpen) return;
  state.qualityDropdownOpen = true;
  qualityDropdown.classList.add('visible');
  qualityBackdrop.classList.add('visible');
  qualityChevron.classList.add('open');
}

function closeQualityDropdown() {
  if (!state.qualityDropdownOpen) return;
  state.qualityDropdownOpen = false;
  qualityDropdown.classList.remove('visible');
  qualityBackdrop.classList.remove('visible');
  qualityChevron.classList.remove('open');
}

function buildQualityDropdown(formats, selectedHeight) {
  qualityDropdownList.innerHTML = '';

  // "Best" option (auto highest quality)
  const bestItem = document.createElement('button');
  bestItem.className = 'quality-dropdown__item' + (selectedHeight === null ? ' active' : '');
  bestItem.dataset.height = 'best';
  bestItem.innerHTML = `
    <span class="quality-dropdown__item-label">Best Available${formats[0] ? ` (${formats[0].label})` : ''}</span>
    <i class="hgi-stroke hgi-tick-01 quality-dropdown__item-check" aria-hidden="true"></i>
  `;
  qualityDropdownList.appendChild(bestItem);

  // Resolution-specific options
  for (const fmt of formats) {
    const item = document.createElement('button');
    const isActive = selectedHeight !== null && String(selectedHeight) === String(fmt.height);
    item.className = 'quality-dropdown__item' + (isActive ? ' active' : '');
    item.dataset.height = String(fmt.height);
    item.innerHTML = `
      <span class="quality-dropdown__item-label">${fmt.label}</span>
      <i class="hgi-stroke hgi-tick-01 quality-dropdown__item-check" aria-hidden="true"></i>
    `;
    qualityDropdownList.appendChild(item);
  }
}

// Single permanent event listener for quality dropdown item selection
qualityDropdownList.addEventListener('click', (e) => {
  const item = e.target.closest('.quality-dropdown__item');
  if (!item) return;

  const heightVal = item.dataset.height;
  if (heightVal === 'best') {
    state.selectedResolutionHeight = null;
    state.selectedQuality = 'best';
    qualityBtnLabel.textContent = bestLabel(state.videoInfo?.formats);
  } else {
    state.selectedResolutionHeight = heightVal;
    state.selectedQuality = heightVal;
    const fmt = (state.videoInfo?.formats || []).find(f => String(f.height) === heightVal);
    qualityBtnLabel.textContent = fmt ? fmt.label : qualityToLabel(heightVal);
  }

  qualityDropdownList.querySelectorAll('.quality-dropdown__item').forEach(el => el.classList.remove('active'));
  item.classList.add('active');

  window.api.setSetting('quality', state.selectedQuality);
  closeQualityDropdown();
});

function updateQualityLabels(platform, contentType) {
  const buttons = qualitySelector.querySelectorAll('.quality-option');
  if (buttons.length < 2) return;

  if (contentType === 'image' || contentType === 'carousel') {
    qualityBtnLabel.textContent = 'Original Quality';
    buttons[1].classList.add('collapsed');
    qualitySelector.classList.add('compact');
    buttons.forEach(b => b.classList.remove('active'));
    buttons[0].classList.add('active');
    state.selectedQuality = 'best';
    state.selectedResolutionHeight = null;
    qualityChevron.classList.remove('visible');
    closeQualityDropdown();
  } else {
    qualitySelector.classList.remove('compact');
    buttons[1].classList.remove('collapsed');

    const isYouTube = platform === 'youtube' || !platform;
    const formats = state.videoInfo?.formats || [];

    if (isYouTube && formats.length > 0) {
      qualityChevron.classList.add('visible');
      buildQualityDropdown(formats, state.selectedResolutionHeight);

      // Reconcile pre-selected quality with what's actually available
      if (state.selectedQuality === 'best') {
        qualityBtnLabel.textContent = bestLabel(formats);
      } else if (state.selectedQuality !== 'audio') {
        const selectedH = parseInt(state.selectedQuality, 10);
        const exactMatch = formats.find(f => f.height === selectedH);
        if (exactMatch) {
          state.selectedResolutionHeight = String(selectedH);
          qualityBtnLabel.textContent = exactMatch.label;
        } else {
          // Fall back to the next highest available resolution
          const fallback = formats.find(f => f.height <= selectedH) || formats[formats.length - 1];
          const originalLabel = qualityToLabel(state.selectedQuality);
          state.selectedQuality = String(fallback.height);
          state.selectedResolutionHeight = String(fallback.height);
          qualityBtnLabel.textContent = fallback.label;
          window.api.setSetting('quality', state.selectedQuality);
          showStatus('info', `${originalLabel} not available, using ${fallback.label}`);
          // Rebuild dropdown to reflect the new active item
          buildQualityDropdown(formats, state.selectedResolutionHeight);
        }
      }
    } else if (isYouTube) {
      // YouTube but no formats retrieved — show presets
      qualityChevron.classList.add('visible');
      buildPresetDropdown(state.selectedQuality);
      qualityBtnLabel.textContent = qualityToLabel(state.selectedQuality);
    } else {
      // Non-YouTube platform (TikTok) — no dropdown
      qualityChevron.classList.remove('visible');
      qualityBtnLabel.textContent = 'Best Quality';
      qualityDropdownList.innerHTML = '';
    }

    // Ensure video button is active (reset from any audio state)
    if (state.selectedQuality !== 'audio') {
      buttons.forEach(b => b.classList.remove('active'));
      buttons[0].classList.add('active');
      requestAnimationFrame(() => updatePillPosition(true));
    }
  }
  requestAnimationFrame(() => updatePillPosition(true));
}

function resetQualityLabels() {
  const buttons = qualitySelector.querySelectorAll('.quality-option');
  if (buttons.length < 2) return;
  qualitySelector.classList.remove('compact');
  buttons[1].classList.remove('collapsed');
  closeQualityDropdown();

  if (state.selectedQuality === 'audio') {
    // Audio mode: keep audio button active, hide chevron
    qualityChevron.classList.remove('visible');
  } else {
    qualityBtnLabel.textContent = qualityToLabel(state.selectedQuality);
    qualityChevron.classList.add('visible');
    buildPresetDropdown(state.selectedQuality);
    buttons.forEach(b => b.classList.remove('active'));
    buttons[0].classList.add('active');
  }
  requestAnimationFrame(() => updatePillPosition(true));
}

qualitySelector.addEventListener('click', (e) => {
  const option = e.target.closest('.quality-option');
  if (!option) return;

  const clickedQuality = option.dataset.quality;

  if (clickedQuality === 'audio') {
    closeQualityDropdown();
    qualitySelector.querySelectorAll('.quality-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    state.selectedQuality = 'audio';
    state.selectedResolutionHeight = null;
    window.api.setSetting('quality', 'audio');
    updatePillPosition(true);
    return;
  }

  // Clicked the video/photo button
  const wasAlreadyActive = option.classList.contains('active');
  qualitySelector.querySelectorAll('.quality-option').forEach(o => o.classList.remove('active'));
  option.classList.add('active');

  if (state.selectedQuality !== 'audio') {
    // Keep the existing quality selection (don't reset to 'best' when re-clicking)
  } else {
    // Switching from audio back to video — restore label for existing quality selection
    const formats = state.videoInfo?.formats || [];
    const restoredQuality = state.selectedQuality === 'audio' ? 'best' : state.selectedQuality;
    qualityBtnLabel.textContent = restoredQuality === 'best' ? bestLabel(formats) : (formats.find(f => String(f.height) === restoredQuality)?.label ?? qualityToLabel(restoredQuality));
    state.selectedQuality = restoredQuality;
    state.selectedResolutionHeight = state.selectedQuality === 'best' ? null : state.selectedQuality;
    window.api.setSetting('quality', state.selectedQuality);
  }

  updatePillPosition(true);

  // Toggle dropdown on click (always available — presets pre-scan, actual formats post-scan)
  const isImageOrCarousel = state.videoInfo?.mediaType === 'image' || state.videoInfo?.mediaType === 'carousel' || !!state.carouselData;
  if (wasAlreadyActive && !isImageOrCarousel) {
    if (state.qualityDropdownOpen) {
      closeQualityDropdown();
    } else {
      const formats = state.videoInfo?.formats || [];
      if (formats.length > 0) {
        buildQualityDropdown(formats, state.selectedResolutionHeight);
      } else {
        buildPresetDropdown(state.selectedQuality);
      }
      openQualityDropdown();
    }
  }
});

qualityBackdrop.addEventListener('click', closeQualityDropdown);

/* ============================================================
   Event Bindings
   ============================================================ */

urlInput.addEventListener('input', handleUrlChange);

urlClear.addEventListener('click', () => {
  clearTimeout(fetchDebounce);
  state.isFetchingInfo = false;
  urlInput.value = '';
  setUrlHint('');
  urlRow.classList.remove('error');
  resetVideoState();
  hideStatus();
  urlClear.classList.remove('visible');
  setSticker('default');
});

downloadBtn.addEventListener('click', handleDownload);

startTime.addEventListener('input', updateTimeHasValue);
endTime.addEventListener('input', updateTimeHasValue);

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
    updatePathDisplay();
  }
});

function getEffectivePath() {
  if (state.activeProject) {
    return state.downloadPath + '/' + state.activeProject;
  }
  return state.downloadPath;
}

function updatePathDisplay() {
  const effective = getEffectivePath();
  pathDisplay.innerHTML = '<span class="path-display__label">save to:</span> ' + escapeHtml(truncatePath(effective));
  pathDisplay.title = effective;
}

function updateProjectUI() {
  if (state.activeProject) {
    const c = projectColors(state.activeProject);
    projectPill.style.setProperty('--proj-bright', c.bright);
    projectPill.style.setProperty('--proj-dark', c.dark);
    projectPill.style.setProperty('--proj-on-bright', c.onBright);
    projectPill.style.setProperty('--proj-pill-text', c.pillText);
    projectPill.style.setProperty('--proj-light-bg', c.lightBg);
    projectPill.style.setProperty('--proj-light-text', c.lightText);
    videoCard.style.setProperty('--proj-dark', c.dark);
    videoCard.style.setProperty('--proj-bright', c.bright);
    videoCard.style.setProperty('--proj-subtle', c.subtle);
    videoCard.style.setProperty('--proj-bright-sub', c.brightSub);
    videoCard.style.setProperty('--proj-shimmer-lo', c.shimmerLo);
    videoCard.style.setProperty('--proj-shimmer-hi', c.shimmerHi);
    videoCard.style.setProperty('--proj-light-bg', c.lightBg);
    videoCard.style.setProperty('--proj-light-text', c.lightText);
    projectBtn.style.display = 'none';
    projectPill.style.display = '';
    projectPillName.textContent = state.activeProject;
  } else {
    projectPill.style.removeProperty('--proj-bright');
    projectPill.style.removeProperty('--proj-dark');
    projectPill.style.removeProperty('--proj-on-bright');
    projectPill.style.removeProperty('--proj-pill-text');
    projectPill.style.removeProperty('--proj-light-bg');
    projectPill.style.removeProperty('--proj-light-text');
    videoCard.style.removeProperty('--proj-dark');
    videoCard.style.removeProperty('--proj-bright');
    videoCard.style.removeProperty('--proj-subtle');
    videoCard.style.removeProperty('--proj-bright-sub');
    videoCard.style.removeProperty('--proj-shimmer-lo');
    videoCard.style.removeProperty('--proj-shimmer-hi');
    videoCard.style.removeProperty('--proj-light-bg');
    videoCard.style.removeProperty('--proj-light-text');
    projectBtn.style.display = '';
    projectPill.style.display = 'none';
    projectPillName.textContent = '';
  }
  updatePathDisplay();
}

function openProjectDropdown() {
  state.projectDropdownOpen = true;
  closeQualityDropdown();
  pathRow.classList.add('project-open');
  projectDropdown.classList.add('visible');
  projectBackdrop.classList.add('visible');
  projectInput.value = '';
  projectInput.placeholder = state.projects.length
    ? t('Add new project')
    : t('Name this project, fam');
  renderProjectList();
  requestAnimationFrame(() => projectInput.focus());
}

function closeProjectDropdown() {
  state.projectDropdownOpen = false;
  pathRow.classList.remove('project-open');
  projectDropdown.classList.remove('visible');
  projectBackdrop.classList.remove('visible');
  projectInput.value = '';
}

function renderProjectList(filter) {
  const term = (filter || '').toLowerCase();
  const filtered = term
    ? state.projects.filter(p => p.toLowerCase().includes(term))
    : state.projects;

  projectList.innerHTML = '';

  if (filtered.length === 0 && !term) {
    projectEmpty.style.display = '';
    projectHint.style.display = 'none';
    return;
  }
  projectEmpty.style.display = 'none';

  const exactMatch = term && state.projects.some(p => p.toLowerCase() === term);
  if (term && !exactMatch) {
    projectHint.textContent = `Press Enter to create "${filter}"`;
    projectHint.style.display = '';
  } else {
    projectHint.style.display = 'none';
  }

  const counts = {};
  for (const entry of state.historyData) {
    if (entry.project) {
      counts[entry.project] = (counts[entry.project] || 0) + 1;
    }
  }

  for (const name of filtered) {
    const row = document.createElement('button');
    row.className = 'project-dropdown__item';
    if (state.activeProject === name) row.classList.add('active');
    const c = projectColors(name);
    row.style.setProperty('--proj-bright', c.bright);
    row.style.setProperty('--proj-hover', c.hover);
    row.style.setProperty('--proj-light-bg', c.lightBg);
    row.style.setProperty('--proj-light-text', c.lightText);
    const count = counts[name] || 0;
    row.innerHTML = `
      <span class="project-dropdown__item-name">${escapeHtml(name)}</span>
      <span class="project-dropdown__item-count">${count}</span>
      <span class="project-dropdown__item-delete" title="Delete project">${icon('cancel-01', 'ui-icon ui-icon--sm')}</span>
    `;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.project-dropdown__item-delete')) return;
      if (state.activeProject === name) {
        setActiveProject(null);
      } else {
        setActiveProject(name);
      }
      closeProjectDropdown();
    });
    row.querySelector('.project-dropdown__item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProject(name);
    });
    projectList.appendChild(row);
  }
}

async function setActiveProject(name) {
  const result = await window.api.setActiveProject(name);
  if (result?.name) {
    state.activeProject = result.name;
    state.projectHues = result.projectHues;
    const existing = state.projects.filter(p => p !== result.name);
    existing.unshift(result.name);
    state.projects = existing;
    showStatus('info', `Locked into ${result.name}. Downloads go there now.`);
  } else {
    state.activeProject = null;
    showStatus('info', 'Project cleared. Back to the main dump.');
  }
  updateProjectUI();
}

async function deleteProject(name) {
  const result = await window.api.deleteProject(name);
  state.projects = result.projects;
  state.projectHues = result.projectHues;
  if (state.activeProject === name) {
    state.activeProject = null;
  }
  updateProjectUI();
  renderProjectList(projectInput.value.trim());
}

projectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.projectDropdownOpen) {
    closeProjectDropdown();
  } else {
    openProjectDropdown();
  }
});

projectPillClear.addEventListener('click', (e) => {
  e.stopPropagation();
  setActiveProject(null);
});

projectPill.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.projectDropdownOpen) {
    closeProjectDropdown();
  } else {
    openProjectDropdown();
  }
});

projectBackdrop.addEventListener('click', () => {
  closeProjectDropdown();
});

projectInput.addEventListener('input', () => {
  renderProjectList(projectInput.value.trim());
});

projectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const name = projectInput.value.trim();
    if (name) {
      setActiveProject(name);
      closeProjectDropdown();
    }
  } else if (e.key === 'Escape') {
    closeProjectDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault();
    if (state.historyOpen || state.settingsOpen) return;
    if (state.projectDropdownOpen) {
      closeProjectDropdown();
    } else {
      openProjectDropdown();
    }
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

if (instantDownloadToggle) {
  instantDownloadToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    state.instantDownload = !state.instantDownload;
    instantDownloadToggle.classList.toggle('active', state.instantDownload);
    window.api.setSetting('instantDownload', state.instantDownload);
    updateDownloadBtnLabel();

    if (state.instantDownload) {
      showStatus('success', t('Instant Downloads on: paste a link and hit download, no waiting'));
    } else {
      showStatus('info', t('Instant Downloads off: links will scan first so you can preview and confirm'));
    }

    // Re-run URL handling so the hint and button state reflect the new mode.
    // If a URL is already in the input: instant ON → skip scan and enable button;
    // instant OFF → clear videoInfo and re-trigger scan.
    const currentUrl = urlInput.value.trim();
    if (currentUrl) {
      if (!state.instantDownload) {
        // Turning off: clear cached video info so it re-scans
        state.videoInfo = null;
        videoCard.className = 'video-card';
        hideCarousel();
      }
      handleUrlChange();
    } else {
      updateDownloadBtnState();
    }
  });
}

modeToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  state.mode = state.mode === 'unhinged' ? 'professional' : 'unhinged';
  modeToggle.classList.toggle('active', state.mode === 'professional');
  window.api.setSetting('mode', state.mode);
  applyMode();
  if (state.mode === 'unhinged') {
    showStatus('success', 'Lets fucking go! Welcome to Unhinged mode lol');
  } else {
    showStatus('success', 'Honestly, fair enough. Welcome to Professional mode');
    setSticker('bad');
  }
});

enforceTimeFormat(startTime);
enforceTimeFormat(endTime);

updateYtdlpBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  updateYtdlpBtn.disabled = true;
  updateYtdlpBtn.textContent = t('Updating…');
  updateYtdlpBtn.classList.add('updating');
  updateStatus.textContent = t('Downloading latest version…');
  updateStatus.className = 'update-status';
  try {
    const result = await window.api.updateYtdlp();
    if (result.success) {
      updateStatus.textContent = t('Done!');
      updateStatus.className = 'update-status success';
      showStatus('success', tp('ytdlpUpdated', result.version) || `Download engine updated to ${result.version}, let's go!`);
      setTimeout(() => { updateStatus.textContent = ''; }, 4000);
    } else {
      updateStatus.textContent = result.error || t('Something went wrong');
      updateStatus.className = 'update-status error';
    }
  } catch (err) {
    updateStatus.textContent = t('Couldn\'t reach the server. Check your connection.');
    updateStatus.className = 'update-status error';
  } finally {
    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.textContent = t('Update');
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
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString();
}

function qualityLabel(q, resolution) {
  if (q === 'audio') return 'Audio';
  const res = resolution && typeof resolution === 'object' ? resolution.label : resolution;
  if (res) return res;
  if (q === 'best') return 'Best';
  if (q === 'hd') return '1080p';
  return q;
}

async function openHistory() {
  state.historyOpen = true;
  state.historyProjectFilter = null;
  closeSettings();
  closeQueue();
  closeProjectDropdown();
  historyView.classList.add('visible');
  syncHistoryViewBtns();
  requestAnimationFrame(() => updateHistoryFilterPill(false));
  await loadHistory();
}

function syncHistoryViewBtns() {
  historyViewToggles.querySelectorAll('.history-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.historyViewMode);
  });
}

function closeHistory() {
  state.historyOpen = false;
  historyView.classList.remove('visible');
  historySearch.value = '';
  state.historySearchTerm = '';
  state.historyProjectFilter = null;
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

  if (state.historyProjectFilter) {
    entries = entries.filter(e => e.project === state.historyProjectFilter);
  }

  if (state.historySearchTerm) {
    const term = state.historySearchTerm.toLowerCase();
    entries = entries.filter(e => {
      const searchable = [
        e.title, e.uploader, e.channel,
        e.webpageUrl, e.description, e.videoId,
        e.platform || '', e.project || '',
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

function buildExportData(entries) {
  const project = state.historyProjectFilter || null;
  const sorted = [...entries].sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));

  const downloads = sorted.map(e => {
    const isCarousel = e.mediaType === 'carousel' && e.carouselItems?.length > 0;
    const isImage = e.mediaType === 'image' || isCarousel;
    const clipStart = e.clipStart && e.clipStart !== '00:00:00' ? e.clipStart : null;
    const clipEnd = e.clipEnd && e.clipEnd !== '00:00:00' ? e.clipEnd : null;
    const clip = clipStart || clipEnd ? `${clipStart || '00:00:00'} to ${clipEnd || 'end'}` : null;

    const out = {
      title:       e.title || null,
      source:      e.webpageUrl || null,
      platform:    e.platform || null,
      mediaType:   e.mediaType || null,
      channel:     e.channel || e.uploader || null,
      channelUrl:  e.channelUrl || null,
      uploadDate:  e.uploadDate ? formatUploadDate(e.uploadDate) : null,
      downloadedAt: formatFullDate(e.downloadedAt),
      duration:    !isImage ? formatDuration(e.duration) : null,
      clip,
      quality:     !isImage ? (qualityLabel(e.quality, e.resolution) + ' · ' + (e.format || '').toUpperCase()) : null,
      format:      e.format || null,
      views:       e.viewCount ?? null,
      likes:       e.likeCount ?? null,
      categories:  e.categories?.length ? e.categories : null,
      tags:        e.tags?.length ? e.tags : null,
      license:     e.license || null,
      description: e.description || null,
    };

    if (isCarousel && e.carouselItems?.length) {
      out.files = e.carouselItems.map((ci, i) => ({
        index: i + 1,
        file: ci.filePath || null,
        fileSize: formatFileSize(ci.fileSize),
        mediaType: ci.mediaType,
        format: ci.format,
      }));
      out.totalSize = formatFileSize(e.fileSize);
    } else {
      out.file = e.filePath || null;
      out.fileSize = formatFileSize(e.fileSize);
    }

    if (e.project) out.project = e.project;
    return out;
  });

  return {
    export: {
      project:        project || 'All',
      exportedAt:     new Date().toISOString(),
      totalDownloads: downloads.length,
      generatedBy:    'Downroad',
    },
    downloads,
  };
}

function buildExportCsv(entries) {
  const headers = [
    'Title', 'Source', 'Platform', 'Media Type', 'Channel', 'Channel URL',
    'Upload Date', 'Downloaded At', 'Duration', 'Clip', 'Quality', 'Format',
    'Views', 'Likes', 'File', 'File Size', 'Project', 'Categories', 'Tags',
    'License', 'Description',
  ];

  function cell(val) {
    if (val == null || val === '') return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const rows = [headers.join(',')];
  const sorted = [...entries].sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));

  for (const e of sorted) {
    const isCarousel = e.mediaType === 'carousel' && e.carouselItems?.length > 0;
    const isImage = e.mediaType === 'image' || isCarousel;
    const clipStart = e.clipStart && e.clipStart !== '00:00:00' ? e.clipStart : null;
    const clipEnd   = e.clipEnd   && e.clipEnd   !== '00:00:00' ? e.clipEnd   : null;
    const clip = clipStart || clipEnd ? `${clipStart || '00:00:00'} to ${clipEnd || 'end'}` : '';
    const file     = isCarousel ? `${e.carouselItems.length} files` : (e.filePath || '');
    const fileSize = formatFileSize(e.fileSize);
    const quality  = !isImage
      ? `${qualityLabel(e.quality, e.resolution)} · ${(e.format || '').toUpperCase()}`
      : '';

    rows.push([
      e.title || '',
      e.webpageUrl || '',
      e.platform || '',
      e.mediaType || '',
      e.channel || e.uploader || '',
      e.channelUrl || '',
      e.uploadDate ? formatUploadDate(e.uploadDate) : '',
      formatFullDate(e.downloadedAt),
      !isImage ? formatDuration(e.duration) : '',
      clip,
      quality,
      e.format || '',
      e.viewCount != null ? e.viewCount : '',
      e.likeCount != null ? e.likeCount : '',
      file,
      fileSize,
      e.project || '',
      (e.categories || []).join(' | '),
      (e.tags || []).join(' | '),
      e.license || '',
      e.description || '',
    ].map(cell).join(','));
  }

  // BOM so Excel/Numbers auto-detect UTF-8
  return '\uFEFF' + rows.join('\r\n');
}

async function exportHistory() {
  const entries = getFilteredHistory();
  if (!entries.length) return;

  const content = buildExportCsv(entries);

  const dateStr = new Date().toISOString().slice(0, 10);
  const projectSlug = state.historyProjectFilter
    ? state.historyProjectFilter.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'History';
  const defaultPath = `Downroad-${projectSlug}-${dateStr}.csv`;

  historyExportBtn.disabled = true;
  const result = await window.api.saveFile({ defaultPath, content });
  historyExportBtn.disabled = false;

  if (result?.saved) {
    const original = historyExportBtn.innerHTML;
    historyExportBtn.innerHTML = `${icon('tick-01', 'ui-icon ui-icon--action')}Exported!`;
    setTimeout(() => { historyExportBtn.innerHTML = original; }, 1800);
  }
}

function updateExportBtnLabel() {
  if (!historyExportBtn) return;
  const label = state.historyProjectFilter
    ? `Export "${state.historyProjectFilter}"`
    : 'Export All';
  historyExportBtn.innerHTML = `${icon('download-04', 'ui-icon ui-icon--action')}${label}`;
}

function renderHistoryList() {
  const entries = getFilteredHistory();
  historyList.innerHTML = '';
  collapseActiveCard = null;
  if (_closeDetailModal) _closeDetailModal();

  const count = entries.length;
  historyCount.textContent = `${count} download${count !== 1 ? 's' : ''}`;

  updateHistoryProjectFilter();
  updateExportBtnLabel();

  if (count === 0) {
    historyEmpty.classList.add('visible');
    historyList.style.display = 'none';
    return;
  }

  historyEmpty.classList.remove('visible');
  historyList.style.display = '';

  historyList.classList.remove('history-list--list', 'history-list--grid', 'history-list--compact');
  historyList.classList.add(`history-list--${state.historyViewMode}`);

  for (const entry of entries) {
    if (state.historyViewMode === 'grid') {
      historyList.appendChild(createHistoryGridCardEl(entry));
    } else if (state.historyViewMode === 'compact') {
      historyList.appendChild(createHistoryCompactRowEl(entry));
    } else {
      historyList.appendChild(createHistoryEntryEl(entry));
    }
  }
}

function updateHistoryProjectFilter() {
  const projectsInHistory = new Set();
  for (const entry of state.historyData) {
    if (entry.project) projectsInHistory.add(entry.project);
  }

  if (projectsInHistory.size === 0) {
    historyProjectFilter.style.display = 'none';
    return;
  }
  historyProjectFilter.style.display = '';

  const projectFilterLabel = state.historyProjectFilter || 'All Projects';
  historyProjectBtn.innerHTML = `
    <span class="history-project-filter-btn__label">${escapeHtml(projectFilterLabel)}</span>
    ${icon('arrow-down-01', 'ui-icon history-project-filter-btn__icon')}
  `;
  historyProjectBtn.classList.toggle('active', !!state.historyProjectFilter);
  if (state.historyProjectFilter) {
    const bc = projectColors(state.historyProjectFilter);
    historyProjectBtn.style.setProperty('--proj-bright', bc.bright);
    historyProjectBtn.style.setProperty('--proj-dark', bc.dark);
    historyProjectBtn.style.setProperty('--proj-light-bg', bc.lightBg);
    historyProjectBtn.style.setProperty('--proj-light-text', bc.lightText);
  } else {
    historyProjectBtn.style.removeProperty('--proj-bright');
    historyProjectBtn.style.removeProperty('--proj-dark');
    historyProjectBtn.style.removeProperty('--proj-light-bg');
    historyProjectBtn.style.removeProperty('--proj-light-text');
  }

  historyProjectMenu.innerHTML = '';
  const allItem = document.createElement('button');
  allItem.className = 'history-project-menu__item';
  if (!state.historyProjectFilter) allItem.classList.add('active');
  allItem.textContent = 'All Projects';
  allItem.addEventListener('click', (e) => {
    e.stopPropagation();
    state.historyProjectFilter = null;
    historyProjectMenu.classList.remove('visible');
    renderHistoryList();
  });
  historyProjectMenu.appendChild(allItem);

  for (const name of projectsInHistory) {
    const item = document.createElement('button');
    item.className = 'history-project-menu__item';
    if (state.historyProjectFilter === name) item.classList.add('active');
    const c = projectColors(name);
    item.style.setProperty('--proj-bright', c.bright);
    item.style.setProperty('--proj-dark', c.dark);
    item.style.setProperty('--proj-hover', c.hover);
    item.style.setProperty('--proj-light-bg', c.lightBg);
    item.style.setProperty('--proj-light-text', c.lightText);
    item.textContent = name;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      state.historyProjectFilter = name;
      historyProjectMenu.classList.remove('visible');
      renderHistoryList();
    });
    historyProjectMenu.appendChild(item);
  }
}

historyProjectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  historyProjectMenu.classList.toggle('visible');
});

document.addEventListener('click', (e) => {
  if (!historyProjectFilter.contains(e.target)) {
    historyProjectMenu.classList.remove('visible');
  }
});

// Tracks the collapse function of the currently open card so only one is open at a time
let collapseActiveCard = null;

function createHistoryEntryEl(entry) {
  const el = document.createElement('div');
  el.className = 'history-entry';
  el.dataset.id = entry.id;
  if (entry.project) {
    const c = projectColors(entry.project);
    el.style.setProperty('--proj-dark', c.dark);
    el.style.setProperty('--proj-bright', c.bright);
    el.style.setProperty('--proj-subtle', c.subtle);
    el.style.setProperty('--proj-bright-sub', c.brightSub);
    el.style.setProperty('--proj-pill-text', c.pillText);
    el.style.setProperty('--proj-light-bg', c.lightBg);
    el.style.setProperty('--proj-light-text', c.lightText);
  }

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
    detailRows.push({ label: 'Quality', value: qualityLabel(entry.quality, entry.resolution) + ' · ' + (entry.format || '').toUpperCase() });
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
        value: child.filePath || '-',
        clickToReveal: !!child.filePath,
      });
    }
    detailRows.push({ label: 'Total Size', value: formatFileSize(entry.fileSize) });
  } else {
    detailRows.push({ label: 'File', value: entry.filePath || '-', clickToReveal: !!entry.filePath });
    detailRows.push({ label: 'Size', value: formatFileSize(entry.fileSize) });
  }
  if (entry.project) {
    detailRows.push({ label: 'Project', value: entry.project });
  }
  detailRows.push({ label: 'Downloaded', value: formatFullDate(entry.downloadedAt) });

  const dlHtml = detailRows.map(r => {
    const hasCopy = r.value && r.value !== '-';
    const copyBtn = hasCopy
      ? `<button class="history-copy-row-btn" data-copy-value="${escapeHtml(r.value)}" title="Copy">${icon('copy-01', 'ui-icon')}</button>`
      : '';
    if (r.clickToReveal) {
      const display = truncatePath(r.value);
      return `<dt>${r.label}</dt><dd class="file-link" data-filepath="${escapeHtml(r.value)}" title="${escapeHtml(r.value)}"><span class="history-dd-text">${escapeHtml(display)}</span>${copyBtn}</dd>`;
    }
    return `<dt>${r.label}</dt><dd${r.copyable ? ' class="copyable"' : ''}><span class="history-dd-text">${escapeHtml(r.value)}</span>${copyBtn}</dd>`;
  }).join('');

  const qualityBadge = isCarousel
    ? `<span class="history-entry__quality">${entry.carouselItems.length} items</span>`
    : `<span class="history-entry__quality">${escapeHtml(qualityLabel(entry.quality, entry.resolution))}</span>`;

  el.innerHTML = `
    <div class="history-entry__header">
      <div class="history-entry__info">
        <div class="history-entry__title">${escapeHtml(entry.title)}</div>
        <div class="history-entry__meta">${escapeHtml(filteredMeta.join(' · '))}</div>
      </div>
      ${qualityBadge}
      ${entry.platform && entry.platform !== 'youtube' ? `<span class="history-entry__platform">${escapeHtml(entry.platform)}</span>` : ''}
      ${entry.project ? `<span class="history-entry__project">${escapeHtml(entry.project)}</span>` : ''}
      <span class="history-entry__date">${escapeHtml(formatRelativeDate(entry.downloadedAt))}</span>
      <span class="history-entry__chevron">
        ${icon('arrow-right-01', 'ui-icon')}
      </span>
    </div>
    <div class="history-entry__detail">
      <div class="history-entry__detail-inner">
        <div class="history-entry__detail-divider"></div>
        <dl class="history-detail-grid">${dlHtml}</dl>
        <div class="history-entry__actions">
          ${entry.webpageUrl ? '<button class="history-action-btn history-action-btn--redownload" data-action="redownload">Download Again</button>' : ''}
          <button class="history-action-btn history-action-btn--copyinfo" data-action="copyinfo">Copy Info</button>
          <button class="history-action-btn history-action-btn--copy" data-action="copy">Copy URL</button>
          <button class="history-action-btn history-action-btn--open" data-action="open">${icon('internet', 'ui-icon ui-icon--action')}Open Original</button>
          <button class="history-action-btn history-action-btn--delete" data-action="delete">Remove</button>
        </div>
      </div>
    </div>
  `;

  const header = el.querySelector('.history-entry__header');
  header.insertBefore(createThumbEl(entry, 'history-entry__thumb'), header.firstChild);
  const detail = el.querySelector('.history-entry__detail');
  let expandAnim = null;

  // Smooth ease-out quint — fast start, gentle deceleration, no overshoot
  const EASE_OPEN  = 'cubic-bezier(0.22, 1, 0.36, 1)';
  // Ease-out quart — fast drop, gently settles to closed
  const EASE_CLOSE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function collapse() {
    if (!el.classList.contains('expanded')) return;
    if (expandAnim) { expandAnim.cancel(); expandAnim = null; }
    detail.classList.add('is-closing');
    el.classList.remove('expanded');
    if (collapseActiveCard === collapse) collapseActiveCard = null;
    const fromHeight = detail.offsetHeight;
    const anim = detail.animate(
      [{ height: fromHeight + 'px' }, { height: '0px' }],
      { duration: 300, easing: EASE_CLOSE, fill: 'forwards' }
    );
    expandAnim = anim;
    anim.finished.then(() => {
      if (expandAnim !== anim) return;
      expandAnim.cancel();
      detail.style.height = '0px';
      detail.classList.remove('is-closing');
      expandAnim = null;
    }).catch(() => {});
  }

  header.addEventListener('click', () => {
    if (expandAnim) { expandAnim.cancel(); expandAnim = null; }

    if (el.classList.contains('expanded')) {
      // ── Collapse self ─────────────────────────────────────────────────
      collapse();
    } else {
      // ── Close whatever is currently open, then expand self ────────────
      if (collapseActiveCard) collapseActiveCard();

      detail.style.height = 'auto';
      const targetHeight = detail.offsetHeight;
      detail.style.height = '0px';
      detail.offsetHeight; // force reflow

      el.classList.add('expanded');
      collapseActiveCard = collapse;

      const anim = detail.animate(
        [{ height: '0px' }, { height: targetHeight + 'px' }],
        { duration: 420, easing: EASE_OPEN, fill: 'forwards' }
      );
      expandAnim = anim;
      anim.finished.then(() => {
        if (expandAnim !== anim) return;
        expandAnim.cancel();
        detail.style.height = 'auto';
        expandAnim = null;
      }).catch(() => {});
    }
  });

  el.querySelectorAll('.file-link').forEach(fileLink => {
    fileLink.addEventListener('click', async (e) => {
      if (e.target.closest('.history-copy-row-btn')) return;
      e.stopPropagation();
      const fp = fileLink.dataset.filepath;
      if (!fp) return;
      const result = await window.api.revealInFinder(fp);
      if (!result.found) {
        fileLink.classList.add('missing');
        fileLink.title = t('File was moved or deleted. Opened the download folder.');
      }
    });
  });

  el.querySelector('.history-detail-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('.history-copy-row-btn');
    if (!btn || btn.classList.contains('history-copy-row-btn--empty')) return;
    e.stopPropagation();
    const value = btn.dataset.copyValue;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      const originalHTML = btn.innerHTML;
      btn.innerHTML = icon('tick-01', 'ui-icon');
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('copied');
      }, 1500);
    } catch { /* clipboard access denied */ }
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
      lines.push(`Quality: ${qualityLabel(entry.quality, entry.resolution)} · ${(entry.format || '').toUpperCase()}`);
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
      btn.textContent = t('Copied!');
      btn.classList.add('pop');
      btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
      setTimeout(() => { btn.textContent = t('Copy Info'); }, 1500);
    } catch { /* clipboard access denied */ }
  });

  el.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (entry.webpageUrl) {
      try {
        await navigator.clipboard.writeText(entry.webpageUrl);
        const btn = e.currentTarget;
        btn.textContent = t('Copied!');
        btn.classList.add('pop');
        btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
        setTimeout(() => { btn.textContent = t('Copy URL'); }, 1500);
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

// ---- Thumbnail helper ----
function resolveThumbUrl(entry) {
  if (entry.thumbnail) return entry.thumbnail;
  // Reconstruct from videoId for existing YouTube entries saved before the thumbnail field was added
  if (entry.videoId && (entry.platform === 'youtube' || !entry.platform)) {
    return `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`;
  }
  return '';
}

function createThumbEl(entry, cssClass) {
  const wrapper = document.createElement('div');
  wrapper.className = cssClass;
  const isAudio = entry.quality === 'audio' || entry.mediaType === 'audio';
  const fallbackIconName = isAudio ? 'music-note-01' : 'image-not-found-01';
  const thumbUrl = resolveThumbUrl(entry);
  if (thumbUrl) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = thumbUrl;
    img.alt = '';
    img.addEventListener('error', () => {
      wrapper.innerHTML = icon(fallbackIconName, 'ui-icon history-thumb__icon');
      wrapper.classList.add('history-thumb--placeholder');
    });
    wrapper.appendChild(img);
  } else {
    wrapper.innerHTML = icon(fallbackIconName, 'ui-icon history-thumb__icon');
    wrapper.classList.add('history-thumb--placeholder');
  }
  return wrapper;
}

// ---- Detail modal (shared by grid and compact clicks) ----
let _closeDetailModal = null;

function openHistoryDetailModal(entry) {
  if (_closeDetailModal) _closeDetailModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'history-detail-modal-backdrop';

  const panel = document.createElement('div');
  panel.className = 'history-detail-modal-panel';

  // Close button lives on the backdrop (not inside the scrollable panel)
  // so it stays visible regardless of scroll position
  const closeBtn = document.createElement('button');
  closeBtn.className = 'history-detail-modal-close';
  closeBtn.innerHTML = icon('cancel-01', 'ui-icon');
  closeBtn.setAttribute('aria-label', 'Close');

  const entryEl = createHistoryEntryEl(entry);
  const detail = entryEl.querySelector('.history-entry__detail');
  const detailInner = entryEl.querySelector('.history-entry__detail-inner');
  entryEl.classList.add('expanded');
  detail.style.height = 'auto';
  detailInner.style.opacity = '1';

  panel.appendChild(entryEl);
  backdrop.appendChild(panel);
  backdrop.appendChild(closeBtn);
  historyView.appendChild(backdrop);

  requestAnimationFrame(() => backdrop.classList.add('visible'));

  function closeModal() {
    backdrop.classList.remove('visible');
    setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 250);
    _closeDetailModal = null;
  }

  _closeDetailModal = closeModal;

  backdrop.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !closeBtn.contains(e.target)) closeModal();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
  });

  const deleteBtn = entryEl.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.addEventListener('click', () => setTimeout(closeModal, 50), { once: true });

  const redownloadBtn = entryEl.querySelector('[data-action="redownload"]');
  if (redownloadBtn) redownloadBtn.addEventListener('click', closeModal, { once: true });
}

// ---- Grid card ----
function createHistoryGridCardEl(entry) {
  const el = document.createElement('div');
  el.className = 'history-grid-card';
  el.dataset.id = entry.id;
  if (entry.project) {
    const c = projectColors(entry.project);
    el.style.setProperty('--proj-dark', c.dark);
    el.style.setProperty('--proj-bright', c.bright);
    el.style.setProperty('--proj-subtle', c.subtle);
    el.style.setProperty('--proj-bright-sub', c.brightSub);
    el.style.setProperty('--proj-pill-text', c.pillText);
    el.style.setProperty('--proj-light-bg', c.lightBg);
    el.style.setProperty('--proj-light-text', c.lightText);
  }

  const isCarousel = entry.mediaType === 'carousel' && entry.carouselItems?.length > 0;
  const isImage = entry.mediaType === 'image' || isCarousel;
  const uploaderText = entry.uploader || entry.channel || '';
  const durationText = !isImage ? formatDuration(entry.duration) : '';
  const metaText = [uploaderText, durationText].filter(Boolean).join(' · ');
  const qualityText = isCarousel
    ? `${entry.carouselItems.length} items`
    : qualityLabel(entry.quality, entry.resolution);

  const thumb = createThumbEl(entry, 'history-grid-card__thumb');

  el.innerHTML = `
    <div class="history-grid-card__body">
      <div class="history-grid-card__title">${escapeHtml(entry.title)}</div>
      <div class="history-grid-card__meta">${escapeHtml(metaText)}</div>
      <span class="history-grid-card__quality">${escapeHtml(qualityText)}</span>
    </div>
  `;
  el.insertBefore(thumb, el.firstChild);
  el.addEventListener('click', () => openHistoryDetailModal(entry));
  return el;
}

// ---- Compact row ----
function createHistoryCompactRowEl(entry) {
  const el = document.createElement('div');
  el.className = 'history-compact-row';
  el.dataset.id = entry.id;
  if (entry.project) {
    const c = projectColors(entry.project);
    el.style.setProperty('--proj-dark', c.dark);
    el.style.setProperty('--proj-bright', c.bright);
    el.style.setProperty('--proj-subtle', c.subtle);
    el.style.setProperty('--proj-bright-sub', c.brightSub);
    el.style.setProperty('--proj-pill-text', c.pillText);
    el.style.setProperty('--proj-light-bg', c.lightBg);
    el.style.setProperty('--proj-light-text', c.lightText);
  }

  const isCarousel = entry.mediaType === 'carousel' && entry.carouselItems?.length > 0;
  const uploaderText = entry.uploader || entry.channel || '';
  const qualityText = isCarousel
    ? `${entry.carouselItems.length} items`
    : qualityLabel(entry.quality, entry.resolution);

  const thumb = createThumbEl(entry, 'history-compact-row__thumb');

  el.innerHTML = `
    <div class="history-compact-row__info">
      <div class="history-compact-row__title">${escapeHtml(entry.title)}</div>
      ${uploaderText ? `<div class="history-compact-row__channel">${escapeHtml(uploaderText)}</div>` : ''}
    </div>
    <span class="history-compact-row__quality">${escapeHtml(qualityText)}</span>
    <span class="history-compact-row__date">${escapeHtml(formatRelativeDate(entry.downloadedAt))}</span>
  `;
  el.insertBefore(thumb, el.firstChild);
  el.addEventListener('click', () => openHistoryDetailModal(entry));
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

historyExportBtn.addEventListener('click', () => {
  exportHistory();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.projectDropdownOpen) {
    closeProjectDropdown();
    return;
  }
  if (e.key === 'Escape' && _closeDetailModal) {
    _closeDetailModal();
    return;
  }
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
  historyClearBtn.textContent = tp('nukeEntries', count) || `Nuke these ${count} worthless entries, bitch?`;
  historyClearBtn.classList.add('confirm');

  const onConfirm = async () => {
    historyClearBtn.removeEventListener('click', onConfirm);
    await window.api.clearHistory();
    state.historyData = [];
    renderHistoryList();
    historyClearBtn.textContent = t('Clear All, champ');
    historyClearBtn.classList.remove('confirm');
  };

  const onCancel = () => {
    historyClearBtn.textContent = t('Clear All, champ');
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
  historySortBtn.textContent = state.historySortNewest ? t('Newest first') : t('Oldest first');
  renderHistoryList();
});

historyViewToggles.addEventListener('click', (e) => {
  const btn = e.target.closest('.history-view-btn');
  if (!btn) return;
  const view = btn.dataset.view;
  if (view === state.historyViewMode) return;
  state.historyViewMode = view;
  localStorage.setItem('historyViewMode', view);
  syncHistoryViewBtns();
  renderHistoryList();
});

document.querySelector('.history-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.history-filter[data-filter]');
  if (!btn) return;
  document.querySelectorAll('.history-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.historyFilter = btn.dataset.filter;
  updateHistoryFilterPill();
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
  const savedQuality = settings.quality || 'best';
  // Map legacy 'hd' to 'best' for backward compatibility
  state.selectedQuality = savedQuality === 'hd' ? 'best' : savedQuality;
  state.selectedResolutionHeight = (state.selectedQuality !== 'best' && state.selectedQuality !== 'audio')
    ? state.selectedQuality : null;
  state.autoPaste = settings.autoPaste !== false;
  state.showInFinder = settings.showInFinder === true;
  state.instantDownload = settings.instantDownload === true;
  state.mode = settings.mode || 'unhinged';
  state.theme = settings.theme || 'auto';
  state.activeProject = settings.activeProject || null;
  state.projects = settings.projects || [];
  state.projectHues = settings.projectHues || {};
  state.historyData = await window.api.getHistory();
  updateProjectUI();
  appVersion.textContent = `v${version}`;

  autoPasteToggle.classList.toggle('active', state.autoPaste);
  showInFinderToggle.classList.toggle('active', state.showInFinder);
  if (instantDownloadToggle) instantDownloadToggle.classList.toggle('active', state.instantDownload);
  modeToggle.classList.toggle('active', state.mode === 'professional');
  applyTheme(state.theme);
  applyMode();
  updateDownloadBtnLabel();

  // Set correct button active state on startup + show quality label + presets
  const qualityBtns = qualitySelector.querySelectorAll('.quality-option');
  qualityBtns.forEach(btn => {
    const isActive = state.selectedQuality === 'audio'
      ? btn.dataset.quality === 'audio'
      : btn.dataset.quality === 'best';
    btn.classList.toggle('active', isActive);
  });

  if (state.selectedQuality !== 'audio') {
    qualityBtnLabel.textContent = qualityToLabel(state.selectedQuality);
    qualityChevron.classList.add('visible');
    buildPresetDropdown(state.selectedQuality);
  }

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
      showStatus('info', tp('newVersionAvailable', update.version) || `New version v${update.version} available! Check Settings.`);
    }
  } catch { /* no update check errors shown */ }
}

init();
