const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchMediaInfo,
  isInstagramVideoUrl,
  isUsableMediaResult,
} = require('../src/media-fetcher');

function thumbnailResult() {
  return {
    isCarousel: false,
    items: [{
      type: 'image',
      url: 'https://cdninstagram.com/reel-thumbnail.jpg',
      thumbnail: 'https://cdninstagram.com/reel-thumbnail.jpg',
    }],
  };
}

function videoResult() {
  return {
    isCarousel: false,
    items: [{
      type: 'video',
      url: 'https://cdninstagram.com/reel-video.mp4',
      thumbnail: 'https://cdninstagram.com/reel-thumbnail.jpg',
    }],
  };
}

test('recognizes only Instagram reel-style paths as video URLs', () => {
  assert.equal(isInstagramVideoUrl('https://www.instagram.com/reel/ABC_123/'), true);
  assert.equal(isInstagramVideoUrl('https://instagram.com/reels/ABC_123/'), true);
  assert.equal(isInstagramVideoUrl('https://www.instagram.com/tv/ABC_123/'), true);
  assert.equal(isInstagramVideoUrl('https://www.instagram.com/p/ABC_123/'), false);
  assert.equal(isInstagramVideoUrl('https://example.com/reel/ABC_123/'), false);
});

test('does not accept an image-only result when video is required', () => {
  assert.equal(isUsableMediaResult(thumbnailResult(), true), false);
  assert.equal(isUsableMediaResult(videoResult(), true), true);
  assert.equal(isUsableMediaResult(thumbnailResult(), false), true);
});

test('continues past a GraphQL reel thumbnail to the video extractor', async () => {
  let ytdlpCalls = 0;
  const expectedVideo = videoResult();
  const result = await fetchMediaInfo('https://www.instagram.com/reel/ABC_123/', {
    fetchGraphqlPost: async () => ({ result: thumbnailResult(), pageHtml: '' }),
    ytdlpFetcher: async () => {
      ytdlpCalls++;
      return expectedVideo;
    },
    fetchEmbedData: async () => null,
    httpGet: async () => '',
  });

  assert.equal(ytdlpCalls, 1);
  assert.deepEqual(result, expectedVideo);
});

test('never downgrades a reel to an embed or Open Graph image', async () => {
  const result = await fetchMediaInfo('https://www.instagram.com/reel/ABC_123/', {
    fetchGraphqlPost: async () => ({ result: thumbnailResult(), pageHtml: [
      '<meta property="og:image" content="https://cdninstagram.com/reel-thumbnail.jpg">',
    ].join('') }),
    ytdlpFetcher: async () => null,
    fetchEmbedData: async () => thumbnailResult(),
  });

  assert.equal(result, null);
});

test('keeps the fast GraphQL path for regular Instagram photos', async () => {
  let ytdlpCalls = 0;
  const expectedImage = thumbnailResult();
  const result = await fetchMediaInfo('https://www.instagram.com/p/ABC_123/', {
    fetchGraphqlPost: async () => ({ result: expectedImage, pageHtml: '' }),
    ytdlpFetcher: async () => {
      ytdlpCalls++;
      return videoResult();
    },
  });

  assert.equal(ytdlpCalls, 0);
  assert.deepEqual(result, expectedImage);
});
