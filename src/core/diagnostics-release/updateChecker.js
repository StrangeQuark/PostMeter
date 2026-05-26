const DEFAULT_UPDATE_URL = 'https://api.github.com/repos/StrangeQuark/PostMeter/releases/latest';
const DEFAULT_RELEASES_URL = 'https://api.github.com/repos/StrangeQuark/PostMeter/releases';
const FETCH_TIMEOUT_MILLIS = 10_000;
const ALLOWED_UPDATE_HOSTS = new Set(['api.github.com']);

async function checkForUpdates(options = {}) {
  const currentVersion = normalizeVersion(options.currentVersion || '0.0.0');
  const includePrereleases = options.includePrereleases === true;
  const releaseUrl = resolveUpdateUrl({ ...options, includePrereleases });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Update checks require fetch support.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMillis || FETCH_TIMEOUT_MILLIS));
  let response;
  try {
    response = await fetchImpl(releaseUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PostMeter update checker'
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Update check timed out.');
    }
    throw new Error(`Update check failed: ${redactUpdateError(error?.message || String(error))}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!response || response.ok === false) {
    throw new Error(`Update check failed${response?.status ? ` with HTTP ${response.status}` : ''}.`);
  }
  const body = await response.json();
  const release = includePrereleases
    ? newestRelease(Array.isArray(body) ? body : [body], currentVersion)
    : body;
  if (!release) {
    return {
      checkedAt: new Date().toISOString(),
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      releaseName: '',
      releaseUrl: '',
      publishedAt: '',
      prerelease: false,
      includePrereleases
    };
  }
  const latestVersion = normalizeVersion(release.tag_name || release.name || '');
  if (!latestVersion) {
    throw new Error('Update response did not include a release version.');
  }
  return {
    checkedAt: new Date().toISOString(),
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseName: release.name || release.tag_name || latestVersion,
    releaseUrl: release.html_url || '',
    publishedAt: release.published_at || '',
    prerelease: release.prerelease === true,
    includePrereleases
  };
}

function resolveUpdateUrl(options = {}) {
  const includePrereleases = options.includePrereleases === true;
  const defaultUrl = includePrereleases ? DEFAULT_RELEASES_URL : DEFAULT_UPDATE_URL;
  const packaged = options.isPackaged === true || options.packaged === true;
  const explicitOverrideAllowed = options.allowUpdateUrlOverride === true || options.allowDevUpdateUrlOverride === true;
  const envUrl = String(options.env?.POSTMETER_UPDATE_URL || process.env.POSTMETER_UPDATE_URL || '').trim();
  const requestedUrl = options.releaseUrl || (!packaged && explicitOverrideAllowed ? envUrl : '') || defaultUrl;
  const parsed = validateUpdateUrl(requestedUrl, {
    allowNonDefaultHost: !packaged && explicitOverrideAllowed
  });
  return parsed.toString();
}

function validateUpdateUrl(value, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('Update URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Update URL must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Update URL must not include credentials.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!options.allowNonDefaultHost && !ALLOWED_UPDATE_HOSTS.has(host)) {
    throw new Error('Update URL host is not allowed.');
  }
  if (host === 'api.github.com' && !/^\/repos\/StrangeQuark\/PostMeter\/releases(?:\/latest)?$/u.test(parsed.pathname)) {
    throw new Error('Update URL path is not allowed.');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function redactUpdateError(message) {
  return String(message || '').replace(/https?:\/\/[^\s]+/gu, (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      const auth = parsed.username || parsed.password ? '[redacted]@' : '';
      parsed.search = parsed.search ? '?[redacted]' : '';
      parsed.hash = parsed.hash ? '#[redacted]' : '';
      return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return '[redacted-url]';
    }
  });
}

function newestRelease(releases, currentVersion) {
  const usable = (releases || [])
    .filter((release) => !release?.draft)
    .filter((release) => normalizeVersion(release.tag_name || release.name || ''))
    .filter((release) => compareVersions(normalizeVersion(release.tag_name || release.name || ''), currentVersion) > 0)
    .sort((left, right) => compareVersions(
      normalizeVersion(right.tag_name || right.name || ''),
      normalizeVersion(left.tag_name || left.name || '')
    ));
  return usable[0] || null;
}

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '').split(/[+-]/)[0];
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }
  return 0;
}

function versionParts(version) {
  return normalizeVersion(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => Number.isFinite(part) ? part : 0);
}

module.exports = {
  DEFAULT_UPDATE_URL,
  DEFAULT_RELEASES_URL,
  checkForUpdates,
  compareVersions,
  normalizeVersion,
  redactUpdateError,
  resolveUpdateUrl,
  validateUpdateUrl
};
