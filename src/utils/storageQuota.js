const mongoose = require('mongoose');
const File = require('../models/File');
const SiteSettings = require('../models/SiteSettings');

/**
 * Sums up the disk usage of all files owned by a user.
 * @param {string|ObjectId} userId - Owner id.
 * @returns {Promise<number>} Used bytes.
 */
async function getStorageUsed(userId) {
  const agg = await File.aggregate([
    { $match: { uploader: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  return agg[0]?.total || 0;
}

/**
 * Resolves the effective quota in bytes.
 * @param {number|null|undefined} userStorageQuota - User override; null/undefined inherits the default.
 * @param {number} defaultStorageQuota - Site-wide default in bytes.
 * @returns {number} Effective quota in bytes; 0 means unlimited.
 */
function resolveQuota(userStorageQuota, defaultStorageQuota) {
  if (userStorageQuota === null || userStorageQuota === undefined) {
    return defaultStorageQuota || 0;
  }
  return userStorageQuota;
}

/**
 * Checks whether additionalBytes still fit within the user's quota.
 * @param {{_id: any, storageQuota?: number|null}} user - User doc with storageQuota.
 * @param {number} additionalBytes - Size of the pending upload.
 * @returns {Promise<{allowed: boolean, used: number, quota: number, remaining: number, unlimited: boolean}>} quota 0 = unlimited.
 */
async function checkQuota(user, additionalBytes) {
  const settings = await SiteSettings.get();
  const quota = resolveQuota(user.storageQuota, settings.defaultStorageQuota);
  if (quota <= 0) {
    return { allowed: true, used: 0, quota: 0, remaining: Infinity, unlimited: true };
  }
  const used = await getStorageUsed(user._id);
  const remaining = quota - used;
  return { allowed: additionalBytes <= remaining, used, quota, remaining, unlimited: false };
}

module.exports = { getStorageUsed, resolveQuota, checkQuota };
