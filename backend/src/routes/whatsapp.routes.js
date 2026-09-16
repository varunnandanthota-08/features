const express = require('express');
const { sendMessage } = require('../services/whatsapp.service');
const { createWhatsappController } = require('../controllers/whatsapp.controller');
const { twilioWebhookValidation } = require('../middleware/twilioWebhookValidation');

function createWhatsappRouter({
  messageSender = sendMessage,
  conversationProcessor
} = {}) {
  const router = express.Router();
  const controllerOptions = { sendMessage: messageSender };
  if (conversationProcessor) {
    controllerOptions.processMessage = conversationProcessor;
  }
  const handleWhatsappWebhook = createWhatsappController(controllerOptions);
  const { createWhatsAppChatLink } = require('../config/whatsapp');

  router.post('/webhook', twilioWebhookValidation, handleWhatsappWebhook);
  
  router.get('/link', (req, res) => {
    try {
      res.json({ success: true, link: createWhatsAppChatLink() });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createWhatsappRouter();
module.exports.createWhatsappRouter = createWhatsappRouter;
