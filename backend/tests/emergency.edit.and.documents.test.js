const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { app } = require('../src/app');

// Models
const Case = require('../src/models/Case');
const Patient = require('../src/models/Patient');
const HealthCenter = require('../src/models/HealthCenter');
const Referral = require('../src/models/Referral');
const Document = require('../src/models/Document');
const User = require('../src/models/User');

// Services for conversation testing
const { processMessage } = require('../src/services/conversation.service');
const { CONVERSATION_STATES } = require('../src/models/Conversation');
const { finalizeRegistrationAndCase } = require('../src/services/registration.service');

jest.mock('../src/models/Case');
jest.mock('../src/models/Patient');
jest.mock('../src/models/HealthCenter');
jest.mock('../src/models/Referral');
jest.mock('../src/models/Document');
jest.mock('../src/models/User');

const mockConversations = new Map();
jest.mock('../src/models/Conversation', () => {
  const STATES = {
    START: 'START',
    SELECT_LANGUAGE: 'SELECT_LANGUAGE',
    MAIN_MENU: 'MAIN_MENU',
    COLLECT_NAME: 'COLLECT_NAME',
    COLLECT_AGE: 'COLLECT_AGE',
    COLLECT_GENDER: 'COLLECT_GENDER',
    COLLECT_LOCATION: 'COLLECT_LOCATION',
    COLLECT_SYMPTOMS: 'COLLECT_SYMPTOMS',
    COLLECT_DURATION: 'COLLECT_DURATION',
    COLLECT_SEVERITY: 'COLLECT_SEVERITY',
    EMERGENCY_SCREENING: 'EMERGENCY_SCREENING',
    OPTIONAL_DOCUMENT: 'OPTIONAL_DOCUMENT',
    CONFIRM: 'CONFIRM',
    EDIT_SELECTION: 'EDIT_SELECTION',
    EDIT_VALUE: 'EDIT_VALUE',
    CHANNEL_EMERGENCY_LOCATION: 'CHANNEL_EMERGENCY_LOCATION',
    COMPLETED: 'COMPLETED'
  };

  class MockConversation {
    constructor(data = {}) {
      Object.assign(this, {
        phone: null,
        channel: 'WHATSAPP',
        state: STATES.START,
        language: 'en',
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

  MockConversation.CONVERSATION_STATES = STATES;
  return MockConversation;
});

const mockCreateEmergencyCase = jest.fn();
const mockGetPatientLocation = jest.fn();
jest.mock('../src/services/emergency.service', () => ({
  createEmergencyCase: (...args) => mockCreateEmergencyCase(...args),
  getPatientLocation: (...args) => mockGetPatientLocation(...args)
}));

const mockCreateOrUpdatePatient = jest.fn();
const mockEnsureEmergencyPatient = jest.fn();
jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: (...args) => mockCreateOrUpdatePatient(...args),
  ensureEmergencyPatient: (...args) => mockEnsureEmergencyPatient(...args),
  findByPhone: jest.fn().mockResolvedValue(null),
  normalizePhone: phone => String(phone).replace(/^whatsapp:/, '').trim()
}));

const mockCreateCase = jest.fn();
jest.mock('../src/services/case.service', () => {
  const actualCaseService = jest.requireActual('../src/services/case.service');
  return {
    ...actualCaseService,
    createCase: (...args) => mockCreateCase(...args)
  };
});

describe('CareOS Targeted Fixes: Emergency Screening Edit & Worker Case Documents', () => {
  const centerOneMongoId = new mongoose.Types.ObjectId().toString();
  const centerTwoMongoId = new mongoose.Types.ObjectId().toString();
  const patientMongoId = new mongoose.Types.ObjectId().toString();

  const authorizedWorkerToken = jwt.sign(
    { userId: 'worker-auth-1', username: 'worker1', role: 'HEALTH_WORKER', healthCenterId: 'HC-001' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  const unauthorizedWorkerToken = jwt.sign(
    { userId: 'worker-unauth-2', username: 'worker2', role: 'HEALTH_WORKER', healthCenterId: 'HC-002' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  const mockCase = {
    _id: new mongoose.Types.ObjectId(),
    caseId: 'CASE-DOC-101',
    patientId: patientMongoId,
    source: 'WHATSAPP',
    complaint: 'Persistent chest discomfort',
    status: 'ASSIGNED',
    escalationStatus: 'NOT_ESCALATED',
    assignedHealthCenterId: centerOneMongoId,
    createdAt: new Date('2026-09-14T10:00:00.000Z'),
    updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    toObject: function() { return { ...this }; }
  };

  const mockPatient = {
    _id: patientMongoId,
    name: 'Ramesh Kumar',
    phone: '+919988776655',
    age: 45,
    gender: 'male',
    location: { village: 'Ameenpur', latitude: 17.52, longitude: 78.33 },
    language: 'en'
  };

  const mockHealthCenterOne = {
    _id: centerOneMongoId,
    healthCenterId: 'HC-001',
    name: 'Ameenpur Primary Health Centre',
    village: 'Ameenpur',
    services: ['GENERAL', 'EMERGENCY']
  };

  const mockHealthCenterTwo = {
    _id: centerTwoMongoId,
    healthCenterId: 'HC-002',
    name: 'Miyapur Community Health Centre',
    village: 'Miyapur',
    services: ['GENERAL']
  };

  const mockUploadedDocument = {
    _id: new mongoose.Types.ObjectId(),
    patientId: patientMongoId,
    caseId: 'CASE-DOC-101',
    documentType: 'MEDICAL_REPORT',
    originalFileName: 'medical_report.pdf',
    extractionStatus: 'EXTRACTED',
    extractedData: {
      patientName: { value: 'Ramesh Kumar', confidence: 0.95 },
      diagnosis: { value: 'Hypertension', confidence: 0.92 }
    },
    createdAt: new Date('2026-09-14T10:05:00.000Z')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConversations.clear();
  });

  // TEST 1 & 2: Emergency screening editable and reflected in confirmation
  describe('FIX 1: Emergency Screening Must Be Editable', () => {
    test('1. Emergency screening can be edited from confirmation (option 8)', async () => {
      const Conversation = require('../src/models/Conversation');
      const conv = new Conversation({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        state: 'CONFIRM',
        language: 'en',
        data: {
          name: 'Ramesh Kumar',
          age: 45,
          gender: 'male',
          village: 'Ameenpur',
          symptomsDescription: 'Fever and cold',
          duration: '2 days',
          severity: 'Moderate',
          isEmergency: false
        }
      });
      await conv.save();

      // Step A: In CONFIRM, user replies '2' to edit information
      const editMenu = await processMessage({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        message: '2',
        messageId: 'M-1'
      });
      expect(editMenu.conversation.state).toBe('EDIT_SELECTION');
      expect(editMenu.response).toContain('8 - Emergency symptoms');
      expect(editMenu.response).toContain('9 - Back to confirmation');

      // Step B: User selects '8' for Emergency symptoms
      const screenPrompt = await processMessage({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        message: '8',
        messageId: 'M-2'
      });
      expect(screenPrompt.conversation.state).toBe('EDIT_VALUE');
      expect(screenPrompt.conversation.data.pendingField).toBe('emergencyScreen');
      expect(screenPrompt.response).toContain('Do you have any emergency symptoms?');
      expect(screenPrompt.response).toContain('1 - Severe chest pain');
      expect(screenPrompt.response).toContain('5 - None of these');
    });

    test('2. Edited emergency answer (5 - None of these) is reflected in confirmation', async () => {
      const Conversation = require('../src/models/Conversation');
      const conv = new Conversation({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        state: 'EDIT_VALUE',
        language: 'en',
        data: {
          name: 'Ramesh Kumar',
          age: 45,
          gender: 'male',
          village: 'Ameenpur',
          symptomsDescription: 'Fever and cold',
          duration: '2 days',
          severity: 'Moderate',
          isEmergency: false,
          pendingField: 'emergencyScreen'
        }
      });
      await conv.save();

      // User selects '5' (None of these)
      const res = await processMessage({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        message: '5',
        messageId: 'M-3'
      });

      expect(res.conversation.state).toBe('CONFIRM');
      expect(res.conversation.data.isEmergency).toBe(false);
      expect(res.conversation.data.pendingField).toBeNull();
      expect(res.response).toContain('Emergency screening updated.');
      expect(res.response).toContain('Please confirm your information');
      expect(res.response).toContain('Name: Ramesh Kumar');
    });

    test('3. Emergency edit does not create duplicate cases/emergencies when red flag is selected', async () => {
      mockGetPatientLocation.mockResolvedValue({
        village: 'Ameenpur',
        latitude: 17.52,
        longitude: 78.33
      });
      mockCreateEmergencyCase.mockResolvedValue({
        emergency: { caseId: 'EMERG-EDIT-999', status: 'ALERTED' },
        patient: { name: 'Ramesh Kumar' },
        selectedFacility: { name: 'Ameenpur PHC' }
      });

      const Conversation = require('../src/models/Conversation');
      const conv = new Conversation({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        state: 'EDIT_VALUE',
        language: 'en',
        data: {
          name: 'Ramesh Kumar',
          village: 'Ameenpur',
          symptomsDescription: 'Chest discomfort',
          pendingField: 'emergencyScreen'
        }
      });
      await conv.save();

      // User selects red flag option 1 (Severe chest pain)
      const res = await processMessage({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        message: '1',
        messageId: 'M-EMERG'
      });

      // Conversation must transition directly to COMPLETED via startChannelEmergency
      expect(res.conversation.state).toBe('COMPLETED');
      expect(res.conversation.data.isEmergency).toBe(true);

      // Verify createEmergencyCase was called exactly once
      expect(mockCreateEmergencyCase).toHaveBeenCalledTimes(1);
      expect(mockCreateEmergencyCase).toHaveBeenCalledWith(expect.objectContaining({
        phone: '+919988776655',
        status: 'ALERTED'
      }));

      // Verify normal case creation was NOT invoked (no duplicate cases)
      expect(mockCreateCase).not.toHaveBeenCalled();
    });
  });

  // TEST 4, 5, 6, 7: Document linkage and Worker case details retrieval & authorization
  describe('FIX 2: Show Uploaded Documents in Worker Case Details', () => {
    test('4. Uploaded WhatsApp document remains linked to patient and case after case creation', async () => {
      const docId = new mongoose.Types.ObjectId();
      Document.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: docId });

      mockCreateOrUpdatePatient.mockResolvedValue({
        _id: patientMongoId,
        name: 'Ramesh Kumar',
        phone: '+919988776655',
        location: { village: 'Ameenpur' }
      });

      mockCreateCase.mockResolvedValue({
        case: { caseId: 'CASE-DOC-101', _id: new mongoose.Types.ObjectId(), status: 'ASSIGNED' },
        selectedFacility: { name: 'Ameenpur PHC' }
      });

      const result = await finalizeRegistrationAndCase({
        phone: '+919988776655',
        channel: 'WHATSAPP',
        language: 'en',
        data: {
          name: 'Ramesh Kumar',
          village: 'Ameenpur',
          symptomsDescription: 'Chest discomfort',
          documentId: docId,
          documentUrl: 'medical_report.pdf'
        }
      });

      expect(result.case.caseId).toBe('CASE-DOC-101');
      expect(Document.findByIdAndUpdate).toHaveBeenCalledWith(
        docId,
        {
          $set: {
            patientId: patientMongoId,
            caseId: 'CASE-DOC-101'
          }
        }
      );
    });

    test('5. Worker case details can retrieve the patient uploaded document', async () => {
      Case.findOne.mockResolvedValue(mockCase);
      Patient.findById.mockResolvedValue(mockPatient);
      HealthCenter.findOne.mockImplementation(query => {
        if (query.healthCenterId === 'HC-001') return Promise.resolve(mockHealthCenterOne);
        return Promise.resolve(null);
      });
      HealthCenter.findById.mockResolvedValue(mockHealthCenterOne);
      Referral.findOne.mockResolvedValue(null);

      Document.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([mockUploadedDocument])
      });

      const res = await request(app)
        .get('/api/cases/CASE-DOC-101')
        .set('Authorization', `Bearer ${authorizedWorkerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.caseId).toBe('CASE-DOC-101');
      expect(res.body.data.documents).toBeDefined();
      expect(Array.isArray(res.body.data.documents)).toBe(true);
      expect(res.body.data.documents.length).toBe(1);

      const doc = res.body.data.documents[0];
      expect(doc.originalFileName).toBe('medical_report.pdf');
      expect(doc.documentType).toBe('MEDICAL_REPORT');
      expect(doc.extractionStatus).toBe('EXTRACTED');
      expect(doc.extractedData.diagnosis.value).toBe('Hypertension');
    });

    test('6. A case without a document still works normally', async () => {
      Case.findOne.mockResolvedValue(mockCase);
      Patient.findById.mockResolvedValue(mockPatient);
      HealthCenter.findOne.mockImplementation(query => {
        if (query.healthCenterId === 'HC-001') return Promise.resolve(mockHealthCenterOne);
        return Promise.resolve(null);
      });
      HealthCenter.findById.mockResolvedValue(mockHealthCenterOne);
      Referral.findOne.mockResolvedValue(null);

      // No documents found for this case/patient
      Document.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      });

      const res = await request(app)
        .get('/api/cases/CASE-DOC-101')
        .set('Authorization', `Bearer ${authorizedWorkerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.caseId).toBe('CASE-DOC-101');
      expect(res.body.data.documents).toEqual([]);
    });

    test('7. Unauthorized worker cannot access another patient document', async () => {
      Case.findOne.mockResolvedValue(mockCase);
      Patient.findById.mockResolvedValue(mockPatient);
      // HC-002 is NOT assigned to mockCase (which is assigned to centerOneMongoId)
      HealthCenter.findOne.mockImplementation(query => {
        if (query.healthCenterId === 'HC-002') return Promise.resolve(mockHealthCenterTwo);
        return Promise.resolve(null);
      });

      const res = await request(app)
        .get('/api/cases/CASE-DOC-101')
        .set('Authorization', `Bearer ${unauthorizedWorkerToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
      expect(res.body.data).toBeUndefined();
    });
  });
});
