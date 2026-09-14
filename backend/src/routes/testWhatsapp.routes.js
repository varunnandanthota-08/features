const express = require('express');
const multer = require('multer');
const { createTestWhatsappController } = require('../controllers/testWhatsapp.controller');

const { handleMessage, handleUpload, resetConversation } = createTestWhatsappController();
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/', handleMessage);
router.post('/upload', upload.single('file'), handleUpload);
router.post('/reset', resetConversation);

module.exports = router;