const request = require('supertest');

const mockConversations = new Map();
const previousNodeEnv = process.env.NODE_ENV;
const previousTwilioValidation = process.env.TWILIO_VALIDATE_WEBHOOK;
process.env.NODE_ENV = 'test';
process.env.TWILIO_VALIDATE_WEBHOOK = 'false';

jest.mock('../../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        language: null,
        data: {},
        processedMessageIds: [],
        ...data
      });
    }

    async save() {
      mockConversations.set(`${this.phone}:${this.channel}`, this);
      return this;
    }

    static async findOne(query) {
      return mockConversations.get(`${query.phone}:${query.channel}`) || null;
    }
  }

  return MockConversation;
});

jest.mock('../../src/services/whatsapp.service', () => ({
  sendMessage: jest.fn()
}));

const { sendMessage } = require('../../src/services/whatsapp.service');
const { app } = require('../../src/app');

describe('WhatsApp webhook', () => {
  beforeEach(() => {
    mockConversations.clear();
    sendMessage.mockResolvedValue({ sid: 'SMmock-response' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousTwilioValidation === undefined) delete process.env.TWILIO_VALIDATE_WEBHOOK;
    else process.env.TWILIO_VALIDATE_WEBHOOK = previousTwilioValidation;
  });

  test('processes a mocked Twilio request through the conversation service', async () => {
    const response = await request(app)
      .post('/api/channels/whatsapp/webhook')
      .type('form')
      .send({
        From: 'whatsapp:+919876543210',
        Body: 'Hi',
        MessageSid: 'SM123',
        NumMedia: '0'
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      channel: 'WHATSAPP',
      phone: '+919876543210',
      message: 'Hi',
      messageId: 'SM123',
      attachments: []
    });
    expect(response.body.conversation.state).toBe('SELECT_LANGUAGE');
    expect(sendMessage).toHaveBeenCalledWith(
      '+919876543210',
      'Welcome to Rural Health Support.\n\nPlease select your language:\n\n1. Telugu\n2. Hindi\n3. English'
    );

    const nextResponse = await request(app)
      .post('/api/channels/whatsapp/webhook')
      .type('form')
      .send({
        From: 'whatsapp:+919876543210',
        Body: '3',
        MessageSid: 'SM124',
        NumMedia: '0'
      });

    expect(nextResponse.status).toBe(200);
    expect(nextResponse.body.conversation).toEqual({
      state: 'COLLECT_NAME',
      language: 'en'
    });
    expect(sendMessage).toHaveBeenLastCalledWith('+919876543210', 'Please enter your full name.');
  });
});
