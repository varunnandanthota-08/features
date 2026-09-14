const request = require('supertest');
const { app } = require('../src/app');
const Case = require('../src/models/Case');
const Patient = require('../src/models/Patient');
const HealthCenter = require('../src/models/HealthCenter');
const Referral = require('../src/models/Referral');
const Document = require('../src/models/Document');
const User = require('../src/models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

jest.mock('../src/models/Case');
jest.mock('../src/models/Patient');
jest.mock('../src/models/HealthCenter');
jest.mock('../src/models/Referral');
jest.mock('../src/models/Document');
jest.mock('../src/models/User');

describe('Patient My Cases Details and Ownership Authorization', () => {
  const patientOneId = new mongoose.Types.ObjectId().toString();
  const userOneId = new mongoose.Types.ObjectId().toString();
  const patientOneToken = jwt.sign(
    { userId: userOneId, username: 'patient1', role: 'PATIENT' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  const patientTwoId = new mongoose.Types.ObjectId().toString();
  const userTwoId = new mongoose.Types.ObjectId().toString();
  const patientTwoToken = jwt.sign(
    { userId: userTwoId, username: 'patient2', role: 'PATIENT' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  const workerToken = jwt.sign(
    { userId: 'worker-1', username: 'healthworker1', role: 'HEALTH_WORKER', healthCenterId: 'HC-001' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  const mockCasePatientOne = {
    caseId: 'CASE-PATIENT-1',
    patientId: patientOneId,
    source: 'DASHBOARD',
    complaint: 'Severe persistent fever and coughing',
    status: 'ASSIGNED',
    escalationStatus: 'NOT_ESCALATED',
    assignedHealthCenterId: 'mongo-hc-001',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    toObject: function() { return { ...this }; }
  };

  const mockPatientRecord = {
    _id: patientOneId,
    name: 'Sunita Rao',
    phone: '+919876543210',
    age: 34,
    gender: 'female',
    location: { village: 'Bachupally', latitude: 17.541, longitude: 78.363 },
    language: 'te'
  };

  const mockHealthCenter = {
    _id: 'mongo-hc-001',
    healthCenterId: 'HC-001',
    name: 'Community Health Centre 1',
    village: 'Bachupally',
    services: ['GENERAL', 'ENT']
  };

  const mockDocuments = [
    {
      _id: 'doc-1',
      patientId: patientOneId,
      documentType: 'MEDICAL_REPORT',
      originalFileName: 'blood_report.pdf',
      extractionStatus: 'VERIFIED',
      createdAt: new Date('2026-09-02T10:00:00.000Z')
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('patient can view complete details and documents for their own case', async () => {
    User.findById.mockResolvedValue({
      _id: userOneId,
      role: 'PATIENT',
      patientId: patientOneId
    });

    Case.findOne.mockResolvedValue(mockCasePatientOne);
    Patient.findById.mockResolvedValue(mockPatientRecord);
    HealthCenter.findById.mockResolvedValue(mockHealthCenter);
    Referral.findOne.mockResolvedValue(null);
    Document.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockDocuments)
    });

    const res = await request(app)
      .get('/api/cases/CASE-PATIENT-1')
      .set('Authorization', `Bearer ${patientOneToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.caseId).toBe('CASE-PATIENT-1');
    expect(res.body.data.complaint).toBe('Severe persistent fever and coughing');
    expect(res.body.data.patient.name).toBe('Sunita Rao');
    expect(res.body.data.patient.age).toBe(34);
    expect(res.body.data.assignedHealthCenter.name).toBe('Community Health Centre 1');
    expect(res.body.data.documents.length).toBe(1);
    expect(res.body.data.documents[0].originalFileName).toBe('blood_report.pdf');
  });

  test('patient is rejected with 403 when trying to access another patient case', async () => {
    User.findById.mockResolvedValue({
      _id: userTwoId,
      role: 'PATIENT',
      patientId: patientTwoId // belongs to patientTwo, not patientOne!
    });

    Case.findOne.mockResolvedValue(mockCasePatientOne);

    const res = await request(app)
      .get('/api/cases/CASE-PATIENT-1')
      .set('Authorization', `Bearer ${patientTwoToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unauthorized to access this case/i);
  });

  test('health worker can view case details with health centre authorization', async () => {
    HealthCenter.findOne.mockResolvedValue({
      _id: 'mongo-hc-001',
      healthCenterId: 'HC-001'
    });

    Case.findOne.mockResolvedValue(mockCasePatientOne);
    Patient.findById.mockResolvedValue(mockPatientRecord);
    HealthCenter.findById.mockResolvedValue(mockHealthCenter);
    Referral.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/cases/CASE-PATIENT-1')
      .set('Authorization', `Bearer ${workerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.caseId).toBe('CASE-PATIENT-1');
  });

  test('returns 404 when case ID does not exist', async () => {
    Case.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/cases/NON-EXISTENT-CASE')
      .set('Authorization', `Bearer ${patientOneToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
