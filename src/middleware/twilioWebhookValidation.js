const twilio = require('twilio');

function shouldValidateWebhook() {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  return process.env.TWILIO_VALIDATE_WEBHOOK === 'true';
}

function getWebhookUrl(req) {
  return process.env.TWILIO_WEBHOOK_URL || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

function validateTwilioWebhook(req) {
  if (!shouldValidateWebhook()) {
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('X-Twilio-Signature');

  if (!authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(authToken, signature, getWebhookUrl(req), req.body);
}

function twilioWebhookValidation(req, res, next) {
  if (!validateTwilioWebhook(req)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid webhook signature'
    });
  }

  return next();
}

module.exports = {
  getWebhookUrl,
  shouldValidateWebhook,
  twilioWebhookValidation,
  validateTwilioWebhook
};
