const mockConversations = new Map();
const mockCreateOrUpdatePatient = jest.fn();
const mockFindByPhone = jest.fn();
const mockCreateEmergencyCase = jest.fn();
const mockGetPatientLocation = jest.fn();
const mockGeocodeLocation = jest.fn();
const mockEnsureEmergencyPatient = jest.fn();

jest.mock('../../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient,
  findByPhone: mockFindByPhone,
  ensureEmergencyPatient: mockEnsureEmergencyPatient
}));

jest.mock('../../src/services/emergency.service', () => ({
  createEmergencyCase: mockCreateEmergencyCase,
  getPatientLocation: mockGetPatientLocation
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
      const conversation = mockConversations.get(`${query.phone}:${query.channel}`);
      return conversation ? new MockConversation(JSON.parse(JSON.stringify(conversation))) : null;
    }

    static async deleteMany() {
      mockConversations.clear();
    }

    static async find(query) {
      return Array.from(mockConversations.values())
        .filter(conversation => conversation.phone === query.phone)
        .map(conversation => new MockConversation(JSON.parse(JSON.stringify(conversation))));
    }
  }

  return MockConversation;
});

const Conversation = require('../../src/models/Conversation');
const { processMessage } = require('../../src/services/conversation.service');
const { CONVERSATION_STATES } = require('../../src/constants/conversationStates');

function message(text, id) {
  return {
    phone: 'whatsapp:+919876543210',
    message: text,
    messageId: id,
    channel: 'WHATSAPP'
  };
}

function channelMessage(text, id, channel) {
  return { ...message(text, id), channel };
}

async function processSequence() {
  await processMessage(message('Hi', 'SM1'));
  await processMessage(message('3', 'SM2'));
  await processMessage(message('Ravi Kumar', 'SM3'));
  await processMessage(message('52', 'SM4'));
  await processMessage(message('1', 'SM5'));
  await processMessage(message('Village A', 'SM6'));
  return processMessage(message('I have fever for three days.', 'SM7'));
}

