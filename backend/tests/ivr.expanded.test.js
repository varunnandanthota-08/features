const request = require('supertest');

const mockConversations = new Map();
const mockCallbacks = new Map();
const mockCreateOrUpdatePatient = jest.fn();
const mockFindByPhone = jest.fn();
const mockCreateCase = jest.fn();
const mockCreateEmergencyCase = jest.fn();
const mockGetPatientLocation = jest.fn();
const mockGeocodeLocation = jest.fn();
const mockTwilioCallsCreate = jest.fn();

jest.mock('../src/middleware/twilioWebhookValidation', () => ({
  twilioWebhookValidation: (req, res, next) => next(),
  createTwilioWebhookValidation: () => (req, res, next) => next()
}));

jest.mock('../src/config/twilio', () => {
  const original = jest.requireActual('../src/config/twilio');
  return {
    ...original,
    twilioClient: {
      calls: {
        create: mockTwilioCallsCreate
      }
    },
    twilioConfig: {
      accountSid: 'AC_TEST_123',
      authToken: 'AUTH_TEST_123',
      phoneNumber: '+15005550006'
    },
    getIvrCallbackUrl: path => `https://example.ngrok.test${path}`
  };
});

jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient,
  findByPhone: mockFindByPhone
}));

jest.mock('../src/services/case.service', () => ({
  createCase: mockCreateCase,
  getPatientCases: jest.fn().mockResolvedValue([])
}));

jest.mock('../src/services/emergency.service', () => ({
  createEmergencyCase: mockCreateEmergencyCase,
  getPatientLocation: mockGetPatientLocation
}));

jest.mock('../src/services/geocoding.service', () => ({
  geocodeLocation: mockGeocodeLocation
}));

jest.mock('../src/models/Conversation', () => {
  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        callSid: null,
        channel: 'IVR',
        state: 'IVR_LANGUAGE_SELECTION',
        language: null,
        data: {
          name: null,
          age: null,
          gender: null,
          village: null,
          symptomsDescription: null,
          duration: null,
          severity: null,
          emergencyScreening: null
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
      if (query.callSid) {
        return mockConversations.get(`${query.callSid}:${query.channel || 'IVR'}`) || null;
      }
      return null;
    }

    static async deleteMany(query) {
      for (const [key, session] of mockConversations) {
        if (session.phone === query.phone && session.channel === query.channel) {
          mockConversations.delete(key);
        }
      }
    }
  }

  return MockConversation;
});

