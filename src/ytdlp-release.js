const YTDLP_CHANNEL = 'nightly';
const YTDLP_RELEASE_REPOSITORY = 'yt-dlp/yt-dlp-nightly-builds';
const YTDLP_ASSET_NAME = 'yt-dlp_macos';
const MINIMUM_FIXED_YTDLP_VERSION = '2026.08.18.122307';
const MINIMUM_FIXED_YTDLP_SHA256 = '46d572488acb4b57f2b34ef05645ae56d0071b00e1f0d33a756502b62ae08822';
const YTDLP_RELEASE_API = `https://api.github.com/repos/${YTDLP_RELEASE_REPOSITORY}/releases/latest`;

function numericVersionParts(version) {
  const match = String(version || '').match(/(\d{4}(?:\.\d+){2,})/);
  return match ? match[1].split('.').map(Number) : [];
}

function compareYtdlpVersions(left, right) {
  const a = numericVersionParts(left);
  const b = numericVersionParts(right);
  if (a.length === 0 || b.length === 0) return null;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function isSupportedYtdlpVersion(version) {
  const comparison = compareYtdlpVersions(version, MINIMUM_FIXED_YTDLP_VERSION);
  return comparison !== null && comparison >= 0;
}

function releaseAsset(release, assetName = YTDLP_ASSET_NAME) {
  if (!release || typeof release !== 'object') throw new Error('Invalid yt-dlp release response');
  const asset = release.assets?.find(item => item.name === assetName);
  if (!asset?.browser_download_url) {
    throw new Error(`yt-dlp release is missing ${assetName}`);
  }
  const digest = String(asset.digest || '');
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`yt-dlp release has no valid SHA-256 digest for ${assetName}`);
  }
  const sha256 = digest.slice('sha256:'.length).toLowerCase();
  const version = String(release.tag_name || '');
  if (!isSupportedYtdlpVersion(version)) {
    throw new Error(`yt-dlp release ${version || 'unknown'} predates the required YouTube fix`);
  }
  if (
    version === MINIMUM_FIXED_YTDLP_VERSION
    && assetName === YTDLP_ASSET_NAME
    && sha256 !== MINIMUM_FIXED_YTDLP_SHA256
  ) {
    throw new Error('yt-dlp digest does not match the reviewed build');
  }
  return {
    version,
    assetName,
    downloadUrl: asset.browser_download_url,
    sha256,
    size: Number(asset.size) || 0,
  };
}

module.exports = {
  MINIMUM_FIXED_YTDLP_VERSION,
  MINIMUM_FIXED_YTDLP_SHA256,
  YTDLP_ASSET_NAME,
  YTDLP_CHANNEL,
  YTDLP_RELEASE_API,
  YTDLP_RELEASE_REPOSITORY,
  compareYtdlpVersions,
  isSupportedYtdlpVersion,
  numericVersionParts,
  releaseAsset,
};
