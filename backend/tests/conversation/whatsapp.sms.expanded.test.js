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
    { caseId: 'CASE-TEST-1', status: 'ASSIGNED', complaint: 'Joint pain' }
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
      const key = `${this.phone}:${this.channel}`;
      mockConversations.set(key, this);
      return this;
    }

    static async findOne(query) {
      return mockConversations.get(`${query.phone}:${query.channel}`) || null;
    }

    static async deleteMany(query) {
      for (const [key, conv] of mockConversations) {
        if (!query.phone || conv.phone === query.phone) {
          mockConversations.delete(key);
        }
      }
    }
  }

  return MockConversation;
});

const { processMessage } = require('../../src/services/conversation.service');
const { CONVERSATION_STATES } = require('../../src/constants/conversationStates');

describe('Expanded WhatsApp & SMS Registration Flows', () => {
  const phone = '+919876543210';

  beforeEach(() => {
    mockConversations.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockFindByPhone.mockReset();
    mockCreateCase.mockReset();
    mockCreateEmergencyCase.mockReset();
    mockGetPatientLocation.mockReset();
    mockEnsureEmergencyPatient.mockReset();

    mockCreateOrUpdatePatient.mockResolvedValue({
      _id: 'PATIENT-001',
      phone,
      name: 'Steve',
      location: { village: 'Habsiguda' }
    });

    mockCreateCase.mockResolvedValue({
      case: { caseId: 'CASE-2026-XYZ', status: 'ASSIGNED' },
      selectedFacility: { healthCenterId: 'HC-005', name: 'Habsiguda PHC' }
    });
  });

  describe('Full WhatsApp Registration Flow for New Patient', () => {
    test('progresses through Language -> Demographics -> Complaint -> Duration -> Severity -> Emergency Screening -> Document Skip -> Confirmation -> Completion', async () => {
      // 1. Initial HI
      const res1 = await processMessage({ channel: 'WHATSAPP', phone, message: 'HI', messageId: 'WA-1' });
      expect(res1.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);

      // 2. Select English
      const res2 = await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'WA-2' });
      expect(res2.conversation.state).toBe(CONVERSATION_STATES.COLLECT_NAME);

      // 3. Name
      const res3 = await processMessage({ channel: 'WHATSAPP', phone, message: 'Steve', messageId: 'WA-3' });
      expect(res3.conversation.state).toBe(CONVERSATION_STATES.COLLECT_AGE);

      // 4. Age
      const res4 = await processMessage({ channel: 'WHATSAPP', phone, message: '19', messageId: 'WA-4' });
      expect(res4.conversation.state).toBe(CONVERSATION_STATES.COLLECT_GENDER);

      // 5. Gender
      const res5 = await processMessage({ channel: 'WHATSAPP', phone, message: '1', messageId: 'WA-5' });
      expect(res5.conversation.state).toBe(CONVERSATION_STATES.COLLECT_LOCATION);

      // 6. Location
      const res6 = await processMessage({ channel: 'WHATSAPP', phone, message: 'Habsiguda', messageId: 'WA-6' });
      expect(res6.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SYMPTOMS);

      // 7. Complaint (free text)
      const res7 = await processMessage({ channel: 'WHATSAPP', phone, message: 'Leg joint pain', messageId: 'WA-7' });
      expect(res7.conversation.state).toBe(CONVERSATION_STATES.COLLECT_DURATION);
      expect(res7.response).toContain('How long have you had this problem?');

      // 8. Duration (Option 2: 1 to 3 days)
      const res8 = await processMessage({ channel: 'WHATSAPP', phone, message: '2', messageId: 'WA-8' });
      expect(res8.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SEVERITY);
      expect(res8.conversation.data.duration).toBe('1 to 3 days');
      expect(res8.response).toContain('How severe is your problem?');

      // 9. Severity (Option 2: Moderate)
      const res9 = await processMessage({ channel: 'WHATSAPP', phone, message: '2', messageId: 'WA-9' });
      expect(res9.conversation.state).toBe(CONVERSATION_STATES.EMERGENCY_SCREENING);
      expect(res9.conversation.data.severity).toBe('Moderate');
      expect(res9.response).toContain('emergency symptoms?');

      // 10. Emergency Screening (Option 5: None of these)
      const res10 = await processMessage({ channel: 'WHATSAPP', phone, message: '5', messageId: 'WA-10' });
      expect(res10.conversation.state).toBe(CONVERSATION_STATES.OPTIONAL_DOCUMENT);
      expect(res10.response).toContain('medical report or prescription?');

      // 11. Document Step (Option 2: Skip)
      const res11 = await processMessage({ channel: 'WHATSAPP', phone, message: '2', messageId: 'WA-11' });
      expect(res11.conversation.state).toBe(CONVERSATION_STATES.CONFIRM);
      expect(res11.response).toContain('Steve');
      expect(res11.response).toContain('Habsiguda');
      expect(res11.response).toContain('Leg joint pain');
      expect(res11.response).toContain('1 to 3 days');
      expect(res11.response).toContain('Moderate');

      // 12. Confirm (Option 1)
      const res12 = await processMessage({ channel: 'WHATSAPP', phone, message: '1', messageId: 'WA-12' });
      expect(res12.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(res12.response).toContain('CASE-2026-XYZ');
      expect(res12.response).toContain('Habsiguda PHC');

      // Verify createCase was called with full complaint
      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        source: 'WHATSAPP',
        complaint: 'Leg joint pain (Duration: 1 to 3 days) [Severity: Moderate]'
      }));
    });

    test('supports free text for duration (e.g. "leg joint pain since 3 days")', async () => {
      await processMessage({ channel: 'WHATSAPP', phone, message: 'HI', messageId: 'FT-1' });
      await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'FT-2' });
      await processMessage({ channel: 'WHATSAPP', phone, message: 'Raju', messageId: 'FT-3' });
      await processMessage({ channel: 'WHATSAPP', phone, message: '25', messageId: 'FT-4' });
      await processMessage({ channel: 'WHATSAPP', phone, message: '1', messageId: 'FT-5' });
      await processMessage({ channel: 'WHATSAPP', phone, message: 'Kukatpally', messageId: 'FT-6' });
      await processMessage({ channel: 'WHATSAPP', phone, message: 'Knee swelling', messageId: 'FT-7' });

      // User enters free text duration
      const res = await processMessage({ channel: 'WHATSAPP', phone, message: 'since last Tuesday', messageId: 'FT-8' });
      expect(res.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SEVERITY);
      expect(res.conversation.data.duration).toBe('since last Tuesday');
    });
  });

  describe('Existing Patient Progression', () => {
    test('detects existing patient, reuses demographics, and collects only complaint & triage', async () => {
      mockFindByPhone.mockResolvedValueOnce({
        _id: 'PAT-EXISTING',
        name: 'Sunita Sharma',
        age: 40,
        gender: 'female',
        location: { village: 'Miyapur' }
      });

      await processMessage({ channel: 'WHATSAPP', phone, message: 'Hi', messageId: 'EX-1' });
      const langRes = await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'EX-2' });

      // Demographics skipped directly to COLLECT_SYMPTOMS
      expect(langRes.conversation.state).toBe(CONVERSATION_STATES.COLLECT_SYMPTOMS);
      expect(langRes.response).toContain('Welcome back, Sunita Sharma!');

      // Complaint
      const compRes = await processMessage({ channel: 'WHATSAPP', phone, message: 'Severe migraine', messageId: 'EX-3' });
      expect(compRes.conversation.state).toBe(CONVERSATION_STATES.COLLECT_DURATION);

      // Duration
      await processMessage({ channel: 'WHATSAPP', phone, message: '1', messageId: 'EX-4' });
      // Severity
      await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'EX-5' });
      // Emergency Screening (None)
      await processMessage({ channel: 'WHATSAPP', phone, message: '5', messageId: 'EX-6' });
      // Skip document
      const confirmRes = await processMessage({ channel: 'WHATSAPP', phone, message: '2', messageId: 'EX-7' });

      expect(confirmRes.conversation.state).toBe(CONVERSATION_STATES.CONFIRM);
      expect(confirmRes.response).toContain('Sunita Sharma');
      expect(confirmRes.response).toContain('Miyapur');
      expect(confirmRes.response).toContain('Severe migraine');
    });
  });

  describe('Emergency Screening Red-Flag Detection', () => {
    test('triggers emergency workflow immediately when red-flag symptom is selected', async () => {
      mockGetPatientLocation.mockResolvedValueOnce({ latitude: 17.45, longitude: 78.38 });
      mockCreateEmergencyCase.mockResolvedValueOnce({
        emergency: { caseId: 'EMG-CRITICAL-1' },
        selectedFacility: { healthCenterId: 'HC-001', name: 'District Hospital' }
      });

      // Advance to EMERGENCY_SCREENING
      const conv = new (require('../../src/models/Conversation'))({
        phone,
        channel: 'WHATSAPP',
        state: CONVERSATION_STATES.EMERGENCY_SCREENING,
        language: 'en',
        data: {
          name: 'Patient X',
          symptomsDescription: 'Chest discomfort',
          duration: '1 day',
          severity: 'Severe'
        }
      });
      await conv.save();

      // User selects Option 1 (Severe chest pain)
      const res = await processMessage({ channel: 'WHATSAPP', phone, message: '1', messageId: 'EMG-1' });

      expect(res.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
        phone,
        source: 'WHATSAPP',
        status: 'ALERTED'
      }));
      // Normal case was NOT created
      expect(mockCreateCase).not.toHaveBeenCalled();
    });
  });

  describe('Field-Level Editing (WhatsApp & SMS)', () => {
    test('allows editing location and returning to updated confirmation summary without restarting', async () => {
      const conv = new (require('../../src/models/Conversation'))({
        phone,
        channel: 'SMS',
        state: CONVERSATION_STATES.CONFIRM,
        language: 'en',
        data: {
          name: 'Steve',
          age: 19,
          gender: 'male',
          village: 'Habsiguda',
          symptomsDescription: 'Leg joint pain',
          duration: '3 days',
          severity: 'Moderate'
        }
      });
      await conv.save();

      // 1. User selects Edit (Option 2)
      const editMenu = await processMessage({ channel: 'SMS', phone, message: '2', messageId: 'ED-1' });
      expect(editMenu.conversation.state).toBe(CONVERSATION_STATES.EDIT_SELECTION);
      expect(editMenu.response).toContain('1 - Name');
      expect(editMenu.response).toContain('4 - Location');

      // 2. Select Location (Option 4)
      const locPrompt = await processMessage({ channel: 'SMS', phone, message: '4', messageId: 'ED-2' });
      expect(locPrompt.conversation.state).toBe(CONVERSATION_STATES.EDIT_VALUE);
      expect(locPrompt.conversation.data.pendingField).toBe('village');
      expect(locPrompt.response).toContain('village or location');

      // 3. Provide new location
      const updatedSummary = await processMessage({ channel: 'SMS', phone, message: 'Kukatpally', messageId: 'ED-3' });
      expect(updatedSummary.conversation.state).toBe(CONVERSATION_STATES.CONFIRM);
      expect(updatedSummary.conversation.data.village).toBe('Kukatpally');
      expect(updatedSummary.conversation.data.name).toBe('Steve'); // preserved
      expect(updatedSummary.response).toContain('Location updated.');
      expect(updatedSummary.response).toContain('Kukatpally');

      // 4. Now confirm (Option 1)
      const finish = await processMessage({ channel: 'SMS', phone, message: '1', messageId: 'ED-4' });
      expect(finish.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
        village: 'Kukatpally',
        name: 'Steve'
      }));
    });

    test('validates age during edit and stays in EDIT_VALUE upon invalid input', async () => {
      const conv = new (require('../../src/models/Conversation'))({
        phone,
        channel: 'WHATSAPP',
        state: CONVERSATION_STATES.EDIT_VALUE,
        language: 'en',
        data: {
          name: 'Pooja',
          pendingField: 'age'
        }
      });
      await conv.save();

      // User enters invalid age
      const resInvalid = await processMessage({ channel: 'WHATSAPP', phone, message: '300', messageId: 'INV-1' });
      expect(resInvalid.conversation.state).toBe(CONVERSATION_STATES.EDIT_VALUE);
      expect(resInvalid.response).toContain('1 and 120');

      // User enters valid age
      const resValid = await processMessage({ channel: 'WHATSAPP', phone, message: '28', messageId: 'VAL-1' });
      expect(resValid.conversation.state).toBe(CONVERSATION_STATES.CONFIRM);
      expect(resValid.conversation.data.age).toBe(28);
    });
  });

  describe('Cancellation and Restart', () => {
    test('CANCEL or RESET resets incomplete conversation without creating stray records', async () => {
      await processMessage({ channel: 'WHATSAPP', phone, message: 'HI', messageId: 'RST-1' });
      await processMessage({ channel: 'WHATSAPP', phone, message: '3', messageId: 'RST-2' });
      await processMessage({ channel: 'WHATSAPP', phone, message: 'Deepak', messageId: 'RST-3' });

      // Send RESET
      const resetRes = await processMessage({ channel: 'WHATSAPP', phone, message: 'RESET', messageId: 'RST-4' });
      expect(resetRes.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
      expect(resetRes.conversation.data).toEqual({});
      expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
      expect(mockCreateCase).not.toHaveBeenCalled();
    });

    test('selecting option 3 in CONFIRM restarts conversation safely', async () => {
      const conv = new (require('../../src/models/Conversation'))({
        phone,
        channel: 'SMS',
        state: CONVERSATION_STATES.CONFIRM,
        language: 'en',
        data: { name: 'Deepak', symptomsDescription: 'Back pain' }
      });
      await conv.save();

      const restartRes = await processMessage({ channel: 'SMS', phone, message: '3', messageId: 'CONF-RST' });
      expect(restartRes.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
      expect(restartRes.conversation.data).toEqual({});
      expect(mockCreateCase).not.toHaveBeenCalled();
    });
  });

  describe('SMS Full Flow', () => {
    test('SMS completes complaint, duration, severity, screening, and confirmation without document step', async () => {
      await processMessage({ channel: 'SMS', phone, message: 'HI', messageId: 'S-1' });
      await processMessage({ channel: 'SMS', phone, message: '3', messageId: 'S-2' });
      await processMessage({ channel: 'SMS', phone, message: 'Mohan', messageId: 'S-3' });
      await processMessage({ channel: 'SMS', phone, message: '35', messageId: 'S-4' });
      await processMessage({ channel: 'SMS', phone, message: '1', messageId: 'S-5' });
      await processMessage({ channel: 'SMS', phone, message: 'Bachupally', messageId: 'S-6' });
      await processMessage({ channel: 'SMS', phone, message: 'High fever', messageId: 'S-7' });
      await processMessage({ channel: 'SMS', phone, message: '2', messageId: 'S-8' }); // 1 to 3 days
      await processMessage({ channel: 'SMS', phone, message: '2', messageId: 'S-9' }); // Moderate

      // Emergency screening option 5 goes directly to CONFIRM (no document step on SMS)
      const screenRes = await processMessage({ channel: 'SMS', phone, message: '5', messageId: 'S-10' });
      expect(screenRes.conversation.state).toBe(CONVERSATION_STATES.CONFIRM);
      expect(screenRes.response).toContain('Mohan');
      expect(screenRes.response).toContain('High fever');

      // Confirm
      const confirmRes = await processMessage({ channel: 'SMS', phone, message: '1', messageId: 'S-11' });
      expect(confirmRes.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        source: 'SMS',
        complaint: 'High fever (Duration: 1 to 3 days) [Severity: Moderate]'
      }));
    });
  });
});
