const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'singleton' },
  operatorName: { type: String, default: '' },
  operatorAddress: { type: String, default: '' },
  operatorEmail: { type: String, default: '' },
  cloudflareAnalytics: { type: Boolean, default: false },
  fileRetentionDays: { type: Number, default: 0 },
  encryptionAtRest: { type: Boolean, default: false },
  sessionDurationDays: { type: Number, default: 7 },
  allowRegistration: { type: Boolean, default: true },
  // Default per-user storage limit in bytes applied to users without an own
  // storageQuota override. 0 = unlimited.
  defaultStorageQuota: { type: Number, default: 0 },
});

siteSettingsSchema.statics.get = async function () {
  let doc = await this.findById('singleton');
  if (!doc) doc = await this.create({ _id: 'singleton' });
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
