const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./utils');

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IG_APP_ID = '936619743392459';
const USER_AGENT = BROWSER_UA;
const REQUEST_TIMEOUT = 20000;
const IMAGE_DOWNLOAD_TIMEOUT = 15000;

const _entityMap = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (match, entity) => {
    if (_entityMap[entity]) return _entityMap[entity];
    if (entity.startsWith('#x')) return String.fromCharCode(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCharCode(parseInt(entity.slice(1), 10));
    return match;
  });
}

const DEFAULT_DOC_IDS = ['8845758582119845', '9510064595728286', '10015901848480474'];
const GQL_ENDPOINT = 'https://www.instagram.com/graphql/query';
const REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/Grantosthedev/Youtube-Converter/main/config/instagram-config.json';
const CONFIG_CACHE_MS = 24 * 60 * 60 * 1000;

let _igConfigCache = null;
let _igConfigFetchedAt = 0;

let _ytdlpFetcher = null;
function setYtdlpFetcher(fn) { _ytdlpFetcher = fn; }

/* ============================================================
   HTTP helpers
   ============================================================ */

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || REQUEST_TIMEOUT;
    let redirects = 0;

    function doRequest(targetUrl) {
      if (redirects > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const proto = targetUrl.startsWith('https') ? https : http;
      const req = proto.get(targetUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(options.headers || {}),
        },
        timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            const parsed = new URL(targetUrl);
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          res.resume();
          doRequest(redirectUrl);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        if (options.stream) {
          resolve(res);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.on('error', reject);
    }

    doRequest(url);
  });
}

/* ============================================================
   Instagram shortcode + OG tag extraction
   ============================================================ */

