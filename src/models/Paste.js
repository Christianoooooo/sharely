const mongoose = require('mongoose');
const crypto = require('crypto');

// Purely random (96 bit): the ID is the only secret guarding public /f/, /p/
// and /c/ URLs, so it must not be guessable from the creation time.
function generateShortId() {
  return crypto.randomBytes(12).toString('hex');
}

const pasteSchema = new mongoose.Schema({
  shortId: {
    type: String,
    unique: true,
    default: generateShortId,
  },
  title: {
    type: String,
    default: '',
    maxlength: 200,
  },
  content: {
    type: String,
    required: true,
    maxlength: 500000,
  },
  language: {
    type: String,
    default: 'plaintext',
    maxlength: 40,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hidden from nobody by URL, but omitted from other users' listings.
  isPrivate: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    default: null,
  },
  views: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Keep expired pastes for 7 days so visitors still see the "expired" message
// before MongoDB purges them automatically (mirrors ShareLink/Collection).
pasteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800, sparse: true });

// Pastes are listed per owner, newest first.
pasteSchema.index({ owner: 1, createdAt: -1 });

pasteSchema.statics.createUnique = async function (data, maxAttempts = 5) {
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

module.exports = mongoose.model('Paste', pasteSchema);
