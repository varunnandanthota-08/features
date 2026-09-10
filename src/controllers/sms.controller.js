const crypto = require('crypto');
const twilio = require('twilio');
const { processMessage: defaultProcessMessage } = require('../services/conversation.service');

const MessagingResponse = twilio.twiml.MessagingResponse;

function isTwilioPayload(payload) {
  return typeof payload.From === 'string'
    || typeof payload.Body === 'string'
    || typeof payload.MessageSid === 'string';
}

function getInfobipMessage(payload) {
  const message = Array.isArray(payload.results) ? payload.results[0] : null;
  if (!message || typeof message !== 'object') return null;

  const from = typeof message.from === 'string' ? message.from.trim() : '';
  return {
    from: from && from.startsWith('+') ? from : `+${from}`,
    body: message.text,
    messageId: message.messageId
  };
}

function normalizeIncomingMessage(payload) {
  const infobipMessage = getInfobipMessage(payload);
  const rawPhone = infobipMessage?.from || (typeof payload.from === 'string' ? payload.from : payload.From);
  const rawMessage = infobipMessage?.body ?? (typeof payload.body === 'string' ? payload.body : payload.Body);
  const rawMessageId = infobipMessage?.messageId || (typeof payload.messageId === 'string' ? payload.messageId : payload.MessageSid);
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  const messageId = typeof rawMessageId === 'string' && rawMessageId.trim()
    ? rawMessageId.trim()
    : `SMS-${crypto.randomUUID()}`;

  if (!phone || !message) {
    const error = new Error('from and body are required');
    error.statusCode = 400;
    throw error;
  }

  return { channel: 'SMS', phone, message, messageId };
}

function sendTwilioReply(res, reply, statusCode) {
  const response = new MessagingResponse();
  if (reply) response.message(reply);
  return res.type('text/xml').status(statusCode).send(response.toString());
}

function createSmsController({ processMessage = defaultProcessMessage } = {}) {
  return async function handleSmsWebhook(req, res) {
    try {
      const payload = req.body || {};
      const twilioRequest = isTwilioPayload(payload);
      const incomingMessage = normalizeIncomingMessage(payload);
      const result = await processMessage(incomingMessage);

      if (result.persistenceFailed) {
        if (twilioRequest) return sendTwilioReply(res, result.response, 503);
        return res.status(503).json({ reply: result.response });
      }

      if (twilioRequest) return sendTwilioReply(res, result.response, 200);

      return res.status(200).json({
        reply: result.response,
        state: result.conversation.state,
        duplicate: Boolean(result.duplicate)
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      console.error('[SMS] Webhook processing failed:', error.message);
      return res.status(statusCode).json({
        success: false,
        message: statusCode === 400 ? error.message : 'Unable to process SMS message'
      });
    }
  };
}

module.exports = { createSmsController, normalizeIncomingMessage };