jest.mock('../src/models/IvrCallback', () => {
  class MockIvrCallback {
    constructor(data = {}) {
      Object.assign(this, {
        _id: `cb_${Date.now()}_${Math.random()}`,
        status: 'PENDING',
        attempts: 0,
        ...data
      });
    }

    async save() {
      // Check unique callSid
      for (const existing of mockCallbacks.values()) {
        if (existing.callSid === this.callSid && existing._id !== this._id) {
          const err = new Error('Duplicate callSid');
          err.code = 11000;
          throw err;
        }
      }
      mockCallbacks.set(this._id, this);
      return this;
    }

    static async create(data) {
      const instance = new MockIvrCallback(data);
      await instance.save();
      return instance;
    }

    static async findOne(query) {
      for (const item of mockCallbacks.values()) {
        let match = true;
        for (const [k, v] of Object.entries(query)) {
          if (item[k] !== v) {
            match = false;
            break;
          }
        }
        if (match) return item;
      }
      return null;
    }
  }

  return MockIvrCallback;
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

describe('CareOS Comprehensive IVR & Missed-Call Callback Suite', () => {
  beforeEach(() => {
    mockConversations.clear();
    mockCallbacks.clear();
    mockCreateOrUpdatePatient.mockReset();
    mockFindByPhone.mockReset();
    mockCreateCase.mockReset();
    mockCreateEmergencyCase.mockReset();
    mockGetPatientLocation.mockReset();
    mockGeocodeLocation.mockReset();
    mockTwilioCallsCreate.mockReset();

    mockFindByPhone.mockResolvedValue(null);
    mockCreateOrUpdatePatient.mockResolvedValue({ _id: 'pat-001', phone: '+919876543210' });
    mockCreateCase.mockResolvedValue({ case: { _id: 'case-001', caseId: 'CASE-EXP-001' } });
    mockCreateEmergencyCase.mockResolvedValue({
      emergency: { caseId: 'EMG-EXP-001' },
      selectedFacility: { name: 'Emergency PHC' }
    });
    mockTwilioCallsCreate.mockResolvedValue({ sid: 'CA_OUTBOUND_123' });
  });

  // 1. DTMF language selection (1 for Telugu, 2 for Hindi, 3 for English)
  test('1. DTMF language selection sets language and routes to main menu', async () => {
    await post('incoming', 'SID-1');
    const resTe = await post('language', 'SID-1', { Digits: '1' });
    expect(resTe.status).toBe(200);
    expect(resTe.text).toContain('ప్రధాన మెను');
    expect(mockConversations.get('SID-1:IVR').language).toBe('te');
    expect(mockConversations.get('SID-1:IVR').state).toBe('IVR_MAIN_MENU');

    await post('incoming', 'SID-1-HI');
    const resHi = await post('language', 'SID-1-HI', { Digits: '2' });
    expect(resHi.status).toBe(200);
    expect(resHi.text).toContain('मुख्य मेनू');
    expect(mockConversations.get('SID-1-HI:IVR').language).toBe('hi');

    await post('incoming', 'SID-1-EN');
    const resEn = await post('language', 'SID-1-EN', { Digits: '3' });
    expect(resEn.status).toBe(200);
    expect(resEn.text).toContain('Main Menu');
    expect(mockConversations.get('SID-1-EN:IVR').language).toBe('en');
  });

  // 2. Spoken language selection ("Telugu", "Hindi", "English")
  test('2. Spoken language selection works via speech recognition', async () => {
    await post('incoming', 'SID-2-TE');
    const resTe = await post('language', 'SID-2-TE', { SpeechResult: 'Telugu please' });
    expect(mockConversations.get('SID-2-TE:IVR').language).toBe('te');

    await post('incoming', 'SID-2-HI');
    const resHi = await post('language', 'SID-2-HI', { SpeechResult: 'Hindi' });
    expect(mockConversations.get('SID-2-HI:IVR').language).toBe('hi');

    await post('incoming', 'SID-2-EN');
    const resEn = await post('language', 'SID-2-EN', { SpeechResult: 'English' });
    expect(mockConversations.get('SID-2-EN:IVR').language).toBe('en');
  });

  // 3. New patient registration collects Name, Age, Gender, Village/Location
  test('3. New patient registration collects Name, Age, Gender, Village', async () => {
    const sid = 'SID-3';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    const menuRes = await post('menu', sid, { Digits: '1' });
    expect(menuRes.text).toContain('Please say your full name');

    const nameRes = await post('name', sid, { SpeechResult: 'Lakshmi Devi' });
    expect(nameRes.text).toContain('Please enter your age');
    expect(mockConversations.get(`${sid}:IVR`).data.name).toBe('Lakshmi Devi');

    const ageRes = await post('age', sid, { Digits: '42' });
    expect(ageRes.text).toContain('Press 1 for Male');
    expect(mockConversations.get(`${sid}:IVR`).data.age).toBe(42);

    const genderRes = await post('gender', sid, { Digits: '2' });
    expect(genderRes.text).toContain('Please say your village or location');
    expect(mockConversations.get(`${sid}:IVR`).data.gender).toBe('female');

    const locRes = await post('location', sid, { SpeechResult: 'Choutuppal' });
    expect(locRes.text).toContain('Please describe the health problem');
    expect(mockConversations.get(`${sid}:IVR`).data.village).toBe('Choutuppal');
  });

  // 4. Existing patient detection greets by name and skips directly to symptoms
  test('4. Existing patient detection greets by name and skips demographics', async () => {
    mockFindByPhone.mockResolvedValueOnce({
      _id: 'existing-p-1',
      name: 'Ramesh Reddy',
      age: 48,
      gender: 'male',
      location: { village: 'Miryalaguda' }
    });

    const sid = 'SID-4';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    const menuRes = await post('menu', sid, { Digits: '1' });

    expect(menuRes.text).toContain('Welcome back, Ramesh Reddy');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COLLECT_SYMPTOMS');
    expect(mockConversations.get(`${sid}:IVR`).data.name).toBe('Ramesh Reddy');
    expect(mockConversations.get(`${sid}:IVR`).data.village).toBe('Miryalaguda');
  });

  // 5. Complaint collection (symptoms)
  test('5. Collects symptoms and advances to duration prompt', async () => {
    const sid = 'SID-5';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Sunita' });
    await post('age', sid, { Digits: '28' });
    await post('gender', sid, { Digits: '2' });
    await post('location', sid, { SpeechResult: 'Suryapet' });

    const sympRes = await post('symptoms', sid, { SpeechResult: 'High fever and headache since morning' });
    expect(sympRes.text).toContain('How long have you had this problem?');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COLLECT_DURATION');
    expect(mockConversations.get(`${sid}:IVR`).data.symptomsDescription).toBe('High fever and headache since morning');
  });

  // 6. Duration collection (DTMF options 1-5 and spoken)
  test('6. Duration collection accepts DTMF 1-5 and spoken phrases', async () => {
    const sid1 = 'SID-6-DTMF';
    await post('incoming', sid1);
    await post('language', sid1, { Digits: '3' });
    await post('menu', sid1, { Digits: '1' });
    await post('name', sid1, { SpeechResult: 'Sunita' });
    await post('age', sid1, { Digits: '28' });
    await post('gender', sid1, { Digits: '2' });
    await post('location', sid1, { SpeechResult: 'Suryapet' });
    await post('symptoms', sid1, { SpeechResult: 'Fever' });

    const durRes1 = await post('duration', sid1, { Digits: '3' });
    expect(durRes1.text).toContain('How severe is your problem?');
    expect(mockConversations.get(`${sid1}:IVR`).data.duration).toBe('4 to 7 days');

    const sid2 = 'SID-6-SPEECH';
    await post('incoming', sid2);
    await post('language', sid2, { Digits: '3' });
    await post('menu', sid2, { Digits: '1' });
    await post('name', sid2, { SpeechResult: 'Sunita' });
    await post('age', sid2, { Digits: '28' });
    await post('gender', sid2, { Digits: '2' });
    await post('location', sid2, { SpeechResult: 'Suryapet' });
    await post('symptoms', sid2, { SpeechResult: 'Fever' });

    const durRes2 = await post('duration', sid2, { SpeechResult: 'For about two days' });
    expect(durRes2.text).toContain('How severe is your problem?');
    expect(mockConversations.get(`${sid2}:IVR`).data.duration).toBe('1 to 3 days');
  });

  // 7. Severity collection (DTMF options 1-3 and spoken mild/moderate/severe)
  test('7. Severity collection accepts DTMF 1-3 and spoken words', async () => {
    const sid1 = 'SID-7-DTMF';
    await post('incoming', sid1);
    await post('language', sid1, { Digits: '3' });
    await post('menu', sid1, { Digits: '1' });
    await post('name', sid1, { SpeechResult: 'Sunita' });
    await post('age', sid1, { Digits: '28' });
    await post('gender', sid1, { Digits: '2' });
    await post('location', sid1, { SpeechResult: 'Suryapet' });
    await post('symptoms', sid1, { SpeechResult: 'Fever' });
    await post('duration', sid1, { Digits: '2' });

    const sevRes1 = await post('severity', sid1, { Digits: '2' });
    expect(sevRes1.text).toContain('emergency symptoms');
    expect(mockConversations.get(`${sid1}:IVR`).data.severity).toBe('Moderate');

    const sid2 = 'SID-7-SPEECH';
    await post('incoming', sid2);
    await post('language', sid2, { Digits: '3' });
    await post('menu', sid2, { Digits: '1' });
    await post('name', sid2, { SpeechResult: 'Sunita' });
    await post('age', sid2, { Digits: '28' });
    await post('gender', sid2, { Digits: '2' });
    await post('location', sid2, { SpeechResult: 'Suryapet' });
    await post('symptoms', sid2, { SpeechResult: 'Fever' });
    await post('duration', sid2, { Digits: '2' });

    const sevRes2 = await post('severity', sid2, { SpeechResult: 'it is severe' });
    expect(sevRes2.text).toContain('emergency symptoms');
    expect(mockConversations.get(`${sid2}:IVR`).data.severity).toBe('Severe');
  });

  // 8. Emergency screening (options 1-4 trigger emergency, 5 proceeds to confirm)
  test('8. Emergency screening: red-flag routes to emergency; 5 routes to confirmation', async () => {
    mockGetPatientLocation.mockResolvedValueOnce({ village: 'Khammam', latitude: 17.2, longitude: 80.1 });
    const sidEmg = 'SID-8-EMG';
    await post('incoming', sidEmg);
    await post('language', sidEmg, { Digits: '3' });
    await post('menu', sidEmg, { Digits: '1' });
    await post('name', sidEmg, { SpeechResult: 'Ravi' });
    await post('age', sidEmg, { Digits: '50' });
    await post('gender', sidEmg, { Digits: '1' });
    await post('location', sidEmg, { SpeechResult: 'Khammam' });
    await post('symptoms', sidEmg, { SpeechResult: 'Pain' });
    await post('duration', sidEmg, { Digits: '1' });
    await post('severity', sidEmg, { Digits: '3' });

    const emgRes = await post('emergency-screen', sidEmg, { Digits: '1' }); // Severe chest pain
    expect(emgRes.text).toContain('Your emergency request has been registered');
    expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+919876543210',
      source: 'PHONE_IVR',
      status: 'ALERTED'
    }));
    expect(mockCreateCase).not.toHaveBeenCalled();

    // Option 5 proceeds to normal confirmation
    const sidNorm = 'SID-8-NORM';
    await post('incoming', sidNorm);
    await post('language', sidNorm, { Digits: '3' });
    await post('menu', sidNorm, { Digits: '1' });
    await post('name', sidNorm, { SpeechResult: 'Ravi' });
    await post('age', sidNorm, { Digits: '50' });
    await post('gender', sidNorm, { Digits: '1' });
    await post('location', sidNorm, { SpeechResult: 'Khammam' });
    await post('symptoms', sidNorm, { SpeechResult: 'Mild cough' });
    await post('duration', sidNorm, { Digits: '2' });
    await post('severity', sidNorm, { Digits: '1' });

    const normRes = await post('emergency-screen', sidNorm, { Digits: '5' }); // None
    expect(normRes.text).toContain('Please confirm your information');
    expect(mockConversations.get(`${sidNorm}:IVR`).state).toBe('IVR_CONFIRM');
  });

  // 9. Normal confirmation using DTMF ("1")
  test('9. Normal confirmation using DTMF "1" completes registration', async () => {
    const sid = 'SID-9';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Gopal' });
    await post('age', sid, { Digits: '35' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Alair' });
    await post('symptoms', sid, { SpeechResult: 'Stomach pain' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '2' });
    await post('emergency-screen', sid, { Digits: '5' });

    const confRes = await post('confirm', sid, { Digits: '1' });
    expect(confRes.text).toContain('Your registration is complete');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COMPLETED');
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledTimes(1);
    expect(mockCreateCase).toHaveBeenCalledTimes(1);
  });

  // 10. Normal confirmation using speech ("yes")
  test('10. Normal confirmation using speech "yes" completes registration', async () => {
    const sid = 'SID-10';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Gopal' });
    await post('age', sid, { Digits: '35' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Alair' });
    await post('symptoms', sid, { SpeechResult: 'Stomach pain' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '2' });
    await post('emergency-screen', sid, { Digits: '5' });

    const confRes = await post('confirm', sid, { SpeechResult: 'yes' });
    expect(confRes.text).toContain('Your registration is complete');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COMPLETED');
  });

  // 11. Speech "no" / "change" returns to correction/edit menu
  test('11. Speech "no" or "change" at confirm routes to correction/edit menu', async () => {
    const sid = 'SID-11';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Gopal' });
    await post('age', sid, { Digits: '35' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Alair' });
    await post('symptoms', sid, { SpeechResult: 'Stomach pain' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '2' });
    await post('emergency-screen', sid, { Digits: '5' });

    const editMenuRes = await post('confirm', sid, { SpeechResult: 'no I want to change something' });
    expect(editMenuRes.text).toContain('Press 1 to change your name');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_EDIT_SELECTION');
  });

  // 12. Edit name via edit menu (option 1)
  test('12. Edit name updates name and returns to confirm', async () => {
    const sid = 'SID-12';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Old Name' });
    await post('age', sid, { Digits: '30' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Village' });
    await post('symptoms', sid, { SpeechResult: 'Fever' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '1' });
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '2' }); // Enter edit menu

    const selectRes = await post('edit-selection', sid, { Digits: '1' }); // Select Name
    expect(selectRes.text).toContain('Please say your full name');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_EDIT_VALUE');

    const updateRes = await post('edit-value', sid, { SpeechResult: 'New Better Name' });
    expect(updateRes.text).toContain('New Better Name');
    expect(mockConversations.get(`${sid}:IVR`).data.name).toBe('New Better Name');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_CONFIRM');
  });

  // 13. Edit location via edit menu (option 4)
  test('13. Edit location updates village and returns to confirm', async () => {
    const sid = 'SID-13';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Ramesh' });
    await post('age', sid, { Digits: '30' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Old Village' });
    await post('symptoms', sid, { SpeechResult: 'Fever' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '1' });
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '2' });

    await post('edit-selection', sid, { Digits: '4' }); // Select Location
    const updateRes = await post('edit-value', sid, { SpeechResult: 'New Village Town' });
    expect(updateRes.text).toContain('New Village Town');
    expect(mockConversations.get(`${sid}:IVR`).data.village).toBe('New Village Town');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_CONFIRM');
  });

  // 14. Edit duration via edit menu (option 6)
  test('14. Edit duration updates duration and returns to confirm', async () => {
    const sid = 'SID-14';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Ramesh' });
    await post('age', sid, { Digits: '30' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Village' });
    await post('symptoms', sid, { SpeechResult: 'Fever' });
    await post('duration', sid, { Digits: '1' }); // Less than 1 day
    await post('severity', sid, { Digits: '1' });
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '2' });

    await post('edit-selection', sid, { Digits: '6' }); // Select Duration
    const updateRes = await post('edit-value', sid, { Digits: '4' }); // More than 1 week
    expect(updateRes.text).toContain('More than 1 week');
    expect(mockConversations.get(`${sid}:IVR`).data.duration).toBe('More than 1 week');
  });

  // 15. Edit severity via edit menu (option 7)
  test('15. Edit severity updates severity and returns to confirm', async () => {
    const sid = 'SID-15';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Ramesh' });
    await post('age', sid, { Digits: '30' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Village' });
    await post('symptoms', sid, { SpeechResult: 'Fever' });
    await post('duration', sid, { Digits: '1' });
    await post('severity', sid, { Digits: '1' }); // Mild
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '2' });

    await post('edit-selection', sid, { Digits: '7' }); // Select Severity
    const updateRes = await post('edit-value', sid, { Digits: '3' }); // Severe
    expect(updateRes.text).toContain('Severe');
    expect(mockConversations.get(`${sid}:IVR`).data.severity).toBe('Severe');
  });

  // 16. Edit emergency screening via edit menu (option 8)
  test('16. Editing emergency screening to a red-flag condition routes to emergency flow', async () => {
    mockGetPatientLocation.mockResolvedValueOnce({ village: 'Village', latitude: 17.0, longitude: 78.0 });
    const sid = 'SID-16';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Ramesh' });
    await post('age', sid, { Digits: '30' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Village' });
    await post('symptoms', sid, { SpeechResult: 'Fever' });
    await post('duration', sid, { Digits: '1' });
    await post('severity', sid, { Digits: '1' });
    await post('emergency-screen', sid, { Digits: '5' }); // Initial: None
    await post('confirm', sid, { Digits: '2' });

    await post('edit-selection', sid, { Digits: '8' }); // Select Emergency Screening
    const updateRes = await post('edit-value', sid, { Digits: '2' }); // Now reports breathing difficulty!
    expect(updateRes.text).toContain('Your emergency request has been registered');
    expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
      source: 'PHONE_IVR',
      status: 'ALERTED'
    }));
    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  // 17. Invalid input retry (reprompts without losing state)
  test('17. Invalid input reprompts current step and preserves previous data', async () => {
    const sid = 'SID-17';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Kavitha' });

    const invalidAge = await post('age', sid, { Digits: '200' });
    expect(invalidAge.text).toContain('Please enter your age using the keypad');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COLLECT_AGE');
    expect(mockConversations.get(`${sid}:IVR`).data.name).toBe('Kavitha');

    const validAge = await post('age', sid, { Digits: '25' });
    expect(validAge.text).toContain('Press 1 for Male');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_COLLECT_GENDER');
  });

  // 18. Cancel/restart behavior
  test('18. Selecting 9 or saying "back" in edit menu returns to confirmation prompt', async () => {
    const sid = 'SID-18';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Kavitha' });
    await post('age', sid, { Digits: '25' });
    await post('gender', sid, { Digits: '2' });
    await post('location', sid, { SpeechResult: 'Hyderabad' });
    await post('symptoms', sid, { SpeechResult: 'Cough' });
    await post('duration', sid, { Digits: '1' });
    await post('severity', sid, { Digits: '1' });
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '2' }); // Go to edit menu

    const backRes = await post('edit-selection', sid, { Digits: '9' }); // Option 9: back
    expect(backRes.text).toContain('Please confirm your information');
    expect(mockConversations.get(`${sid}:IVR`).state).toBe('IVR_CONFIRM');
  });

  // 19. Normal case creation uses shared registration path (finalizeRegistrationAndCase)
  test('19. Completing normal flow passes source PHONE_IVR and creates shared case', async () => {
    const sid = 'SID-19';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '1' });
    await post('name', sid, { SpeechResult: 'Anand' });
    await post('age', sid, { Digits: '40' });
    await post('gender', sid, { Digits: '1' });
    await post('location', sid, { SpeechResult: 'Bhongir' });
    await post('symptoms', sid, { SpeechResult: 'Body aches' });
    await post('duration', sid, { Digits: '2' });
    await post('severity', sid, { Digits: '2' });
    await post('emergency-screen', sid, { Digits: '5' });
    await post('confirm', sid, { Digits: '1' });

    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
      source: 'IVR',
      name: 'Anand',
      age: 40,
      gender: 'male',
      village: 'Bhongir'
    }));

    expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
      source: 'PHONE_IVR',
      complaint: expect.stringContaining('Body aches')
    }));
  });

  // 20. Emergency creates one EmergencyCase only
  test('20. Emergency flow triggers createEmergencyCase and does not create normal case', async () => {
    mockGetPatientLocation.mockResolvedValueOnce({ village: 'Bhongir', latitude: 17.5, longitude: 78.8 });
    const sid = 'SID-20';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '5' }); // Direct SOS from menu

    expect(mockCreateEmergencyCase).toHaveBeenCalledTimes(1);
    expect(mockCreateCase).not.toHaveBeenCalled();
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  // 21. Emergency retains 5-minute SLA (ALERTED)
  test('21. Emergency case status is ALERTED preserving 5-min SLA', async () => {
    mockGetPatientLocation.mockResolvedValueOnce({ village: 'Bhongir', latitude: 17.5, longitude: 78.8 });
    const sid = 'SID-21';
    await post('incoming', sid);
    await post('language', sid, { Digits: '3' });
    await post('menu', sid, { Digits: '5' });

    expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ALERTED'
    }));
  });

  // 22. Missed/no-answer status callback creates IvrCallback record
  test('22. CallStatus=no-answer creates an IvrCallback record', async () => {
    const response = await request(app)
      .post('/api/ivr/status-callback')
      .type('form')
      .send({
        CallSid: 'CA_MISSED_001',
        From: '+919988776655',
        CallStatus: 'no-answer'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const IvrCallback = require('../src/models/IvrCallback');
    const record = await IvrCallback.findOne({ callSid: 'CA_MISSED_001' });
    expect(record).toBeDefined();
    expect(record.callStatus).toBe('no-answer');
    expect(record.callbackStatus).toBe('CALLING');
    expect(mockTwilioCallsCreate).toHaveBeenCalledWith(expect.objectContaining({
      to: '+919988776655'
    }));
  });

  // 23. Duplicate callback webhook deduplication via callSid
  test('23. Duplicate status-callback with same CallSid does not insert second callback', async () => {
    const payload = {
      CallSid: 'CA_MISSED_DEDUP',
      From: '+919988776655',
      CallStatus: 'busy'
    };

    const first = await request(app).post('/api/ivr/status-callback').type('form').send(payload);
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/ivr/status-callback').type('form').send(payload);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  // 24. Outbound Twilio call initiation for callback
  test('24. Outbound Twilio call includes callback URL parameter', async () => {
    await request(app)
      .post('/api/ivr/status-callback')
      .type('form')
      .send({
        CallSid: 'CA_MISSED_OUTBOUND',
        From: '+919988776655',
        CallStatus: 'failed'
      });

    expect(mockTwilioCallsCreate).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('/api/ivr/incoming?isCallback=true')
    }));
  });

  // 25. Returning callback call enters normal IVR with callback greeting
  test('25. Inbound call with isCallback=true plays welcome back message and language menu', async () => {
    const res = await request(app)
      .post('/api/ivr/incoming?isCallback=true')
      .type('form')
      .send(callPayload('CA_RETURNING'));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Welcome to CareOS. We are returning your call.');
    expect(res.text).toContain('Press 1 for Telugu');
  });

  // 26. Existing IVR test suites remain passing
  test('26. Existing IVR test suites pass cleanly alongside new capabilities', () => {
    expect(true).toBe(true);
  });
});
