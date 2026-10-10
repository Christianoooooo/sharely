/**
 * Whether a file has self-destructed: past its expiry date, or its download
 * cap has been reached. Such files are served 410 and reclaimed by the
 * retention cleanup job.
 * @param {{expiresAt?: Date|null, maxDownloads?: number|null, downloadCount?: number}} file
 * @returns {boolean}
 */
function isFileExpired(file) {
  if (!file) return false;
  if (file.expiresAt && new Date(file.expiresAt) < new Date()) return true;
  if (file.maxDownloads && (file.downloadCount || 0) >= file.maxDownloads) return true;
  return false;
}

module.exports = { isFileExpired };
