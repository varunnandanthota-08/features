const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID: accountSid,
  TWILIO_AUTH_TOKEN: authToken,
  TWILIO_WHATSAPP_NUMBER: whatsappNumber,
  WHATSAPP_PUBLIC_NUMBER: publicNumber
} = process.env;

const isTwilioConfigured = Boolean(accountSid && authToken && whatsappNumber);
const twilioClient = isTwilioConfigured ? twilio(accountSid, authToken) : null;

function normalizeWhatsAppNumber(phone) {
  if (typeof phone !== 'string') {
    throw new TypeError('WhatsApp phone number must be a string');
  }

  const normalizedPhone = phone.trim().replace(/^whatsapp:/i, '');
  const e164PhonePattern = /^\+[1-9]\d{7,14}$/;

  if (!e164PhonePattern.test(normalizedPhone)) {
    throw new Error('WhatsApp phone number must use E.164 format');
  }

  return `whatsapp:${normalizedPhone}`;
}

module.exports = {
  isTwilioConfigured,
  normalizeWhatsAppNumber,
  twilioClient,
  whatsappNumber,
  publicNumber
};
