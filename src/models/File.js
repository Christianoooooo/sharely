const mongoose = require('mongoose');
const crypto = require('crypto');

// Purely random (96 bit): the ID is the only secret guarding public /f/, /p/
// and /c/ URLs, so it must not be guessable from the creation time.
function generateShortId() {
  return crypto.randomBytes(12).toString('hex');
}

const fileSchema = new mongoose.Schema({
  shortId: {
    type: String,
    unique: true,
    default: generateShortId,
  },
  deleteToken: {
    type: String,
    unique: true,
    // Excluded from queries so it never reaches API/WS responses; load it
    // explicitly with .select('+deleteToken') where the token is verified.
    select: false,
    default: () => crypto.randomBytes(16).toString('hex'), // 32 hex chars
  },
  originalName: {
    type: String,
    required: true,
  },
  storedName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  // Stored file is in the src/utils/fileCrypto.js format (ENCRYPTION_KEY needed to read it).
  encrypted: {
    type: Boolean,
    default: false,
  },
  size: {
    type: Number,
    required: true,
  },
  uploader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  views: {
    type: Number,
    default: 0,
  },
  // Self-destruct: once the file is past expiresAt or has reached maxDownloads
  // it is served 410 everywhere and physically removed by the retention job.
  expiresAt: {
    type: Date,
    default: null,
  },
  maxDownloads: {
    type: Number,
    default: null,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  tags: {
    type: [{ type: String, trim: true, maxlength: 50 }],
    default: [],
  },
  description: {
    type: String,
    default: '',
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Virtual for human-readable size
fileSchema.virtual('sizeHuman').get(function () {
  const bytes = this.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
});

// Classify file type for display
fileSchema.virtual('displayType').get(function () {
  const m = this.mimeType;
  const ext = this.originalName.split('.').pop().toLowerCase();

  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';

  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
    'yml', 'yaml', 'toml', 'ini', 'conf', 'json', 'xml', 'html', 'htm',
    'css', 'scss', 'less', 'md', 'sql', 'dockerfile', 'makefile', 'r',
    'swift', 'kt', 'lua', 'pl', 'ex', 'exs', 'hs', 'clj', 'vue', 'svelte'];

  if (codeExts.includes(ext)) return 'code';
  if (m.startsWith('text/')) return 'text';
  return 'file';
});

// Gallery/list queries filter by uploader and sort by createdAt descending.
fileSchema.index({ uploader: 1, createdAt: -1 });
// Admin gallery and "recent files" list globally, sorted by createdAt.
fileSchema.index({ createdAt: -1 });
// Tag filtering and distinct-tag lookups (multikey).
fileSchema.index({ tags: 1 });

fileSchema.set('toJSON', { virtuals: true });
fileSchema.set('toObject', { virtuals: true });

fileSchema.statics.createUnique = async function (data, maxAttempts = 5) {
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

module.exports = mongoose.model('File', fileSchema);
