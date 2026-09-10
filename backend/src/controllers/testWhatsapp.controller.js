const crypto = require('crypto');
const Conversation = require('../models/Conversation');
const { processMessage: defaultProcessMessage, normalizePhone } = require('../services/conversation.service');

function createTestWhatsappController({ processMessage = defaultProcessMessage } = {}) {
  async function handleMessage(req, res) {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const messageId = typeof req.body?.messageId === 'string' && req.body.messageId.trim()
      ? req.body.messageId.trim()
      : `SM-test-${crypto.randomUUID()}`;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message are required' });
    }

    try {
      const result = await processMessage({
        channel: 'WHATSAPP',
        phone,
        message,
        messageId
      });

      return res.status(200).json({
        success: true,
        reply: result.response,
        state: result.conversation.state,
        duplicate: Boolean(result.duplicate)
      });
    } catch (error) {
      console.error('[Test WhatsApp] Message processing failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to process test WhatsApp message' });
    }
  }

  async function resetConversation(req, res) {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    try {
      await Conversation.deleteOne({ phone: normalizePhone(phone), channel: 'WHATSAPP' });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Test WhatsApp] Reset failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to reset test WhatsApp conversation' });
    }
  }

  return { handleMessage, resetConversation };
}

module.exports = { createTestWhatsappController };