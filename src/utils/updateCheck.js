const { getInstalledVersion, getInstalledCommit } = require('./updateApply');

// GitHub repo the running build is published from. Overridable for forks.
const REPO = process.env.UPDATE_REPO || 'Christianoooooo/sharely';
// How "update available" is decided:
//   release — compare installed version against the latest GitHub release tag
//   branch  — compare the installed commit against the tip of a branch (for
//             deployments that just push commits instead of cutting releases)
const CHANNEL = process.env.UPDATE_CHANNEL === 'branch' ? 'branch' : 'release';
const BRANCH = process.env.UPDATE_BRANCH || 'main';
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

async function ghFetch(pathStr) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`https://api.github.com/repos/${REPO}${pathStr}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sharely-update-check',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRelease() {
  const res = await ghFetch('/releases/latest');
  if (res.status === 404) return { release: null }; // no release published yet
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const r = await res.json();
  return {
    release: {
      tag: r.tag_name || r.name || '',
      htmlUrl: r.html_url || null,
      name: r.name || r.tag_name || null,
      publishedAt: r.published_at || null,
    },
  };
}

async function fetchBranchHead() {
  const res = await ghFetch(`/commits/${encodeURIComponent(BRANCH)}`);
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const c = await res.json();
  return {
    commit: {
      sha: c.sha || '',
      htmlUrl: c.html_url || null,
      date: c.commit?.committer?.date || c.commit?.author?.date || null,
    },
  };
}

// Builds the response from a cached network payload plus the live installed info,
// so the current version/commit is never frozen inside the cache.
function buildStatus(net, fetchedAt) {
  const base = {
    channel: CHANNEL,
    currentVersion: getInstalledVersion(),
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    releaseName: null,
    publishedAt: null,
    checkedAt: new Date(fetchedAt).toISOString(),
    error: net.error || null,
  };
  if (net.error) return base;

  if (CHANNEL === 'release') {
    if (net.release) {
      base.latestVersion = net.release.tag.replace(/^v/i, '');
      base.updateAvailable = isNewer(net.release.tag, base.currentVersion);
      base.releaseUrl = net.release.htmlUrl;
      base.releaseName = net.release.name;
      base.publishedAt = net.release.publishedAt;
    }
    return base;
  }

  // branch channel
  if (net.commit && net.commit.sha) {
    const local = getInstalledCommit();
    base.latestVersion = net.commit.sha.slice(0, 7);
    base.releaseName = net.commit.sha.slice(0, 7);
    base.publishedAt = net.commit.date;
    if (local) {
      base.updateAvailable = local !== net.commit.sha;
      base.releaseUrl = `https://github.com/${REPO}/compare/${local.slice(0, 12)}...${encodeURIComponent(BRANCH)}`;
    } else {
      // Without the installed commit we cannot tell; link to the branch tip.
      base.releaseUrl = net.commit.htmlUrl;
    }
  }
  return base;
}

/**
 * Checks whether a newer version is available, by release tag or branch tip.
 * Network result is cached; never rejects — failures surface via the error field.
 * @param {object} [opts]
 * @param {boolean} [opts.force] bypass the cache and re-query GitHub
 * @return {Promise<object>} update status (channel, currentVersion, latestVersion, updateAvailable, releaseUrl, releaseName, publishedAt, checkedAt, error)
 */
async function getUpdateStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache) {
    const ttl = cache.net.error ? ERROR_TTL_MS : OK_TTL_MS;
    if (now - cache.fetchedAt < ttl) return buildStatus(cache.net, cache.fetchedAt);
  }

  let net;
  try {
    net = CHANNEL === 'branch' ? await fetchBranchHead() : await fetchRelease();
  } catch (err) {
    net = { error: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
  cache = { net, fetchedAt: Date.now() };
  return buildStatus(net, cache.fetchedAt);
}

module.exports = { getUpdateStatus };
