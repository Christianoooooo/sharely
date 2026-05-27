const mongoose = require('mongoose');
const crypto = require('crypto');

const EPOCH = Math.floor(new Date('2024-01-01').getTime() / 1000);

function generateShortId() {
  const ts = (Math.floor(Date.now() / 1000) - EPOCH).toString(16).padStart(6, '0');
  const rand = crypto.randomBytes(2).toString('hex');
  return ts + rand;
}

const collectionSchema = new mongoose.Schema({
  shortId: {
    type: String,
    unique: true,
    default: generateShortId,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  files: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
  }],
  password: {
    type: String,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-delete expired collections
collectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

collectionSchema.statics.createUnique = async function (data, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await this.create(data);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.shortId && attempt < maxAttempts - 1) {
        data.shortId = generateShortId();
        continue;
      }
      throw err;
    }
  }
};

module.exports = mongoose.model('Collection', collectionSchema);
