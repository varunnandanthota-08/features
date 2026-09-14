const mockConversations = new Map();
const mockCreateOrUpdatePatient = jest.fn();
const mockFindByPhone = jest.fn();
const mockCreateCase = jest.fn();
const mockCreateEmergencyCase = jest.fn();
const mockGetPatientLocation = jest.fn();
const mockEnsureEmergencyPatient = jest.fn();

jest.mock('../../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient,
  findByPhone: mockFindByPhone,
  ensureEmergencyPatient: mockEnsureEmergencyPatient,
  normalizePhone: phone => String(phone).replace(/^whatsapp:/, '').trim()
}));

jest.mock('../../src/services/case.service', () => ({
  createCase: mockCreateCase,
  getPatientCases: jest.fn().mockResolvedValue([
    { caseId: 'CASE-TEST-1', status: 'ASSIGNED', complaint: 'Fever and headache' }
  ])
}));

jest.mock('../../src/services/emergency.service', () => ({
  createEmergencyCase: mockCreateEmergencyCase,
  getPatientLocation: mockGetPatientLocation
}));

jest.mock('../../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        callSid: null,
        channel: 'WHATSAPP',
        state: 'START',
        language: null,
        data: {},
        processedMessageIds: [],
        ...data
      });
    }

    async save() {
      const key = this.callSid ? `${this.callSid}:${this.channel}` : `${this.phone}:${this.channel}`;
      mockConversations.set(key, this);
      return this;
    }

    static async findOne(query) {
      if (query.callSid) return mockConversations.get(`${query.callSid}:${query.channel}`) || null;
      return mockConversations.get(`${query.phone}:${query.channel}`) || null;
    }

    static async deleteMany(query) {
      for (const [key, conv] of mockConversations) {
        if (conv.phone === query.phone || conv.callSid === query.callSid) {
          mockConversations.delete(key);
        }
      }
    }
  }

  return MockConversation;
});

const { processMessage } = require('../../src/services/conversation.service');
const { CONVERSATION_STATES } = require('../../src/constants/conversationStates');
const ivrService = require('../../src/services/ivr.service');
const { finalizeRegistrationAndCase, checkExistingPatient } = require('../../src/services/registration.service');

