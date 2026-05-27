const mongoose = require('mongoose');
const crypto = require('crypto');

const shareLinkSchema = new mongoose.Schema({
  token: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex'),
  },
  file: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  label: {
    type: String,
    default: '',
    maxlength: 100,
  },
  password: {
    type: String,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  downloadLimit: {
    type: Number,
    default: -1,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Keep expired links for 7 days so the owner can still see them as "Abgelaufen"
// before MongoDB cleans them up automatically.
shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800, sparse: true });

module.exports = mongoose.model('ShareLink', shareLinkSchema);
