const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', async function (next) {
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
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
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