function extractShortcode(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv|share)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function isInstagramVideoUrl(url) {
  try {
    const parsed = new URL(url);
    const isInstagramHost = parsed.hostname === 'instagram.com' ||
      parsed.hostname.endsWith('.instagram.com');
    return isInstagramHost && /^\/(?:reel|reels|tv)\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isUsableMediaResult(result, requiresVideo = false) {
  if (!result || !Array.isArray(result.items) || result.items.length === 0) return false;
  if (!requiresVideo) return true;
  return result.items.some(item => item.type === 'video' && item.url);
}

function parseOgTags(html) {
  const tags = {};
  const re1 = /<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["'][^>]*\/?>/gi;
  const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[^"']+)["'][^>]*\/?>/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    if (!tags[m[1]]) tags[m[1]] = decodeHtmlEntities(m[2]);
  }
  while ((m = re2.exec(html)) !== null) {
    if (!tags[m[2]]) tags[m[2]] = decodeHtmlEntities(m[1]);
  }
  return tags;
}

function detectContentType(html, ogTags) {
  const isCarousel = html.includes('GraphSidecar') ||
    html.includes('edge_sidecar_to_children') ||
    html.includes('"carousel_media"');
  if (isCarousel) return 'carousel';

  const hasVideo = ogTags['og:video'] || ogTags['og:video:secure_url'] ||
    (ogTags['og:type'] && ogTags['og:type'].includes('video'));
  if (hasVideo) return 'video';

  return 'image';
}

/* ============================================================
   Remote config: hot-patchable Instagram tokens
   ============================================================ */

async function getInstagramConfig() {
  if (_igConfigCache && (Date.now() - _igConfigFetchedAt) < CONFIG_CACHE_MS) {
    return _igConfigCache;
  }

  const defaults = {
    docIds: [...DEFAULT_DOC_IDS],
    endpoint: GQL_ENDPOINT,
    appId: IG_APP_ID,
  };

  try {
    const body = await httpGet(REMOTE_CONFIG_URL, { timeout: 6000 });
    const remote = JSON.parse(body);
    const merged = {
      docIds: Array.isArray(remote.docIds) && remote.docIds.length > 0 ? remote.docIds : defaults.docIds,
      endpoint: remote.endpoint || defaults.endpoint,
      appId: remote.appId || defaults.appId,
    };
    _igConfigCache = merged;
    _igConfigFetchedAt = Date.now();
    console.log('[ig-config] Remote config loaded:', merged.docIds.join(', '));
    return merged;
  } catch {
    _igConfigCache = defaults;
    _igConfigFetchedAt = Date.now();
    return defaults;
  }
}

/* ============================================================
   Embed page extraction
   ============================================================ */

async function fetchEmbedData(shortcode) {
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const html = await httpGet(embedUrl, { timeout: 15000 });

  const items = [];
  let owner = '';
  let caption = '';

  const ownerMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
  if (ownerMatch) owner = ownerMatch[1];

  const captionMatch = html.match(/<div[^>]*class="[^"]*[Cc]aption[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
  if (captionMatch) caption = decodeHtmlEntities(captionMatch[1].replace(/<[^>]+>/g, '').trim());

  const seen = new Set();
  function dedupeKey(url) {
    try { return new URL(url).pathname.split('/').pop(); } catch { return url; }
  }

  let m;

  const videoRe = /<video[^>]+src=["']([^"']+)["']/gi;
  while ((m = videoRe.exec(html)) !== null) {
    const vidUrl = m[1].replace(/&amp;/g, '&');
    const key = dedupeKey(vidUrl);
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ type: 'video', url: vidUrl, thumbnail: '', width: 0, height: 0 });
    }
  }

  const imgRe = /(?:src|data-src|srcset|poster)=["'](https:\/\/(?:scontent[^"']*|[^"']*cdninstagram[^"']*|[^"']*fbcdn\.net[^"']*))["']/gi;
  while ((m = imgRe.exec(html)) !== null) {
    const imgUrl = m[1].replace(/&amp;/g, '&');
    const key = dedupeKey(imgUrl);
    if (seen.has(key)) continue;
    if (imgUrl.includes('profile_pic')) continue;
    if (imgUrl.includes('/static/')) continue;
    if (imgUrl.includes('rsrc.php')) continue;
    const pathSize = imgUrl.match(/\/s(\d+)x\d+\//);
    if (pathSize && parseInt(pathSize[1], 10) < 320) continue;
    seen.add(key);
    items.push({ type: 'image', url: imgUrl, thumbnail: imgUrl, width: 0, height: 0 });
  }

  if (items.length === 0) return null;

  return {
    isCarousel: items.length > 1,
    owner,
    caption: (caption || '').slice(0, 300),
    timestamp: '',
    items,
  };
}

/* ============================================================
   GraphQL media parser (shared by GraphQL + legacy JSON paths)
   ============================================================ */

function parseGraphqlMedia(media) {
  const owner = media.owner?.username || '';
  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  const timestamp = media.taken_at_timestamp
    ? new Date(media.taken_at_timestamp * 1000).toISOString()
    : '';

  const isSidecar = /Sidecar$/i.test(media.__typename || '') || media.edge_sidecar_to_children;
  if (isSidecar) {
    const edges = media.edge_sidecar_to_children?.edges || [];
    const items = edges.map(edge => {
      const node = edge.node;
      const isVideo = node.is_video || /Video$/i.test(node.__typename || '');
      return {
        type: isVideo ? 'video' : 'image',
        url: isVideo ? (node.video_url || '') : (node.display_url || ''),
        thumbnail: node.display_url || '',
        width: node.dimensions?.width || 0,
        height: node.dimensions?.height || 0,
      };
    }).filter(item => item.url);

    return { isCarousel: true, owner, caption, timestamp, items };
  }

  const isVideo = media.is_video || /Video$/i.test(media.__typename || '');
  return {
    isCarousel: false,
    owner,
    caption,
    timestamp,
    items: [{
      type: isVideo ? 'video' : 'image',
      url: isVideo ? (media.video_url || '') : (media.display_url || ''),
      thumbnail: media.display_url || '',
      width: media.dimensions?.width || 0,
      height: media.dimensions?.height || 0,
    }].filter(item => item.url),
  };
}

/* ============================================================
   OG-tag-only fallback
   ============================================================ */

function buildFromOgTags(ogTags, contentType) {
  const imageUrl = ogTags['og:image'];
  const videoUrl = ogTags['og:video:secure_url'] || ogTags['og:video'];
  const title = decodeHtmlEntities(ogTags['og:title'] || ogTags['og:description'] || '');

  if (!imageUrl && !videoUrl) return null;

  const items = [];
  if (contentType === 'video' && videoUrl) {
    items.push({ type: 'video', url: videoUrl, thumbnail: imageUrl || '', width: 0, height: 0 });
  } else if (imageUrl) {
    items.push({ type: 'image', url: imageUrl, thumbnail: imageUrl, width: 0, height: 0 });
  }

  if (items.length === 0) return null;

  return {
    isCarousel: false,
    owner: '',
    caption: (title || '').slice(0, 300),
    timestamp: '',
    items,
  };
}

/* ============================================================
   HTTP POST helper (for GraphQL endpoint)
   ============================================================ */

function httpPost(url, body, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || REQUEST_TIMEOUT;
    const parsed = new URL(url);
    const proto = parsed.protocol === 'https:' ? https : http;

    const req = proto.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...(options.headers || {}),
      },
      timeout,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ============================================================
   LSD token extraction
   Instagram embeds session-specific LSD tokens in page HTML.
   ============================================================ */

async function extractSessionTokens(shortcode) {
  try {
    const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
    const html = await httpGet(pageUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    });

    let lsd = null;
    const lsdPatterns = [
      /"LSD"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
      /"lsd"\s*:\s*"([^"]+)"/,
      /\\"lsd\\":\s*\\"([^\\]+)\\"/,
      /name="lsd"\s+value="([^"]+)"/,
    ];
    for (const pattern of lsdPatterns) {
      const match = html.match(pattern);
      if (match) { lsd = match[1]; break; }
    }

    let csrf = null;
    const csrfMatch = html.match(/"csrf_token"\s*:\s*"([^"]+)"/);
    if (csrfMatch) csrf = csrfMatch[1];

    return { lsd, csrf, html };
  } catch {
    return { lsd: null, csrf: null, html: '' };
  }
}

