const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const File = require('../models/File');

const PAGE_SIZE = 24;

// GET /gallery
router.get('/', requireLogin, async (req, res) => {
  const { q, type, page: pageStr } = req.query;
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const isAdmin = req.session.user.role === 'admin';

  const filter = {};

  // Non-admins only see their own files
  if (!isAdmin) {
    filter.uploader = req.session.user.id;
  }

  if (q) {
    filter.originalName = { $regex: q, $options: 'i' };
  }

  // Type filter based on displayType virtual — we map to mimeType prefixes
  if (type && type !== 'all') {
    const typeMap = {
      image: /^image\//,
      video: /^video\//,
      audio: /^audio\//,
      pdf: /^application\/pdf$/,
    };
    if (typeMap[type]) {
      filter.mimeType = typeMap[type];
    } else if (type === 'code') {
      // code files are identified by extension — filter by common text mimeTypes
      filter.mimeType = /^text\//;
    }
  }

  const total = await File.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const files = await File.find(filter)
    .populate('uploader', 'username')
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  res.render('gallery', {
    files,
    total,
    page,
    pages,
    q: q || '',
    type: type || 'all',
    isAdmin,
  });
});

module.exports = router;
