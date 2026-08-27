const request = require('supertest');

const mockSessions = new Map();
const mockCreateOrUpdatePatient = jest.fn();

jest.mock('../src/middleware/twilioWebhookValidation', () => ({
  twilioWebhookValidation: (req, res, next) => next(),
  createTwilioWebhookValidation: () => (req, res, next) => next()
}));

jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient
}));

jest.mock('../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        callSid: null,
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
      mockSessions.set(this.callSid, this);
      return this;
    }

    static async findOne(query) {
      if (query.callSid) return mockSessions.get(query.callSid) || null;
      return Array.from(mockSessions.values()).find(session => (
        session.phone === query.phone && session.channel === query.channel
      )) || null;
    }

    static async deleteMany(query) {
      for (const [callSid, session] of mockSessions) {
        if (session.phone === query.phone && session.channel === query.channel) {
          mockSessions.delete(callSid);
        }
      }
    }
  }

  return MockConversation;
});

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://example.ngrok.test';
const { app } = require('../src/app');

const phone = '+910000000001';

async function start() {
  return request(app).post('/api/test/ivr/start').send({ phone });
}

async function input(sessionId, value, extra = {}) {
  return request(app).post('/api/test/ivr/input').send({ sessionId, value, ...extra });
}

async function completeFlow() {
  const started = await start();
  const sessionId = started.body.sessionId;
  let response = await input(sessionId, '3');
  response = await input(sessionId, 'Ravi Kumar');
  response = await input(sessionId, '52');
  response = await input(sessionId, '1');
  response = await input(sessionId, 'Nalgonda');
  response = await input(sessionId, 'I have had fever for three days');
  expect(response.body.state).toBe('IVR_CONFIRM');
  response = await input(sessionId, '1');
  return { sessionId, response };
}

describe('local IVR simulator', () => {
  beforeEach(() => {
    mockSessions.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockCreateOrUpdatePatient.mockResolvedValue({ phone });
  });

  test('runs the complete flow through HTTP and creates one Patient at confirmation', async () => {
    const { sessionId, response } = await completeFlow();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, state: 'IVR_COMPLETED', nextState: 'IVR_COMPLETED' });
    expect(response.body.data).toMatchObject({ name: 'Ravi Kumar', age: 52, gender: 'male', village: 'Nalgonda' });
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledTimes(1);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ source: 'IVR' }));
    expect(mockSessions.get(sessionId).state).toBe('IVR_COMPLETED');
  });

  test('starts fresh and returns the first prompt', async () => {
    const response = await start();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'IVR_LANGUAGE_SELECTION', nextState: 'IVR_LANGUAGE_SELECTION' });
    expect(response.body.prompt).toContain('Press 1 for Telugu');
  });

  test('creates independent sessions when the same phone starts another call', async () => {
    const first = await start();
    const second = await start();

    expect(first.body.sessionId).not.toBe(second.body.sessionId);
    expect(mockSessions.get(first.body.sessionId).phone).toBe(phone);
    expect(mockSessions.get(second.body.sessionId).phone).toBe(phone);
  });

  test.each([
    ['language', '9', 'IVR_LANGUAGE_SELECTION'],
    ['gender', '9', 'IVR_COLLECT_GENDER'],
    ['age', '150', 'IVR_COLLECT_AGE'],
    ['age', 'abc', 'IVR_COLLECT_AGE']
  ])('does not advance for invalid %s input', async (step, value, expectedState) => {
    const started = await start();
    const sessionId = started.body.sessionId;
    const setup = {
      language: [],
      gender: [['3'], ['Ravi Kumar'], ['52']],
      age: [['3'], ['Ravi Kumar']]
    };
    for (const [setupValue] of (setup[step] || [])) await input(sessionId, setupValue);

    const response = await input(sessionId, value);
    expect(response.status).toBe(200);
    expect(response.body.state).toBe(expectedState);
  });

  test('rejects missing input without changing the state', async () => {
    const started = await start();
    const response = await input(started.body.sessionId, '');

    expect(response.status).toBe(400);
    expect(mockSessions.get(started.body.sessionId).state).toBe('IVR_LANGUAGE_SELECTION');
  });

  test('loads the current state by phone and returns to confirmation after rejection', async () => {
    const started = await start();
    const sessionId = started.body.sessionId;
    await input(sessionId, '3');
    await input(sessionId, 'Ravi Kumar');
    await input(sessionId, '52');
    await input(sessionId, '1');
    await input(sessionId, 'Nalgonda');
    await input(sessionId, 'Fever for three days');

    const rejected = await request(app).post('/api/test/ivr/input').send({ phone, value: '2' });
    expect(rejected.body.state).toBe('IVR_CONFIRM');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  test('does not save twice for repeated final input', async () => {
    const { sessionId } = await completeFlow();
    const repeated = await input(sessionId, '1', { eventId: 'final-retry' });
    const repeatedAgain = await input(sessionId, '1', { eventId: 'final-retry-2' });

    expect(repeated.status).toBe(200);
    expect(repeatedAgain.body.state).toBe('IVR_COMPLETED');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledTimes(1);
  });
});
