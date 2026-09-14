const request = require('supertest');
const { app } = require('../src/app');
const Case = require('../src/models/Case');
const Patient = require('../src/models/Patient');
const HealthCenter = require('../src/models/HealthCenter');
const Referral = require('../src/models/Referral');
const User = require('../src/models/User');
const { createCase } = require('../src/services/case.service');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/Case');
jest.mock('../src/models/Patient');
jest.mock('../src/models/HealthCenter');
jest.mock('../src/models/Referral');
jest.mock('../src/models/User');

const mockCenters = [
  {
    _id: 'mongo-hc-001',
    healthCenterId: 'HC-001',
    name: 'Rural Health Centre A',
    village: 'Village A',
    capacity: 50,
    currentPatientLoad: 10,
    location: { latitude: 17.421, longitude: 78.381 },
    emergencyAvailable: true,
    services: ['GENERAL', 'ENT'],
    equipment: { ecg: true },
    doctors: { general: 2, ent: 1 }
  },
  {
    _id: 'mongo-hc-003',
    healthCenterId: 'HC-003',
    name: 'Rural Health Centre C',
    village: 'Bachupally',
    capacity: 40,
    currentPatientLoad: 15,
    location: { latitude: 17.493, longitude: 78.357 },
    emergencyAvailable: true,
    services: ['GENERAL', 'PEDIATRICS'],
    equipment: { ultrasound: true },
    doctors: { general: 2, pediatrics: 1 }
  },
  {
    _id: 'mongo-hc-004',
    healthCenterId: 'HC-004',
    name: 'Community Health Centre D',
    village: 'Kukatpally',
    capacity: 60,
    currentPatientLoad: 20,
    location: { latitude: 17.484, longitude: 78.413 },
    emergencyAvailable: true,
    services: ['GENERAL', 'ENT', 'CARDIOLOGY'],
    equipment: { xray: true, ecg: true },
    doctors: { general: 3, ent: 1, cardiology: 1 }
  }
];

const mongoose = require('mongoose');

describe('Patient Normal Case Geocoding and Referral Workflow', () => {
  const mockPatientId = new mongoose.Types.ObjectId().toString();
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const patientToken = jwt.sign(
    { userId: mockUserId, username: 'patient1', role: 'PATIENT' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    HealthCenter.find.mockResolvedValue(mockCenters);
  });

  test('valid village: Bachupally resolves coordinates and assigns suitable health centre', async () => {
    const mockPatient = {
      _id: mockPatientId,
      name: 'Ravi Kumar',
      phone: '+919988776655',
      location: { village: 'Bachupally' },
      save: jest.fn().mockResolvedValue(true)
    };
    Patient.findById.mockResolvedValue(mockPatient);
    Case.create.mockImplementation(data => Promise.resolve({ ...data, _id: 'case-mongo-1' }));

    const result = await createCase({
      patientId: mockPatientId,
      source: 'DASHBOARD',
      complaint: 'Severe persistent fever and coughing',
      location: { village: 'Bachupally' }
    });

    expect(result.case).toBeDefined();
    // Normalized location has resolved latitude and longitude
    expect(result.case.location.latitude).toBeDefined();
    expect(result.case.location.longitude).toBeDefined();
    expect(result.case.assignedHealthCenterId).toBe('mongo-hc-003');
  });

  test('alternate valid locality: Kukatpally resolves coordinates and recommends nearby centres', async () => {
    const kukatpallyPatientId = new mongoose.Types.ObjectId().toString();
    const mockPatient = {
      _id: kukatpallyPatientId,
      name: 'Anita Verma',
      phone: '+919876543201',
      location: { village: 'Kukatpally' },
      save: jest.fn().mockResolvedValue(true)
    };
    Patient.findById.mockResolvedValue(mockPatient);
    Case.create.mockImplementation(data => Promise.resolve({ ...data, _id: 'case-mongo-2' }));

    const result = await createCase({
      patientId: kukatpallyPatientId,
      source: 'DASHBOARD',
      complaint: 'Chest tightness and shortness of breath',
      location: { village: 'Kukatpally' }
    });

    expect(result.case.location.latitude).toBeDefined();
    expect(result.case.location.longitude).toBeDefined();
    expect(result.case.assignedHealthCenterId).toBe('mongo-hc-004');
  });

  test('unresolved location: non-existent locality returns 404 Location could not be resolved', async () => {
    const res = await request(app)
      .get('/api/health-centers/geocode?location=InvalidNonExistentLocality123456');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Location could not be resolved/i);
  });

  test('multiple suitable health centres returned in recommendation query', async () => {
    const res = await request(app)
      .get('/api/health-centers/recommend?latitude=17.493&longitude=78.357');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recommendation).toBeDefined();
    expect(res.body.data.facilities.length).toBeGreaterThan(0);
  });

  test('referral creation succeeds after destination selection', async () => {
    const mockUser = {
      _id: mockUserId,
      role: 'PATIENT',
      patientId: mockPatientId
    };
    User.findById.mockResolvedValue(mockUser);

    const mockCaseRecord = {
      caseId: 'CASE-TEST-1',
      patientId: mockPatientId,
      assignedHealthCenterId: 'mongo-hc-003',
      status: 'ASSIGNED',
      save: jest.fn().mockResolvedValue(true)
    };
    Case.findOne.mockResolvedValue(mockCaseRecord);

    HealthCenter.findOne.mockImplementation(({ healthCenterId }) => {
      const found = mockCenters.find(c => c.healthCenterId === healthCenterId);
      return Promise.resolve(found || null);
    });

    Referral.create.mockImplementation(data => Promise.resolve({ ...data, _id: 'referral-mongo-1' }));

    const res = await request(app)
      .post('/api/referrals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        referralId: 'REF-TEST-99',
        caseId: 'CASE-TEST-1',
        patientId: mockPatientId,
        fromHealthCenterId: 'HC-003',
        toHealthCenterId: 'HC-004',
        reason: 'Specialist consultation required'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockCaseRecord.status).toBe('REFERRED');
    expect(mockCaseRecord.referredToHealthCenterId).toBe('mongo-hc-004');
    expect(mockCaseRecord.save).toHaveBeenCalled();
  });
});
