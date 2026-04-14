const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const User = require('../models/User');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      // req.apiUser is set by requireApiKey; req.session.user by requireLogin.
      // Both are available here only when auth middleware runs BEFORE multer.
      const userId = req.apiUser?._id || req.session?.user?.id;
      if (userId) {
        const user = await User.findById(userId).select('folderName username');
        const folder = user?.folderName || user?.username;
        if (folder) {
          const dir = path.join(UPLOAD_DIR, folder);
          fs.mkdirSync(dir, { recursive: true });
          return cb(null, dir);
        }
      }
      // Fallback: root uploads dir (e.g. when auth runs after multer in app.js)
      cb(null, UPLOAD_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = crypto.randomBytes(4).toString('hex');
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

module.exports = upload;
