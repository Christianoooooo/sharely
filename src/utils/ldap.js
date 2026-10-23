const { Client, Filter, InvalidCredentialsError } = require('ldapts');

// Fail the request rather than hanging it if the directory is slow or unreachable.
const TIMEOUT_MS = 10000;

// ── Transport ────────────────────────────────────────────────────────────────

function isConfigured() {
  return Boolean(process.env.LDAP_URL);
}

function tlsOptions() {
  return { rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false' };
}

function createClient() {
  return new Client({
    url: process.env.LDAP_URL,
    timeout: TIMEOUT_MS,
    connectTimeout: TIMEOUT_MS,
    tlsOptions: tlsOptions(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build the user search filter, escaping the typed username against LDAP injection. */
function searchFilter(username) {
  const tpl = process.env.LDAP_SEARCH_FILTER || '(uid={{username}})';
  return tpl.replace(/\{\{username\}\}/g, Filter.escape(username));
}

/** First value of a (possibly multi-valued) search entry attribute, or null. */
function firstValue(entry, attr) {
  const v = entry[attr];
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  return v != null ? String(v) : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Authenticate a user against the directory via search+bind.
 * @param username typed username, substituted into LDAP_SEARCH_FILTER
 * @param password typed password, verified by binding as the found DN
 * @returns resolved identity { dn, email } on success, or null on auth failure
 * @throws on configuration or connection errors (never leak these to the client)
 */
async function authenticate(username, password) {
  if (!isConfigured()) throw new Error('LDAP not configured');
  // An empty password would be an unauthenticated (anonymous) bind that LDAP
  // accepts as success, so reject it before we ever reach the directory.
  if (!password) return null;

  let userDn;
  let entry;
  const searchClient = createClient();
  try {
    const bindDn = process.env.LDAP_BIND_DN;
    if (bindDn) await searchClient.bind(bindDn, process.env.LDAP_BIND_PASSWORD || '');
    const { searchEntries } = await searchClient.search(process.env.LDAP_SEARCH_BASE, {
      scope: 'sub',
      filter: searchFilter(username),
      attributes: ['dn', process.env.LDAP_ATTR_EMAIL || 'mail'],
      sizeLimit: 2,
    });
    // Zero means no such user; more than one means an ambiguous filter we must not guess at.
    if (searchEntries.length !== 1) return null;
    entry = searchEntries[0];
    userDn = entry.dn;
  } finally {
    await searchClient.unbind().catch(() => {});
  }

  const userClient = createClient();
  try {
    await userClient.bind(userDn, password);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) return null;
    throw err;
  } finally {
    await userClient.unbind().catch(() => {});
  }

  return { dn: userDn, email: firstValue(entry, process.env.LDAP_ATTR_EMAIL || 'mail') };
}

module.exports = { isConfigured, authenticate, searchFilter };
