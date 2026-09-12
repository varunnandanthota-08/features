const request = require('supertest');

const mockConversations = new Map();
const mockCreateOrUpdatePatient = jest.fn();
const mockEnsureEmergencyPatient = jest.fn();
const mockCreateEmergencyCase = jest.fn();
const mockGeocodeLocation = jest.fn();

jest.mock('../../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient,
  ensureEmergencyPatient: mockEnsureEmergencyPatient
}));

jest.mock('../../src/services/emergency.service', () => ({
  createEmergencyCase: mockCreateEmergencyCase,
  getPatientLocation: jest.fn().mockResolvedValue(null),
  findSuitableHealthCenter: jest.fn().mockResolvedValue({ healthCenter: null, facility: null }),
  acknowledgeEmergency: jest.fn(),
  escalateEmergency: jest.fn(),
  resolveEmergency: jest.fn(),
  getEmergencyCase: jest.fn(),
  getActiveEmergencies: jest.fn()
}));

jest.mock('../../src/services/geocoding.service', () => ({
  geocodeLocation: mockGeocodeLocation
}));

jest.mock('../../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        channel: 'WHATSAPP',
        state: 'START',
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

    static async deleteOne(query) {
      mockConversations.delete(`${query.phone}:${query.channel}`);
    }
  }

  return MockConversation;
});

process.env.NODE_ENV = 'test';
const { app } = require('../../src/app');

describe('local WhatsApp simulator', () => {
  beforeEach(() => {
    mockConversations.clear();
    mockCreateOrUpdatePatient.mockResolvedValue({ phone: '+919876543210' });
    mockEnsureEmergencyPatient.mockResolvedValue({ phone: '+919876543210' });
    mockGeocodeLocation.mockResolvedValue({
      latitude: 17.4483,
      longitude: 78.3915,
      displayName: 'Miyapur, Hyderabad'
    });
    mockCreateEmergencyCase.mockResolvedValue({
      emergency: { caseId: 'EMG-TEST-1' },
      selectedFacility: null
    });
  });

  test('processes the full flow and uses the existing patient service', async () => {
    const flow = [
      ['Hi', 'SIM1'], ['3', 'SIM2'], ['Ravi Kumar', 'SIM3'], ['52', 'SIM4'],
      ['1', 'SIM5'], ['Village A', 'SIM6'], ['I have fever for three days.', 'SIM7']
    ];

    let response;
    for (const [message, messageId] of flow) {
      response = await request(app).post('/api/test/whatsapp').send({
        phone: '+919876543210', message, messageId
      });
      expect(response.status).toBe(200);
    }

    expect(response.body.state).toBe('COMPLETED');
    expect(response.body.reply).toContain('successfully collected');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+919876543210', name: 'Ravi Kumar', age: 52, gender: 'male',
      village: 'Village A', language: 'en', symptomsDescription: 'I have fever for three days.'
    }));
  });

  test('rejects invalid input without advancing and handles duplicate ids', async () => {
    await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: 'Hi', messageId: 'SIM1' });
    await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: '9', messageId: 'SIM2' });
    const duplicate = await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: '9', messageId: 'SIM2' });

    expect(duplicate.body).toMatchObject({ state: 'SELECT_LANGUAGE', duplicate: true, reply: null });
  });

  test('persists state across requests and reset removes only the conversation', async () => {
    await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: 'Hi', messageId: 'SIM1' });
    await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: '3', messageId: 'SIM2' });
    const continued = await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: 'Ravi Kumar', messageId: 'SIM3' });
    expect(continued.body.state).toBe('COLLECT_AGE');

    const reset = await request(app).post('/api/test/whatsapp/reset').send({ phone: '+919876543210' });
    expect(reset.body.success).toBe(true);
    const restarted = await request(app).post('/api/test/whatsapp').send({ phone: '+919876543210', message: 'Hi', messageId: 'SIM4' });
    expect(restarted.body.state).toBe('SELECT_LANGUAGE');
  });

  test('confirms a WhatsApp emergency location and creates the emergency case', async () => {
    const flow = [
      ['Hi', 'EMG1'], ['5', 'EMG2'], ['miyapur', 'EMG3'], ['1', 'EMG4']
    ];

    let response;
    for (const [message, messageId] of flow) {
      response = await request(app).post('/api/test/whatsapp').send({
        phone: '+919876543210', message, messageId
      });
      expect(response.status).toBe(200);
    }

    expect(response.body).toMatchObject({
      success: true,
      state: 'COMPLETED'
    });
    expect(mockEnsureEmergencyPatient).toHaveBeenCalledWith('+919876543210', 'WHATSAPP');
    expect(mockCreateEmergencyCase).toHaveBeenCalledWith({
      phone: '+919876543210',
      source: 'WHATSAPP',
      reason: 'Emergency request via WHATSAPP',
      location: { latitude: 17.4483, longitude: 78.3915 },
      locationLabel: 'Miyapur, Hyderabad',
      status: 'ALERTED'
    });
  });
});
