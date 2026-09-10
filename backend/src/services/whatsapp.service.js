const {
  isTwilioConfigured,
  normalizeWhatsAppNumber,
  twilioClient,
  whatsappNumber
} = require('../config/twilio');

async function sendMessage(phone, message) {
  if (!isTwilioConfigured || !twilioClient) {
    throw new Error('Twilio is not configured');
  }

  if (typeof message !== 'string' || !message.trim()) {
    throw new TypeError('WhatsApp message must be a non-empty string');
  }

  const response = await twilioClient.messages.create({
    body: message.trim(),
    from: normalizeWhatsAppNumber(whatsappNumber),
    to: normalizeWhatsAppNumber(phone)
  });

  return response;
}

module.exports = { sendMessage };
