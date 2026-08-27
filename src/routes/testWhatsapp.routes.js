const express = require('express');
const { createTestWhatsappController } = require('../controllers/testWhatsapp.controller');

const { handleMessage, resetConversation } = createTestWhatsappController();
const router = express.Router();

router.post('/', handleMessage);
router.post('/reset', resetConversation);

module.exports = router;