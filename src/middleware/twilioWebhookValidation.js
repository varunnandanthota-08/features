const twilio = require('twilio');

function shouldValidateWebhook() {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  return process.env.TWILIO_VALIDATE_WEBHOOK === 'true';
}

function getRequestWebhookUrl(req) {
  const forwardedProtocol = req.get('x-forwarded-proto');
  const protocol = forwardedProtocol ? forwardedProtocol.split(',')[0].trim() : req.protocol;
  return `${protocol}://${req.get('host')}${req.originalUrl}`;
}

function getWebhookUrl(req, { useRequestUrl = false } = {}) {
  return !useRequestUrl && process.env.TWILIO_WEBHOOK_URL
    ? process.env.TWILIO_WEBHOOK_URL
    : getRequestWebhookUrl(req);
}

function createTwilioWebhookValidation(options = {}) {
  return function routeTwilioWebhookValidation(req, res, next) {
    if (!validateTwilioWebhook(req, options)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    return next();
  };
}

const twilioWebhookValidation = createTwilioWebhookValidation();

function validateTwilioWebhook(req, options = {}) {
  if (!shouldValidateWebhook()) {
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('X-Twilio-Signature');

  if (!authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(authToken, signature, getWebhookUrl(req, options), req.body);
}

module.exports = {
  createTwilioWebhookValidation,
  getWebhookUrl,
  shouldValidateWebhook,
  twilioWebhookValidation,
  validateTwilioWebhook
};
