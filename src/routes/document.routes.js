const express = require('express');
const multer = require('multer');
const { extractDocument, verifyDocument } = require('../controllers/document.controller');

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Unsupported file type');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'File size must not exceed 10 MB'
      : error.message;
    return res.status(400).json({ success: false, message });
  });
}

const router = express.Router();
router.post('/extract', handleUpload, extractDocument);
router.post('/verify', verifyDocument);

module.exports = router;
