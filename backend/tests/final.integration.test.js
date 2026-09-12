const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const mockConversations = new Map();
const mockPatients = new Map();

process.env.NODE_ENV = 'test';
process.env.TWILIO_VALIDATE_WEBHOOK = 'false';

jest.mock('../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        channel: 'WHATSAPP',
        state: 'START',
        language: null,
        data: {
          name: null,
          age: null,
          gender: null,
          village: null,
          symptomsDescription: null
        },
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

jest.mock('../src/models/Patient', () => ({
  findOne: jest.fn(async ({ phone }) => mockPatients.get(phone) || null),
  findOneAndUpdate: jest.fn(async ({ phone }, { $set: update }) => {
    const patient = { ...(mockPatients.get(phone) || {}), ...update };
    mockPatients.set(phone, patient);
    return patient;
  })
}));

jest.mock('../src/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue({ sid: 'SMmock-response' })
}));

const { app } = require('../src/app');
const { sendMessage } = require('../src/services/whatsapp.service');

const phone = 'whatsapp:+919876543210';

async function send(body, messageId) {
  return request(app)
    .post('/api/channels/whatsapp/webhook')
    .type('form')
    .send({ From: phone, Body: body, MessageSid: messageId, NumMedia: '0' });
}

describe('final WhatsApp registration flow', () => {
  beforeEach(() => {
    mockConversations.clear();
    mockPatients.clear();
    sendMessage.mockClear();
  });

  test('persists one Conversation and one mapped Patient through the webhook', async () => {
    const messages = [
      ['Hi', 'SM201'],
      ['3', 'SM202'],
      ['Ravi Kumar', 'SM203'],
      ['52', 'SM204'],
      ['1', 'SM205'],
      ['Village A', 'SM206'],
      ['I have fever for three days.', 'SM207']
    ];

    for (const [body, messageId] of messages) {
      const response = await send(body, messageId);
      expect(response.status).toBe(200);
    }

    const conversation = mockConversations.get('+919876543210:WHATSAPP');
    const patient = mockPatients.get('+919876543210');

    expect(mockConversations.size).toBe(1);
    expect(conversation.state).toBe('COMPLETED');
    expect(mockPatients.size).toBe(1);
    expect(patient).toEqual({
      phone: '+919876543210',
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      location: { village: 'Village A' },
      language: 'en',
      symptomsDescription: 'I have fever for three days.',
      source: 'WHATSAPP'
    });
    expect(patient).not.toHaveProperty('state');
    expect(patient).not.toHaveProperty('processedMessageIds');
    expect(sendMessage).toHaveBeenCalledTimes(7);
  });

  test('does not process a duplicate completion MessageSid twice', async () => {
    for (const [body, messageId] of [
      ['Hi', 'SM301'],
      ['3', 'SM302'],
      ['Ravi Kumar', 'SM303'],
      ['52', 'SM304'],
      ['1', 'SM305'],
      ['Village A', 'SM306'],
      ['I have fever for three days.', 'SM307']
    ]) {
      await send(body, messageId);
    }

    const firstResponseCount = sendMessage.mock.calls.length;
    const duplicateResponse = await send('I have fever for three days.', 'SM307');

    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.duplicate).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(firstResponseCount);
    expect(mockPatients.size).toBe(1);
  });
});
