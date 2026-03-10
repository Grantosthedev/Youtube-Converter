const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./utils');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 20000;
const IMAGE_DOWNLOAD_TIMEOUT = 15000;

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
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function parseOgTags(html) {
  const tags = {};
  const re1 = /<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["'][^>]*\/?>/gi;
  const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[^"']+)["'][^>]*\/?>/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    if (!tags[m[1]]) tags[m[1]] = m[2];
  }
  while ((m = re2.exec(html)) !== null) {
    if (!tags[m[2]]) tags[m[2]] = m[1];
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
   Embed page extraction (most reliable for carousels)
   Instagram embed pages are publicly accessible and contain
   visible media elements even without JS execution.
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
  if (captionMatch) caption = captionMatch[1].replace(/<[^>]+>/g, '').trim();

  // Dedup by filename — Instagram CDN serves the same image at multiple
  // resolutions with identical filenames but different size/query params.
  // This prevents chrome duplicates from inflating the item count.
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
   Legacy JSON extraction (kept for the rare cases where
   Instagram still serves server-rendered data)
   ============================================================ */

function extractJsonFromHtml(html) {
  const patterns = [
    /window\._sharedData\s*=\s*({.+?});\s*<\/script/s,
    /window\.__additionalDataLoaded\s*\([^,]+,\s*({.+?})\)\s*;\s*<\/script/s,
    /"PostPage":\[{"graphql":({.+?})}\]/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* try next */ }
    }
  }

  const ldJsonMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (ldJsonMatch) {
    try { return { _ldJson: JSON.parse(ldJsonMatch[1]) }; } catch { /* continue */ }
  }

  return null;
}

function extractMediaFromSharedData(data) {
  try {
    let media = null;
    if (data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
      media = data.entry_data.PostPage[0].graphql.shortcode_media;
    } else if (data?.graphql?.shortcode_media) {
      media = data.graphql.shortcode_media;
    } else if (data?.items?.[0]) {
      return extractFromApiItem(data.items[0]);
    }
    if (!media) return null;
    return parseGraphqlMedia(media);
  } catch {
    return null;
  }
}

function parseGraphqlMedia(media) {
  const owner = media.owner?.username || '';
  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  const timestamp = media.taken_at_timestamp
    ? new Date(media.taken_at_timestamp * 1000).toISOString()
    : '';

  if (media.__typename === 'GraphSidecar' || media.edge_sidecar_to_children) {
    const edges = media.edge_sidecar_to_children?.edges || [];
    const items = edges.map(edge => {
      const node = edge.node;
      const isVideo = node.is_video || node.__typename === 'GraphVideo';
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

  const isVideo = media.is_video || media.__typename === 'GraphVideo';
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

function extractFromApiItem(item) {
  const owner = item.user?.username || '';
  const caption = item.caption?.text || '';
  const timestamp = item.taken_at
    ? new Date(item.taken_at * 1000).toISOString()
    : '';

  if (item.carousel_media && item.carousel_media.length > 1) {
    const items = item.carousel_media.map(cm => {
      const isVideo = cm.media_type === 2;
      const bestImage = cm.image_versions2?.candidates?.[0]?.url || '';
      const videoUrl = cm.video_versions?.[0]?.url || '';
      return {
        type: isVideo ? 'video' : 'image',
        url: isVideo ? videoUrl : bestImage,
        thumbnail: bestImage,
        width: cm.original_width || 0,
        height: cm.original_height || 0,
      };
    }).filter(i => i.url);

    return { isCarousel: true, owner, caption, timestamp, items };
  }

  const isVideo = item.media_type === 2;
  const bestImage = item.image_versions2?.candidates?.[0]?.url || '';
  const videoUrl = item.video_versions?.[0]?.url || '';

  return {
    isCarousel: false,
    owner,
    caption,
    timestamp,
    items: [{
      type: isVideo ? 'video' : 'image',
      url: isVideo ? videoUrl : bestImage,
      thumbnail: bestImage,
      width: item.original_width || 0,
      height: item.original_height || 0,
    }].filter(i => i.url),
  };
}

function extractFromLdJson(ldJson) {
  if (!ldJson) return null;
  const data = Array.isArray(ldJson) ? ldJson[0] : ldJson;

  const imageUrls = [];
  if (data.image) {
    const imgs = Array.isArray(data.image) ? data.image : [data.image];
    for (const img of imgs) {
      const url = typeof img === 'string' ? img : img?.url;
      if (url) imageUrls.push(url);
    }
  }

  if (data.video) {
    const videos = Array.isArray(data.video) ? data.video : [data.video];
    const items = videos.map(v => ({
      type: 'video',
      url: v.contentUrl || v.url || '',
      thumbnail: v.thumbnailUrl || imageUrls[0] || '',
      width: v.width || 0,
      height: v.height || 0,
    })).filter(i => i.url);

    if (items.length > 0) {
      return {
        isCarousel: false,
        owner: data.author?.name || '',
        caption: data.caption || data.description || '',
        timestamp: data.datePublished || '',
        items,
      };
    }
  }

  if (imageUrls.length > 0) {
    const items = imageUrls.map(url => ({
      type: 'image',
      url,
      thumbnail: url,
      width: 0,
      height: 0,
    }));

    return {
      isCarousel: items.length > 1,
      owner: data.author?.name || '',
      caption: data.caption || data.description || '',
      timestamp: data.datePublished || '',
      items,
    };
  }

  return null;
}

/* ============================================================
   OG-tag-only fallback (always available on Instagram pages)
   ============================================================ */

function buildFromOgTags(ogTags, contentType) {
  const imageUrl = ogTags['og:image'];
  const videoUrl = ogTags['og:video:secure_url'] || ogTags['og:video'];
  const title = ogTags['og:title'] || ogTags['og:description'] || '';

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
   Main entry point: multi-layer media extraction
   Layer 1: Legacy JSON extraction (rare wins)
   Layer 2: Embed page (best for carousels)
   Layer 3: OG meta tags (always available, no carousel items)
   ============================================================ */

async function fetchMediaInfo(url) {
  try {
    const html = await httpGet(url);

    if ((html.includes('login') && html.includes('not logged in')) || html.length < 1000) {
      return null;
    }

    // Layer 1: legacy embedded JSON
    const jsonData = extractJsonFromHtml(html);
    if (jsonData) {
      if (jsonData._ldJson) {
        const result = extractFromLdJson(jsonData._ldJson);
        if (result && result.items.length > 0) return result;
      } else {
        const result = extractMediaFromSharedData(jsonData);
        if (result && result.items.length > 0) return result;
      }
    }

    // Parse OG tags (needed for Layer 2 and 3)
    const ogTags = parseOgTags(html);
    const contentType = detectContentType(html, ogTags);

    // Layer 2: embed page (best for carousels and images)
    const shortcode = extractShortcode(ogTags['og:url'] || url);
    if (shortcode) {
      try {
        const embedResult = await fetchEmbedData(shortcode);
        if (embedResult && embedResult.items.length > 0) {
          // OG tags reliably indicate video content (reels) — override
          // embed page if it scraped stray chrome images alongside the video.
          if (contentType === 'video') {
            embedResult.isCarousel = false;
            const videoItems = embedResult.items.filter(i => i.type === 'video');
            embedResult.items = videoItems.length > 0 ? [videoItems[0]] : [embedResult.items[0]];
          }

          // URL-based carousel hint: img_index param is definitive proof
          if (/[?&]img_index=/.test(url) && embedResult.items.length > 1) {
            embedResult.isCarousel = true;
          }

          const fallbackThumb = ogTags['og:image'] || '';
          if (fallbackThumb) {
            for (const item of embedResult.items) {
              if (!item.thumbnail) item.thumbnail = fallbackThumb;
            }
          }
          return embedResult;
        }
      } catch { /* continue to layer 3 */ }
    }

    // Layer 3: construct from OG tags
    const ogResult = buildFromOgTags(ogTags, contentType);
    if (ogResult) {
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

  const stream = await httpGet(imageUrl, { stream: true, timeout: IMAGE_DOWNLOAD_TIMEOUT });
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
      reject(new Error('Image download timed out'));
    }, IMAGE_DOWNLOAD_TIMEOUT);

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

module.exports = { fetchMediaInfo, downloadImage };
