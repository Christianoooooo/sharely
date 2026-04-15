const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
  apiKey: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(24).toString('hex'),
  },
  folderName: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    maxlength: 64,
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

// Hash password before saving; auto-assign folderName on new users
userSchema.pre('save', async function (next) {
  if (this.isNew && !this.folderName) {
    this.folderName = crypto.randomBytes(8).toString('hex');
  }
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.regenerateApiKey = function () {
  this.apiKey = crypto.randomBytes(24).toString('hex');
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
