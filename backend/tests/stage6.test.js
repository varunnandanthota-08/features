const twilio = require('twilio');
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));
const { createWhatsAppChatLink } = require('../src/config/whatsapp');
const {
  createTwilioWebhookValidation,
  getWebhookUrl,
  validateTwilioWebhook
} = require('../src/middleware/twilioWebhookValidation');

describe('Stage 6 configuration and webhook security', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_PUBLIC_NUMBER;
    delete process.env.TWILIO_VALIDATE_WEBHOOK;
    delete process.env.TWILIO_WEBHOOK_URL;
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NODE_ENV = 'test';
  });

  test('creates a WhatsApp chat link from configuration', () => {
    process.env.WHATSAPP_PUBLIC_NUMBER = '+14155552671';

    expect(createWhatsAppChatLink()).toBe('https://wa.me/+14155552671?text=Hi');
  });

  test('bypasses validation only when explicitly disabled', () => {
    process.env.NODE_ENV = 'test';
    process.env.TWILIO_VALIDATE_WEBHOOK = 'false';

    expect(validateTwilioWebhook({})).toBe(true);
  });

  test('does not allow the bypass in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_VALIDATE_WEBHOOK = 'false';

    expect(validateTwilioWebhook({ get: () => undefined })).toBe(false);
  });

  test('validates a signed Twilio request using the official SDK', () => {
    const authToken = 'test-auth-token';
    const body = {
      From: 'whatsapp:+919876543210',
      Body: 'Hi',
      MessageSid: 'SM123'
    };
    const request = {
      protocol: 'https',
      originalUrl: '/api/channels/whatsapp/webhook',
      body,
      get: name => name === 'host' ? 'example.ngrok.app' : undefined
    };
    const url = getWebhookUrl(request);
    const signature = twilio.getExpectedTwilioSignature(authToken, url, body);

    process.env.TWILIO_VALIDATE_WEBHOOK = 'true';
    process.env.TWILIO_AUTH_TOKEN = authToken;

    expect(validateTwilioWebhook({ ...request, get: name => name === 'X-Twilio-Signature' ? signature : request.get(name) })).toBe(true);
  });

  test('rejects an invalid Twilio signature', () => {
    process.env.TWILIO_VALIDATE_WEBHOOK = 'true';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';

    expect(validateTwilioWebhook({
      protocol: 'https',
      originalUrl: '/api/channels/whatsapp/webhook',
      body: {},
      get: name => name === 'host' ? 'example.ngrok.app' : name === 'X-Twilio-Signature' ? 'invalid' : undefined
    })).toBe(false);
  });

  test('validates an IVR signature against the actual IVR request URL', () => {
    const authToken = 'test-auth-token';
    const body = { CallSid: 'CA123', From: '+919876543210' };
    const request = {
      protocol: 'http',
      originalUrl: '/api/ivr/incoming',
      body,
      get: name => name === 'host' ? 'example.ngrok.app' : undefined
    };
    const url = getWebhookUrl(request, { useRequestUrl: true });
    const signature = twilio.getExpectedTwilioSignature(authToken, url, body);

    process.env.TWILIO_VALIDATE_WEBHOOK = 'true';
    process.env.TWILIO_AUTH_TOKEN = authToken;

    expect(validateTwilioWebhook({
      ...request,
      get: name => name === 'X-Twilio-Signature' ? signature : request.get(name)
    }, { useRequestUrl: true })).toBe(true);
  });

  test('rejects an invalid IVR signature', () => {
    process.env.TWILIO_VALIDATE_WEBHOOK = 'true';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';

    expect(validateTwilioWebhook({
      protocol: 'https',
      originalUrl: '/api/ivr/incoming',
      body: {},
      get: name => name === 'host' ? 'example.ngrok.app' : name === 'X-Twilio-Signature' ? 'invalid' : undefined
    }, { useRequestUrl: true })).toBe(false);
  });

  test('creates a route validator for IVR request URLs', () => {
    expect(createTwilioWebhookValidation({ useRequestUrl: true })).toEqual(expect.any(Function));
  });
});
