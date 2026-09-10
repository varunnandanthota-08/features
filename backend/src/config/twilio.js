const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID: accountSid,
  TWILIO_AUTH_TOKEN: authToken,
  TWILIO_WHATSAPP_NUMBER: whatsappNumber,
  WHATSAPP_PUBLIC_NUMBER: publicNumber
} = process.env;

const isTwilioConfigured = Boolean(accountSid && authToken && whatsappNumber);
const twilioClient = isTwilioConfigured ? twilio(accountSid, authToken) : null;

function normalizePhoneNumber(phone) {
  if (typeof phone !== 'string') {
    throw new TypeError('Phone number must be a string');
  }

  const normalizedPhone = phone.trim().replace(/^(?:whatsapp|sms):/i, '');
  const e164PhonePattern = /^\+[1-9]\d{7,14}$/;

  if (!e164PhonePattern.test(normalizedPhone)) {
    throw new Error('Phone number must use E.164 format');
  }

  return normalizedPhone;
}

function normalizeWhatsAppNumber(phone) {
  return `whatsapp:${normalizePhoneNumber(phone)}`;
}

module.exports = {
  isTwilioConfigured,
  normalizePhoneNumber,
  normalizeWhatsAppNumber,
  twilioClient,
  whatsappNumber,
  publicNumber
};
