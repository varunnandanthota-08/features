const request = require('supertest');

const mockConversations = new Map();
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
      mockConversations.set(`${this.callSid}:${this.channel}`, this);
      return this;
    }

    static async findOne(query) {
      return mockConversations.get(`${query.callSid}:${query.channel}`) || null;
    }
  }

  return MockConversation;
});

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://example.ngrok.test';
const { app } = require('../src/app');

function callPayload(callSid, values = {}) {
  return { CallSid: callSid, From: '+919876543210', ...values };
}

async function post(path, callSid, values = {}) {
  return request(app).post(`/api/ivr/${path}`).type('form').send(callPayload(callSid, values));
}

describe('IVR patient information flow', () => {
  beforeEach(() => {
    mockConversations.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockCreateOrUpdatePatient.mockResolvedValue({ phone: '+919876543210' });
  });

  test('answers an incoming call with language selection TwiML', async () => {
    const response = await post('incoming', 'CA001');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/xml');
    expect(response.text).toContain('<Gather');
    expect(response.text).toContain('Press 1 for Telugu');
    expect(response.text).toContain('action="https://example.ngrok.test/api/ivr/language"');
    expect(response.text).toContain('<Redirect method="POST">https://example.ngrok.test/api/ivr/language</Redirect>');
  });

  test('rejects invalid language and persists valid language state', async () => {
    await post('incoming', 'CA002');
    const invalid = await post('language', 'CA002', { Digits: '9' });
    expect(invalid.text).toContain('Press 1 for Telugu');
    expect(mockConversations.get('CA002:IVR').state).toBe('IVR_LANGUAGE_SELECTION');

    const valid = await post('language', 'CA002', { Digits: '3' });
    expect(valid.text).toContain('Please say your full name');
    expect(mockConversations.get('CA002:IVR')).toMatchObject({
      language: 'en', state: 'IVR_COLLECT_NAME', phone: '+919876543210'
    });
  });

  test.each([
    ['1', 'te-IN', 'Google.te-IN-Standard-A', 'దయచేసి టోన్ తర్వాత మీ పూర్తి పేరు చెప్పండి.'],
    ['2', 'hi-IN', 'Google.hi-IN-Standard-A', 'कृपया संकेत के बाद अपना पूरा नाम बताएं।'],
    ['3', 'en-US', 'alice', 'Please say your full name after the tone.']
  ])('uses the selected %s language voice for the next prompt', async (digit, language, voice, nextPrompt) => {
    const response = await post('incoming', `CA-LANGUAGE-${digit}`);
    expect(response.text).toContain('language="en-US"');
    expect(response.text).toContain('voice="alice"');
    expect(response.text).toContain('action="https://example.ngrok.test/api/ivr/language"');

    const selected = await post('language', `CA-LANGUAGE-${digit}`, { Digits: digit });

    expect(selected.text).toContain(`language="${language}"`);
    expect(selected.text).toContain(`voice="${voice}"`);
    expect(selected.text).toContain(nextPrompt);
    expect(selected.text).toContain('action="https://example.ngrok.test/api/ivr/name"');
    expect(selected.text).toContain('https://example.ngrok.test/api/ivr/name');
  });

  test('does not advance twice for the same input webhook', async () => {
    await post('incoming', 'CA003');
    const first = await post('language', 'CA003', { Digits: '3' });
    const duplicate = await post('language', 'CA003', { Digits: '3' });

    expect(first.text).toContain('Please say your full name');
    expect(duplicate.text).toContain('Please say your full name');
    expect(mockConversations.get('CA003:IVR').state).toBe('IVR_COLLECT_NAME');
  });

  test('allows separate IVR sessions for different CallSids from one phone', async () => {
    await post('incoming', 'CA006');
    await post('incoming', 'CA007');

    expect(mockConversations.get('CA006:IVR')).toMatchObject({
      phone: '+919876543210', state: 'IVR_LANGUAGE_SELECTION'
    });
    expect(mockConversations.get('CA007:IVR')).toMatchObject({
      phone: '+919876543210', state: 'IVR_LANGUAGE_SELECTION'
    });
  });

  test('completes registration and saves the patient only at confirmation', async () => {
    const callSid = 'CA004';
    await post('incoming', callSid);
    await post('language', callSid, { Digits: '3' });
    await post('name', callSid, { SpeechResult: 'Ravi Kumar' });
    await post('age', callSid, { Digits: '52' });
    await post('gender', callSid, { Digits: '1' });
    await post('location', callSid, { SpeechResult: 'Village A' });
    const symptoms = await post('symptoms', callSid, { SpeechResult: 'I have fever for three days.' });

    expect(symptoms.text).toContain('Press 1 to confirm');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();

    const confirmed = await post('confirm', callSid, { Digits: '1' });
    expect(confirmed.text).toContain('Your registration is complete');
    expect(confirmed.text).toContain('<Hangup');
    expect(mockConversations.get(`${callSid}:IVR`).state).toBe('IVR_COMPLETED');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith({
      phone: '+919876543210',
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      language: 'en',
      symptomsDescription: 'I have fever for three days.',
      source: 'IVR'
    });
  });

  test('re-prompts invalid age without advancing', async () => {
    await post('incoming', 'CA005');
    await post('language', 'CA005', { Digits: '3' });
    await post('name', 'CA005', { SpeechResult: 'Ravi Kumar' });
    const invalid = await post('age', 'CA005', { Digits: '150' });

    expect(invalid.text).toContain('Please enter your age using the keypad, followed by the pound key.');
    expect(mockConversations.get('CA005:IVR').state).toBe('IVR_COLLECT_AGE');
  });

  test('collects age from DTMF and configures pound termination', async () => {
    await post('incoming', 'CA008');
    await post('language', 'CA008', { Digits: '3' });
    const agePrompt = await post('name', 'CA008', { SpeechResult: 'Ravi Kumar' });

    const response = await post('age', 'CA008', { Digits: '38' });

    expect(agePrompt.text).toContain('input="dtmf"');
    expect(agePrompt.text).toContain('finishOnKey="#"');
    expect(agePrompt.text).toContain('action="https://example.ngrok.test/api/ivr/age"');
    expect(response.text).toContain('https://example.ngrok.test/api/ivr/gender');
    expect(response.text).toContain('input="dtmf"');
    expect(response.text).toContain('numDigits="1"');
    expect(mockConversations.get('CA008:IVR')).toMatchObject({
      state: 'IVR_COLLECT_GENDER',
      data: { age: 38 }
    });
  });

  test('accepts one gender digit and advances to location', async () => {
    await post('incoming', 'CA010');
    await post('language', 'CA010', { Digits: '3' });
    await post('name', 'CA010', { SpeechResult: 'Ravi Kumar' });
    await post('age', 'CA010', { Digits: '38' });

    const response = await post('gender', 'CA010', { Digits: '1' });

    expect(response.text).toContain('action="https://example.ngrok.test/api/ivr/location"');
    expect(mockConversations.get('CA010:IVR')).toMatchObject({
      state: 'IVR_COLLECT_LOCATION',
      data: { gender: 'male' }
    });
  });

  test('rejects invalid gender without advancing', async () => {
    await post('incoming', 'CA011');
    await post('language', 'CA011', { Digits: '3' });
    await post('name', 'CA011', { SpeechResult: 'Ravi Kumar' });
    await post('age', 'CA011', { Digits: '38' });

    const response = await post('gender', 'CA011', { Digits: '9' });

    expect(response.text).toContain('action="https://example.ngrok.test/api/ivr/gender"');
    expect(mockConversations.get('CA011:IVR').state).toBe('IVR_COLLECT_GENDER');
  });

  test('reprompts when age DTMF input is missing', async () => {
    await post('incoming', 'CA009');
    await post('language', 'CA009', { Digits: '3' });
    await post('name', 'CA009', { SpeechResult: 'Ravi Kumar' });

    const response = await post('age', 'CA009');

    expect(response.text).toContain('Please enter your age using the keypad, followed by the pound key.');
    expect(mockConversations.get('CA009:IVR').state).toBe('IVR_COLLECT_AGE');
  });
});
