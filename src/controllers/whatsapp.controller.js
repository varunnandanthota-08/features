const { normalizeWhatsAppNumber } = require('../config/twilio');
const { sendMessage: defaultSendMessage } = require('../services/whatsapp.service');
const { processMessage: defaultProcessMessage } = require('../services/conversation.service');

function normalizeIncomingMessage(payload) {
  const from = typeof payload.From === 'string' ? payload.From.trim() : '';
  const messageId = typeof payload.MessageSid === 'string' ? payload.MessageSid.trim() : '';
  const message = typeof payload.Body === 'string' ? payload.Body.trim() : '';
  const mediaCount = Number.parseInt(payload.NumMedia, 10);

  if (!from || !messageId) {
    const error = new Error('From and MessageSid are required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedPhone = normalizeWhatsAppNumber(from).replace(/^whatsapp:/, '');
  const attachments = Number.isInteger(mediaCount) && mediaCount > 0
    ? Array.from({ length: mediaCount }, (_, index) => ({
      url: payload[`MediaUrl${index}`] || null,
      contentType: payload[`MediaContentType${index}`] || null
    }))
    : [];

  return {
    channel: 'WHATSAPP',
    phone: normalizedPhone,
    message,
    messageId,
    attachments
  };
}

function createWhatsappController({
  sendMessage = defaultSendMessage,
  processMessage = defaultProcessMessage
} = {}) {
  return async function handleWhatsappWebhook(req, res) {
    try {
      const incomingMessage = normalizeIncomingMessage(req.body || {});
      const result = await processMessage(incomingMessage);

      if (!result.duplicate && result.response) {
        await sendMessage(incomingMessage.phone, result.response);
      }

      if (result.persistenceFailed) {
        return res.status(503).json({
          success: false,
          message: 'Registration could not be completed'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook processed',
        data: incomingMessage,
        conversation: {
          state: result.conversation.state,
          language: result.conversation.language
        },
        duplicate: Boolean(result.duplicate)
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      console.error('[WhatsApp] Webhook processing failed:', error.message);

      return res.status(statusCode).json({
        success: false,
        message: statusCode === 400
          ? error.message
          : 'Unable to process WhatsApp message'
      });
    }
  };
}

module.exports = {
  createWhatsappController,
  normalizeIncomingMessage
};
