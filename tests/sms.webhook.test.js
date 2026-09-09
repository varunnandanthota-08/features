const request = require('supertest');

const mockConversations = new Map();
const mockCreateOrUpdatePatient = jest.fn();

jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient
}));

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

    static async deleteMany() {
      mockConversations.clear();
    }
  }

  return MockConversation;
});

const { app } = require('../src/app');

const phone = '+919876543210';
let messageNumber;

function send(body, messageId) {
  messageNumber += 1;
  return request(app)
    .post('/api/channels/sms/webhook')
    .send({ from: phone, body, ...(messageId ? { messageId } : {}) });
}

describe('SMS webhook', () => {
  beforeEach(() => {
    mockConversations.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockCreateOrUpdatePatient.mockResolvedValue({ phone });
    messageNumber = 0;
  });

  test('starts a new conversation and shows language choices', async () => {
    const response = await send('HI');

    expect(response.status).toBe(200);
    expect(response.body.reply).toContain('1. Telugu');
    expect(response.body.state).toBe('SELECT_LANGUAGE');
  });

  test('accepts Twilio SMS fields and returns a TwiML reply', async () => {
    const response = await request(app)
      .post('/api/channels/sms/webhook')
      .type('form')
      .send({
        From: `sms:${phone}`,
        Body: 'HI',
        MessageSid: 'SM-TWILIO-1'
      });

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/xml');
    expect(response.text).toContain('<Message>Welcome to Rural Health Support.');
    expect(response.text).toContain('Please select your language:');
    expect(mockConversations.get(`${phone}:SMS`)).toMatchObject({
      phone,
      channel: 'SMS',
      state: 'SELECT_LANGUAGE',
      processedMessageIds: ['SM-TWILIO-1']
    });
  });

  test('collects language, name, age, gender, location, and symptoms', async () => {
    await send('HI');
    const language = await send('3');
    const name = await send('Ravi Kumar');
    const invalidAge = await send('121');
    const age = await send('52');
    const gender = await send('1');
    const location = await send('Village A');
    const symptoms = await send('Fever for three days');

    expect(language.body.state).toBe('COLLECT_NAME');
    expect(name.body.state).toBe('COLLECT_AGE');
    expect(invalidAge.body.state).toBe('COLLECT_AGE');
    expect(invalidAge.body.reply).toContain('1 and 120');
    expect(age.body.state).toBe('COLLECT_GENDER');
    expect(age.body.reply).toContain('3. Other');
    expect(age.body.reply).not.toContain('Prefer');
    expect(gender.body.state).toBe('COLLECT_LOCATION');
    expect(location.body.state).toBe('COLLECT_SYMPTOMS');
    expect(symptoms.body.state).toBe('CONFIRM');
    expect(symptoms.body.reply).toContain('Reply 1 to confirm');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  test('confirms and creates the patient through the existing patient service', async () => {
    for (const body of ['HI', '3', 'Ravi Kumar', '52', '1', 'Village A', 'Fever']) {
      await send(body);
    }

    const response = await send('1');

    expect(response.body.state).toBe('COMPLETED');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith({
      phone,
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      language: 'en',
      symptomsDescription: 'Fever',
      source: 'SMS'
    });
  });

  test('continues the same conversation using the sender phone number', async () => {
    await send('HI');
    const secondMessage = await send('2');

    expect(secondMessage.body.state).toBe('COLLECT_NAME');
    expect(mockConversations.size).toBe(1);
    expect(Array.from(mockConversations.values())[0].language).toBe('hi');
  });

  test('keeps confirmation open for invalid input', async () => {
    for (const body of ['HI', '3', 'Ravi Kumar', '52', '1', 'Village A', 'Fever']) {
      await send(body);
    }

    const response = await send('maybe');

    expect(response.body.state).toBe('CONFIRM');
    expect(response.body.reply).toContain('reply 1 to confirm');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  test('completes Telugu registration, stores SMS conversation data, and handles duplicate IDs', async () => {
    const messages = [
      ['HI', 'SMS-1'],
      ['1', 'SMS-2'],
      ['Ravi Kumar', 'SMS-3'],
      ['52', 'SMS-4'],
      ['1', 'SMS-5'],
      ['Village A', 'SMS-6'],
      ['Fever for 3 days', 'SMS-7']
    ];
    const expectedStates = [
      'SELECT_LANGUAGE',
      'COLLECT_NAME',
      'COLLECT_AGE',
      'COLLECT_GENDER',
      'COLLECT_LOCATION',
      'COLLECT_SYMPTOMS',
      'CONFIRM'
    ];

    for (const [index, [body, messageId]] of messages.entries()) {
      const response = await send(body, messageId);
      expect(response.body.state).toBe(expectedStates[index]);
    }

    const conversation = Array.from(mockConversations.values())[0];
    expect(mockConversations.size).toBe(1);
    expect(conversation.channel).toBe('SMS');
    expect(conversation.phone).toBe(phone);
    expect(conversation.language).toBe('te');
    expect(conversation.data).toEqual({
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      symptomsDescription: 'Fever for 3 days'
    });

    const confirmation = await send('1', 'SMS-8');
    expect(confirmation.body.state).toBe('COMPLETED');
    expect(confirmation.body.reply).toBeTruthy();
    expect(conversation.state).toBe('COMPLETED');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith({
      phone,
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      language: 'te',
      symptomsDescription: 'Fever for 3 days',
      source: 'SMS'
    });

    const duplicate = await send('1', 'SMS-8');
    expect(duplicate.body.duplicate).toBe(true);
    expect(duplicate.body.reply).toBeNull();
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledTimes(1);
  });
});
