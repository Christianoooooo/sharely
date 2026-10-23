const { Client, Filter, InvalidCredentialsError } = require('ldapts');

// Fail the request rather than hanging it if the directory is slow or unreachable.
const TIMEOUT_MS = 10000;

// ── Transport ────────────────────────────────────────────────────────────────

function isConfigured() {
  return Boolean(process.env.LDAP_URL);
}

function isLdaps() {
  return /^ldaps:/i.test(process.env.LDAP_URL || '');
}

function tlsOptions() {
  return { rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false' };
}

function createClient() {
  return new Client({
    url: process.env.LDAP_URL,
    timeout: TIMEOUT_MS,
    connectTimeout: TIMEOUT_MS,
    // ldapts switches to TLS whenever tlsOptions is set, which breaks plain ldap:// URLs.
    ...(isLdaps() ? { tlsOptions: tlsOptions() } : {}),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the user search filter, escaping the typed username against LDAP injection.
 * @throws {TypeError} if username is not a string; Filter.escape passes array elements through unescaped.
 */
function searchFilter(username) {
  if (typeof username !== 'string') throw new TypeError('username must be a string');
  const tpl = process.env.LDAP_SEARCH_FILTER || '(uid={{username}})';
  return tpl.replace(/\{\{username\}\}/g, Filter.escape(username));
}

/** First value of a (possibly multi-valued) search entry attribute, or null. */
function firstValue(entry, attr) {
  const v = entry[attr];
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  return v != null ? String(v) : null;
}

/** Lower-cased DN for storing and comparing directory identities. */
function normalizeDn(dn) {
  return String(dn).trim().toLowerCase();
}

// Service-bound search for the entries matching a username (at most two are fetched).
async function searchUser(username) {
  const client = createClient();
  try {
    const bindDn = process.env.LDAP_BIND_DN;
    if (bindDn) await client.bind(bindDn, process.env.LDAP_BIND_PASSWORD || '');
    const { searchEntries } = await client.search(process.env.LDAP_SEARCH_BASE, {
      scope: 'sub',
      filter: searchFilter(username),
      attributes: ['dn', process.env.LDAP_ATTR_EMAIL || 'mail'],
      sizeLimit: 2,
    });
    return searchEntries;
  } finally {
    await client.unbind().catch(() => {});
  }
}

// Binds as dn; false only for rejected credentials, other errors propagate.
async function bindAs(dn, password) {
  const client = createClient();
  try {
    await client.bind(dn, password);
    return true;
  } catch (err) {
    if (err instanceof InvalidCredentialsError) return false;
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Authenticate a user against the directory via search+bind.
 * @param username typed username, substituted into LDAP_SEARCH_FILTER
 * @param password typed password, verified by binding as the found DN
 * @returns resolved identity { dn, email } on success (dn normalized), or null on auth failure
 * @throws on configuration or connection errors (never leak these to the client)
 */
async function authenticate(username, password) {
  if (!isConfigured()) throw new Error('LDAP not configured');
  // An empty password would be an unauthenticated (anonymous) bind that LDAP
  // accepts as success, so reject it before we ever reach the directory.
  if (typeof username !== 'string' || typeof password !== 'string' || !password) return null;

  const entries = await searchUser(username);
  // Zero means no such user; more than one means an ambiguous filter we must not guess at.
  if (entries.length !== 1) return null;
  const entry = entries[0];
  if (!(await bindAs(entry.dn, password))) return null;
  return { dn: normalizeDn(entry.dn), email: firstValue(entry, process.env.LDAP_ATTR_EMAIL || 'mail') };
}

/**
 * Verify the directory password of an already linked account by binding as its DN.
 * @param dn stored (normalized) DN of the account
 * @param password typed password
 * @returns true if the directory accepts the password
 * @throws on configuration or connection errors
 */
async function verifyPassword(dn, password) {
  if (!isConfigured()) throw new Error('LDAP not configured');
  if (!dn || typeof password !== 'string' || !password) return false;
  return bindAs(dn, password);
}

/**
 * Whether a username exists in the directory, so local accounts cannot squat on it.
 * @returns false when LDAP is not configured
 * @throws on connection errors; callers should refuse the name then
 */
async function isDirectoryUsername(username) {
  if (!isConfigured()) return false;
  return (await searchUser(username)).length > 0;
}

module.exports = {
  isConfigured, authenticate, verifyPassword, isDirectoryUsername, searchFilter, normalizeDn,
};
