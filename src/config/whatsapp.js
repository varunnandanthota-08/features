const { publicNumber } = require('./twilio');

function createWhatsAppChatLink(text = 'Hi') {
  if (!publicNumber) {
    throw new Error('WHATSAPP_PUBLIC_NUMBER is not configured');
  }

  const phone = publicNumber.trim().replace(/^whatsapp:/i, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

module.exports = { createWhatsAppChatLink };