/* ============================================================
   GraphQL POST with dynamic tokens + multi-doc_id fallback
   Returns { result, pageHtml } where result is null on failure.
   ============================================================ */

async function fetchGraphqlPost(shortcode) {
  const config = await getInstagramConfig();
  const { lsd, csrf, html: pageHtml } = await extractSessionTokens(shortcode);

  if (!lsd) {
    console.log('[ig-graphql] Could not extract LSD token from page');
    return { result: null, pageHtml };
  }

  for (const docId of config.docIds) {
    try {
      const variables = JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      });

      const postBody = new URLSearchParams({
        av: '0',
        __d: 'www',
        __user: '0',
        __a: '1',
        variables,
        doc_id: docId,
        lsd,
      }).toString();

      const headers = {
        'User-Agent': BROWSER_UA,
        'X-IG-App-ID': config.appId,
        'X-FB-LSD': lsd,
        'X-ASBD-ID': '129477',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Referer': `https://www.instagram.com/p/${shortcode}/`,
        'Origin': 'https://www.instagram.com',
      };

      if (csrf) {
        headers['X-CSRFToken'] = csrf;
        headers['Cookie'] = `csrftoken=${csrf}`;
      }

      const body = await httpPost(config.endpoint, postBody, {
        timeout: 12000,
        headers,
      });

      const json = JSON.parse(body);
      const media = json?.data?.xdt_shortcode_media;
      if (media) {
        console.log(`[ig-graphql] Success with doc_id=${docId}`);
        return { result: parseGraphqlMedia(media), pageHtml };
      }
    } catch (err) {
      console.log(`[ig-graphql] doc_id=${docId} failed: ${err.message}`);
    }
  }

  return { result: null, pageHtml };
}

/* ============================================================
   Main entry point: multi-layer media extraction

   Layer 1: GraphQL /graphql/query (fast, no auth needed)
   Layer 2: yt-dlp (handles videos, images, AND carousels)
   Layer 3: Embed page (only shows first carousel image)
   Layer 4: OG meta tags (always available, single item only)
   ============================================================ */

