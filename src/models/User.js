const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ldap = require('../utils/ldap');

function hashApiKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 32,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  // 'ldap' accounts authenticate against the directory; their local password is a
  // random placeholder and local password/reset flows are disabled for them.
  authProvider: {
    type: String,
    enum: ['local', 'ldap'],
    default: 'local',
  },
  // Normalized directory DN; the identity of an LDAP account, independent of its username.
  ldapDn: { type: String, unique: true, sparse: true },
  // Legacy plaintext field – kept only so the startup migration can read and
  // hash it. Cleared immediately after migration; never written again.
  apiKey: { type: String },
  apiKeyHash: { type: String, unique: true, sparse: true },
  apiKeyPrefix: { type: String, default: '' },
  folderName: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    maxlength: 64,
  },
  avatarExt: {
    type: String,
    default: null,
  },
  embedMode: {
    type: String,
    enum: ['embed', 'raw'],
    default: 'embed',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // Bumped on password change/reset; sessions carrying an older value are
  // rejected, which logs out every other device.
  sessionVersion: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  language: {
    type: String,
    default: 'en',
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
    default: null,
  },
  emailVerificationExpires: {
    type: Date,
    default: null,
  },
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  predefinedTags: {
    type: [{ type: String, trim: true, maxlength: 50 }],
    default: [],
  },
  // Per-user storage limit in bytes. null = inherit the site-wide default,
  // 0 = explicitly unlimited, >0 = hard limit.
  storageQuota: {
    type: Number,
    default: null,
  },
});

userSchema.pre('save', async function () {
  if (this.isNew) {
    if (!this.folderName) {
      this.folderName = crypto.randomBytes(8).toString('hex');
    }
    if (!this.apiKeyHash) {
      const plaintext = crypto.randomBytes(24).toString('hex');
      this.apiKeyHash = hashApiKey(plaintext);
      this.apiKeyPrefix = plaintext.slice(0, 8);
    }
  }
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// LDAP accounts confirm actions with their directory password; their local hash is a placeholder.
userSchema.methods.comparePassword = async function (candidate) {
  if (typeof candidate !== 'string') return false;
  if (this.authProvider === 'ldap') {
    try {
      return await ldap.verifyPassword(this.ldapDn, candidate);
    } catch (err) {
      console.error('LDAP password check failed:', err.message);
      return false;
    }
  }
  return bcrypt.compare(candidate, this.password);
};

// Regenerates the API key. Returns the plaintext key exactly once.
userSchema.methods.regenerateApiKey = async function () {
  const plaintext = crypto.randomBytes(24).toString('hex');
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.slice(0, 8);
  // Use raw updateOne to avoid Mongoose triggering the legacy apiKey_1 index
  await this.constructor.collection.updateOne(
    { _id: this._id },
    {
      $set: { apiKeyHash: hash, apiKeyPrefix: prefix },
      $unset: { apiKey: '' },
    },
  );
  this.apiKeyHash = hash;
  this.apiKeyPrefix = prefix;
  return plaintext;
};

userSchema.statics.findByApiKey = function (plaintext) {
  return this.findOne({ apiKeyHash: hashApiKey(plaintext), isActive: true });
};

module.exports = mongoose.model('User', userSchema);
