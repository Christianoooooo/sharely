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

const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-msi',
  'application/vnd.microsoft.portable-executable',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.psm1', '.psd1',
  '.sh', '.bash', '.csh', '.zsh', '.fish',
  '.vbs', '.vbe', '.js.exe', '.jse',
  '.scr', '.pif', '.application', '.gadget', '.hta',
  '.php', '.php3', '.php4', '.php5', '.phtml',
  '.asp', '.aspx', '.jsp', '.jspx', '.cfm',
]);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_MIME_TYPES.has(file.mimetype) || BLOCKED_EXTENSIONS.has(ext)) {
    return cb(new Error('File type not allowed'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
