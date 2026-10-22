const mongoose = require('mongoose');
const crypto = require('crypto');

// Purely random (96 bit): the ID is the only secret guarding public /f/, /p/
// and /c/ URLs, so it must not be guessable from the creation time.
function generateShortId() {
  return crypto.randomBytes(12).toString('hex');
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

// Keep expired collections for 7 days so visitors still see the "Abgelaufen" message.
collectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800, sparse: true });

// Collections are listed per owner, sorted by createdAt descending.
collectionSchema.index({ owner: 1, createdAt: -1 });

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