async function fetchMediaInfo(url, dependencies = {}) {
  try {
    const shortcode = extractShortcode(url);
    const requiresVideo = isInstagramVideoUrl(url);
    const graphqlFetcher = dependencies.fetchGraphqlPost || fetchGraphqlPost;
    const ytdlpFetcher = Object.prototype.hasOwnProperty.call(dependencies, 'ytdlpFetcher')
      ? dependencies.ytdlpFetcher
      : _ytdlpFetcher;
    const embedFetcher = dependencies.fetchEmbedData || fetchEmbedData;
    const httpGetter = dependencies.httpGet || httpGet;
    let pageHtml = '';

    // Layer 1: GraphQL POST with dynamic lsd + multi-doc_id (fastest)
    if (shortcode) {
      try {
        const gql = await graphqlFetcher(shortcode);
        pageHtml = gql.pageHtml || '';
        if (isUsableMediaResult(gql.result, requiresVideo)) {
          return gql.result;
        }
        if (requiresVideo && gql.result) {
          console.log('[ig-media] GraphQL returned only a reel thumbnail; continuing to video extraction');
        }
      } catch { /* continue */ }
    }

    // Layer 2: yt-dlp (handles videos, images, AND carousels reliably)
    if (ytdlpFetcher) {
      try {
        const result = await ytdlpFetcher(url);
        if (isUsableMediaResult(result, requiresVideo)) return result;
      } catch { /* continue */ }
    }

    // Fetch page HTML if we don't have it yet (for embed/OG fallbacks)
    if (!pageHtml) {
      try {
        pageHtml = await httpGetter(url);
      } catch {
        pageHtml = '';
      }
    }

    const ogTags = pageHtml ? parseOgTags(pageHtml) : {};
    const resolvedShortcode = shortcode || extractShortcode(ogTags['og:url'] || '');
    const urlContentType = requiresVideo ? 'video' : null;
    const contentType = urlContentType || (pageHtml ? detectContentType(pageHtml, ogTags) : 'image');

    // Layer 3: Embed page (only returns first image for carousels)
    if (resolvedShortcode) {
      try {
        const embedResult = await embedFetcher(resolvedShortcode);
        if (embedResult && embedResult.items.length > 0) {
          if (contentType === 'video') {
            embedResult.isCarousel = false;
            const videoItems = embedResult.items.filter(i => i.type === 'video');
            embedResult.items = videoItems.length > 0 ? [videoItems[0]] : [];
          }

          if (/[?&]img_index=/.test(url) && embedResult.items.length > 1) {
            embedResult.isCarousel = true;
          }

          embedResult._fromEmbed = true;

          const fallbackThumb = ogTags['og:image'] || '';
          if (fallbackThumb) {
            for (const item of embedResult.items) {
              if (!item.thumbnail) item.thumbnail = fallbackThumb;
            }
          }
          if (isUsableMediaResult(embedResult, requiresVideo)) return embedResult;
        }
      } catch { /* continue */ }
    }

    // Layer 4: OG meta tags
    const ogResult = buildFromOgTags(ogTags, contentType);
    if (isUsableMediaResult(ogResult, requiresVideo)) {
      ogResult._contentType = contentType;
      return ogResult;
    }

    return null;
  } catch {
    return null;
  }
}

/* ============================================================
   Image download (direct HTTP)
   ============================================================ */

async function downloadImage(imageUrl, outputPath, filename, mediaType) {
  const safeName = sanitizeFilename(filename || 'image');
  const ext = getMediaExtension(imageUrl, mediaType);
  const fullFilename = `${safeName}${ext}`;
  const filePath = path.join(outputPath, fullFilename);

  const uniquePath = getUniquePath(filePath);

  const dlTimeout = mediaType === 'video' ? 60000 : IMAGE_DOWNLOAD_TIMEOUT;
  const isInstagramCdn = /cdninstagram\.com|fbcdn\.net|instagram/.test(imageUrl);
  const dlHeaders = isInstagramCdn ? {
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
  } : {};
  const stream = await httpGet(imageUrl, { stream: true, timeout: dlTimeout, headers: dlHeaders });
  const fileStream = fs.createWriteStream(uniquePath);

  return new Promise((resolve, reject) => {
    let bytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stream.destroy();
      fileStream.destroy();
      try { fs.unlinkSync(uniquePath); } catch { /* ignore */ }
      reject(new Error('Download timed out'));
    }, dlTimeout);

    stream.on('data', (chunk) => { bytes += chunk.length; });
    stream.pipe(fileStream);

    fileStream.on('finish', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ filePath: uniquePath, fileSize: bytes });
    });

    fileStream.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { fs.unlinkSync(uniquePath); } catch { /* ignore */ }
      reject(err);
    });

    stream.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { fs.unlinkSync(uniquePath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

function getMediaExtension(url, mediaType) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return ext;
  } catch { /* ignore */ }
  return mediaType === 'video' ? '.mp4' : '.jpg';
}

function getUniquePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let i = 1;
  while (fs.existsSync(path.join(dir, `${base} (${i})${ext}`))) i++;
  return path.join(dir, `${base} (${i})${ext}`);
}

function fetchImageAsDataUri(imageUrl) {
  return new Promise((resolve, reject) => {
    let redirects = 0;

    function doFetch(targetUrl) {
      if (redirects > 5) { reject(new Error('Too many redirects')); return; }

      const proto = targetUrl.startsWith('https') ? https : http;
      const req = proto.get(targetUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.instagram.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        timeout: 8000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          res.resume();
          doFetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const mime = res.headers['content-type'] || 'image/jpeg';
          resolve(`data:${mime};base64,${buffer.toString('base64')}`);
        });
        res.on('error', reject);
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
    }

    doFetch(imageUrl);
  });
}

module.exports = {
  fetchMediaInfo,
  downloadImage,
  fetchImageAsDataUri,
  setYtdlpFetcher,
  isInstagramVideoUrl,
  isUsableMediaResult,
};
