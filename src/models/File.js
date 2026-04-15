const mongoose = require('mongoose');
const crypto = require('crypto');

const fileSchema = new mongoose.Schema({
  shortId: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(4).toString('hex'), // 8 hex chars
  },
  deleteToken: {
    type: String,
    unique: true,
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

fileSchema.set('toJSON', { virtuals: true });
fileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('File', fileSchema);
