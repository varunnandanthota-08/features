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

  router.post('/webhook', twilioWebhookValidation, handleWhatsappWebhook);

  return router;
}

module.exports = createWhatsappRouter();
module.exports.createWhatsappRouter = createWhatsappRouter;