describe('CareOS Multi-Channel Communication & Registration Flows', () => {
  const phone = '+919876500001';

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = 'https://example.ngrok.test';
    mockConversations.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockFindByPhone.mockReset();
    mockCreateCase.mockReset();
    mockCreateEmergencyCase.mockReset();
    mockGetPatientLocation.mockReset();
    mockEnsureEmergencyPatient.mockReset();

    mockCreateOrUpdatePatient.mockResolvedValue({
      _id: 'PATIENT-OBJ-ID-1',
      phone,
      name: 'Ramesh Patel',
      location: { village: 'Bachupally' }
    });

    mockCreateCase.mockResolvedValue({
      case: { caseId: 'CASE-001', status: 'ASSIGNED' },
      selectedFacility: { healthCenterId: 'HC-003', name: 'Bachupally PHC' }
    });
  });

  describe('Existing Patient Detection', () => {
    test('WhatsApp skips name, age, gender, and location for existing patients', async () => {
      mockFindByPhone.mockResolvedValueOnce({
        _id: 'PATIENT-EXISTING-1',
        phone,
        name: 'Ramesh Patel',
        age: 45,
        gender: 'male',
        location: { village: 'Bachupally' },
        language: 'en'
      });

      // 1. Initial greeting
      const init = await processMessage({ channel: 'WHATSAPP', phone, message: 'Hi', messageId: 'WA-1' });
      expect(init.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);

      // 2. Select English -> existing patient detected -> directly to symptoms!
      const lang = await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'WA-2' });
      expect(lang.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SYMPTOMS);
      expect(lang.response).toContain('Welcome back, Ramesh Patel!');
      expect(lang.conversation.data.name).toBe('Ramesh Patel');
      expect(lang.conversation.data.village).toBe('Bachupally');
    });

    test('SMS skips demographics for existing patient and moves to complaint collection', async () => {
      mockFindByPhone.mockResolvedValueOnce({
        _id: 'PATIENT-EXISTING-2',
        phone,
        name: 'Sita Devi',
        age: 38,
        gender: 'female',
        location: { village: 'Kukatpally' },
        language: 'hi'
      });

      await processMessage({ channel: 'SMS', phone, message: 'HI', messageId: 'SMS-1' });
      const lang = await processMessage({ channel: 'SMS', phone, message: '2', messageId: 'SMS-2' });

      expect(lang.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SYMPTOMS);
      expect(lang.conversation.data.isExistingPatient).toBe(true);
      expect(lang.conversation.data.name).toBe('Sita Devi');
    });

    test('IVR skips demographics for existing patient and moves directly to IVR_COLLECT_SYMPTOMS', async () => {
      mockFindByPhone.mockResolvedValueOnce({
        _id: 'PATIENT-EXISTING-3',
        phone,
        name: 'Anil Kumar',
        age: 50,
        gender: 'male',
        location: { village: 'Nalgonda' }
      });

      const { session, callSid } = await ivrService.startTestSession(phone);
      expect(session.state).toBe(CONVERSATION_STATES.IVR_LANGUAGE_SELECTION);

      const langResult = await ivrService.processTestInput({
        phone,
        callSid,
        value: '3',
        eventId: 'IVR-EV-1'
      });

      expect(langResult.state).toBe(CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS);
      expect(langResult.session.data.name).toBe('Anil Kumar');
    });
  });

  describe('SMS Commands & State Resumption', () => {
    test('SMS HELP command returns available commands', async () => {
      const result = await processMessage({ channel: 'SMS', phone, message: 'HELP', messageId: 'SMS-HELP' });
      expect(result.response).toContain('CareOS SMS Help');
      expect(result.response).toContain('EMERGENCY');
    });

    test('SMS STATUS command returns active cases', async () => {
      mockFindByPhone.mockResolvedValueOnce({ _id: 'PAT-1', phone });
      const result = await processMessage({ channel: 'SMS', phone, message: 'STATUS', messageId: 'SMS-STATUS' });
      expect(result.response).toContain('CASE-TEST-1');
      expect(result.response).toContain('ASSIGNED');
    });

    test('SMS RESET/CANCEL clears conversation state', async () => {
      await processMessage({ channel: 'SMS', phone, message: 'HI', messageId: 'S1' });
      await processMessage({ channel: 'SMS', phone, message: '3', messageId: 'S2' });
      const reset = await processMessage({ channel: 'SMS', phone, message: 'RESET', messageId: 'S3' });

      expect(reset.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
      expect(reset.response).toContain('cancelled');
    });

    test('SMS EMERGENCY command triggers immediate emergency workflow', async () => {
      mockGetPatientLocation.mockResolvedValueOnce({ latitude: 17.5, longitude: 78.3 });
      mockCreateEmergencyCase.mockResolvedValueOnce({
        emergency: { caseId: 'EMG-001' },
        selectedFacility: { healthCenterId: 'HC-001', name: 'CHC Community' }
      });

      const result = await processMessage({ channel: 'SMS', phone, message: 'EMERGENCY', messageId: 'SOS-1' });
      expect(result.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
        phone,
        source: 'SMS',
        status: 'ALERTED'
      }));
    });
  });

  describe('Shared Finalization & Confirmation', () => {
    test('Creates patient and case through shared finalization with correct source channels', async () => {
      const result = await finalizeRegistrationAndCase({
        phone,
        channel: 'WHATSAPP',
        language: 'en',
        data: {
          name: 'Venkatesh',
          age: 32,
          gender: 'male',
          village: 'Bachupally',
          symptomsDescription: 'Severe cough',
          duration: '4 days'
        }
      });

      expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Venkatesh',
        village: 'Bachupally'
      }));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        source: 'WHATSAPP',
        complaint: 'Severe cough (Duration: 4 days)'
      }));

      expect(result.case.caseId).toBe('CASE-001');
    });

    test('IVR confirmation creates Case with source PHONE_IVR and completed state', async () => {
      const result = await finalizeRegistrationAndCase({
        phone,
        channel: 'PHONE_IVR',
        language: 'te',
        data: {
          name: 'Lakshmi',
          age: 28,
          gender: 'female',
          village: 'Miyapur',
          symptomsDescription: 'Stomach pain'
        }
      });

      expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
        source: 'IVR',
        name: 'Lakshmi'
      }));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        source: 'PHONE_IVR',
        complaint: 'Stomach pain'
      }));
    });

    test('WhatsApp CONFIRM state finalize and restart options', async () => {
      // In CONFIRM state on WhatsApp:
      const conv = new (require('../../src/models/Conversation'))({
        phone,
        channel: 'WHATSAPP',
        state: CONVERSATION_STATES.CONFIRM,
        language: 'en',
        data: {
          name: 'Pooja',
          age: 26,
          gender: 'female',
          village: 'Kukatpally',
          symptomsDescription: 'Migraine'
        }
      });
      await conv.save();

      // Replying '1' confirms and finalizes
      const confirmRes = await processMessage({
        channel: 'WHATSAPP',
        phone,
        message: '1',
        messageId: 'CONFIRM-1'
      });

      expect(confirmRes.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        source: 'WHATSAPP',
        complaint: 'Migraine'
      }));
    });
  });
});
