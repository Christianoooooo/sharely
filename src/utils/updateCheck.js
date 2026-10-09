const pkg = require('../../package.json');

// GitHub repo the running build is published from. Overridable for forks.
const REPO = process.env.UPDATE_REPO || 'Christianoooooo/sharely';
// Unauthenticated GitHub API allows 60 requests/hour per IP, so results are
// cached aggressively. Failed checks are cached briefly to avoid hammering.
const OK_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let cache = null;

// Parses a semver core (ignoring any -prerelease/+build suffix and a leading v)
// into a numeric [major, minor, patch] triple; missing parts default to 0.
function parseVersion(v) {
  const core = String(v || '').trim().replace(/^v/i, '').split(/[-+]/)[0];
  const parts = core.split('.').map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// Returns true if `latest` is a strictly higher release than `current`.
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sharely-update-check',
      },
      signal: controller.signal,
    });
    if (res.status === 404) return null; // no release published yet
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compares the installed version against the latest GitHub release.
 * Network result is cached; never rejects — failures surface via the error field.
 * @param {object} [opts]
 * @param {boolean} [opts.force] bypass the cache and re-query GitHub
 * @return {Promise<object>} update status (currentVersion, latestVersion, updateAvailable, releaseUrl, releaseName, publishedAt, checkedAt, error)
 */
async function getUpdateStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache) {
    const ttl = cache.data.error ? ERROR_TTL_MS : OK_TTL_MS;
    if (now - cache.fetchedAt < ttl) return cache.data;
  }

  const base = {
    currentVersion: pkg.version,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    releaseName: null,
    publishedAt: null,
    checkedAt: new Date().toISOString(),
    error: null,
  };

  try {
    const release = await fetchLatestRelease();
    if (release) {
      const latest = release.tag_name || release.name || '';
      base.latestVersion = latest.replace(/^v/i, '');
      base.updateAvailable = isNewer(latest, pkg.version);
      base.releaseUrl = release.html_url || null;
      base.releaseName = release.name || release.tag_name || null;
      base.publishedAt = release.published_at || null;
    }
  } catch (err) {
    base.error = err.name === 'AbortError' ? 'timeout' : 'unreachable';
  }

  cache = { data: base, fetchedAt: Date.now() };
  return base;
}

module.exports = { getUpdateStatus };