describe('conversation service', () => {
  beforeEach(async () => {
    await Conversation.deleteMany({});
    mockCreateOrUpdatePatient.mockResolvedValue({ phone: '+919876543210' });
    mockFindByPhone.mockReset();
    mockGetPatientLocation.mockReset();
    mockEnsureEmergencyPatient.mockReset();
    mockCreateEmergencyCase.mockReset();
    mockGeocodeLocation.mockReset();
    mockGetPatientLocation.mockResolvedValue(null);
    mockEnsureEmergencyPatient.mockResolvedValue({ phone: '+919876543210' });
    mockGeocodeLocation.mockResolvedValue(null);
    mockCreateEmergencyCase.mockResolvedValue({
      emergency: { caseId: 'EMG-CHANNEL-1' },
      selectedFacility: { healthCenterId: 'HC-001', name: 'Community Health Centre J' }
    });
  });

  test('starts a new conversation in SELECT_LANGUAGE', async () => {
    const result = await processMessage(message('Hi', 'SM1'));

    expect(result.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
    expect(result.response).toContain('Please select your language');
  });

  test.each([
    ['1', 'te'],
    ['2', 'hi'],
    ['3', 'en']
  ])('accepts language option %s', async (option, language) => {
    await processMessage(message('Hi', 'SM1'));
    const result = await processMessage(message(option, 'SM2'));

    expect(result.conversation.language).toBe(language);
    expect(result.conversation.state).toBe(CONVERSATION_STATES.COLLECT_NAME);
  });

  test('rejects invalid language without advancing', async () => {
    await processMessage(message('Hi', 'SM1'));
    const result = await processMessage(message('9', 'SM2'));

    expect(result.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
    expect(result.conversation.language).toBeNull();
  });

  test('shows support for shared menu option 4', async () => {
    await processMessage(message('Hi', 'MENU-1'));
    const result = await processMessage(message(' 4 ', 'MENU-2'));

    expect(result.response).toContain('local health worker');
    expect(result.conversation.state).toBe(CONVERSATION_STATES.SELECT_LANGUAGE);
  });

  test.each(['WHATSAPP', 'SMS'])('uses the shared emergency path for %s', async channel => {
    const input = text => processMessage(channelMessage(text, `${channel}-${text}-${Date.now()}`, channel));
    mockGetPatientLocation.mockResolvedValueOnce({ latitude: 17.4, longitude: 78.4 });

    await input('Hi');
    const result = await input('5');

    expect(result.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
    expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+919876543210',
      source: channel,
      status: 'ALERTED',
      location: { latitude: 17.4, longitude: 78.4 }
    }));
  });

  test('geocoded WhatsApp emergency waits for confirmation before assignment', async () => {
    mockGeocodeLocation.mockResolvedValueOnce({
      latitude: 17.53,
      longitude: 78.35,
      displayName: 'Bachupally, Telangana, India'
    });
    await processMessage(message('Hi', 'SOS-1'));
    const locationPrompt = await processMessage(message('5', 'SOS-2'));
    expect(locationPrompt.conversation.state).toBe(CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION);
    const confirmation = await processMessage(message('Bachupally', 'SOS-3'));
    expect(confirmation.conversation.state).toBe(CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION_CONFIRM);
    expect(confirmation.response).toContain('Bachupally, Telangana, India');
    expect(mockCreateEmergencyCase).not.toHaveBeenCalled();

    await processMessage(message('1', 'SOS-4'));
    expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
      source: 'WHATSAPP',
      location: { latitude: 17.53, longitude: 78.35 },
      locationLabel: 'Bachupally, Telangana, India'
    }));
  });

  test('repeating the same emergency message id does not create another case', async () => {
    mockGetPatientLocation.mockResolvedValueOnce({ latitude: 17.4, longitude: 78.4 });
    await processMessage(message('Hi', 'DUP-1'));
    await processMessage(message('5', 'DUP-2'));
    const duplicate = await processMessage(message('5', 'DUP-2'));

    expect(duplicate.duplicate).toBe(true);
    expect(mockCreateEmergencyCase).toHaveBeenCalledTimes(1);
  });

  test('stores a trimmed name and advances to age', async () => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    const result = await processMessage(message(' Ravi Kumar ', 'SM3'));

    expect(result.conversation.data.name).toBe('Ravi Kumar');
    expect(result.conversation.state).toBe(CONVERSATION_STATES.COLLECT_AGE);
  });

  test.each(['abc', '150'])('rejects invalid age %s without advancing', async (age) => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));
    const result = await processMessage(message(age, 'SM4'));

    expect(result.conversation.state).toBe(CONVERSATION_STATES.COLLECT_AGE);
    expect(result.conversation.data.age).toBeNull();
  });

  test('stores numeric age and advances to gender', async () => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));
    const result = await processMessage(message('52', 'SM4'));

    expect(result.conversation.data.age).toBe(52);
    expect(result.conversation.state).toBe(CONVERSATION_STATES.COLLECT_GENDER);
  });

  test('rejects invalid gender without advancing', async () => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));
    await processMessage(message('52', 'SM4'));
    const result = await processMessage(message('9', 'SM5'));

    expect(result.conversation.state).toBe(CONVERSATION_STATES.COLLECT_GENDER);
  });

  test('stores gender, location, and raw symptoms', async () => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));
    await processMessage(message('52', 'SM4'));
    await processMessage(message('1', 'SM5'));
    await processMessage(message('Village A', 'SM6'));
    const result = await processMessage(message('I have fever for three days.', 'SM7'));

    expect(result.conversation.data.gender).toBe('male');
    expect(result.conversation.data.village).toBe('Village A');
    expect(result.conversation.data.symptomsDescription).toBe('I have fever for three days.');
    expect(result.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
  });

  test('does not process the same MessageSid twice', async () => {
    await processMessage(message('Hi', 'SM1'));
    const first = await processMessage(message('3', 'SM2'));
    const duplicate = await processMessage(message('3', 'SM2'));

    expect(first.conversation.state).toBe(CONVERSATION_STATES.COLLECT_NAME);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.response).toBeNull();
    expect(duplicate.conversation.state).toBe(CONVERSATION_STATES.COLLECT_NAME);
  });

  test('retains state and data after loading the document again', async () => {
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));

    const reloadedConversation = await Conversation.findOne({ phone: '+919876543210', channel: 'WHATSAPP' });

    expect(reloadedConversation.state).toBe(CONVERSATION_STATES.COLLECT_AGE);
    expect(reloadedConversation.language).toBe('en');
    expect(reloadedConversation.data.name).toBe('Ravi Kumar');
    expect(reloadedConversation.processedMessageIds).toEqual(['SM1', 'SM2', 'SM3']);
  });

  test('completes the full conversation without creating a patient', async () => {
    const result = await processSequence();
    const conversations = await Conversation.find({ phone: '+919876543210' });

    expect(result.conversation.state).toBe(CONVERSATION_STATES.COMPLETED);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].data).toMatchObject({
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      symptomsDescription: 'I have fever for three days.'
    });
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith({
      phone: '+919876543210',
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      language: 'en',
      symptomsDescription: 'I have fever for three days.'
    });
  });

  test('does not complete when patient persistence fails', async () => {
    mockCreateOrUpdatePatient.mockRejectedValueOnce(new Error('database unavailable'));
    await processMessage(message('Hi', 'SM1'));
    await processMessage(message('3', 'SM2'));
    await processMessage(message('Ravi Kumar', 'SM3'));
    await processMessage(message('52', 'SM4'));
    await processMessage(message('1', 'SM5'));
    await processMessage(message('Village A', 'SM6'));
    const result = await processMessage(message('I have fever', 'SM7'));
    const savedConversation = await Conversation.findOne({ phone: '+919876543210', channel: 'WHATSAPP' });

    expect(result.persistenceFailed).toBe(true);
    expect(result.response).toContain('could not complete your registration');
    expect(savedConversation.state).toBe(CONVERSATION_STATES.COLLECT_SYMPTOMS);
    expect(savedConversation.data.symptomsDescription).toBe('I have fever');
    expect(savedConversation.processedMessageIds).not.toContain('SM7');
  });
});
