const request = require('supertest');
const { app } = require('../src/app');
const User = require('../src/models/User');
const Patient = require('../src/models/Patient');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/User');
jest.mock('../src/models/Patient');
jest.mock('../src/services/geocoding.service', () => ({
  geocodeLocation: jest.fn().mockResolvedValue({ latitude: 17.541, longitude: 78.363 })
}));

describe('Patient Profile Management Endpoints', () => {
  const mockUserId = 'user-patient-789';
  const mockPatientId = 'patient-record-456';
  const patientToken = jwt.sign(
    { userId: mockUserId, username: 'testpatient', role: 'PATIENT' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );
  const workerToken = jwt.sign(
    { userId: 'worker-1', username: 'healthworker', role: 'HEALTH_WORKER', healthCenterId: 'HC-001' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/patients/me', () => {
    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/patients/me');
      expect(res.statusCode).toBe(401);
    });

    test('rejects non-patient role with 403', async () => {
      const res = await request(app)
        .get('/api/patients/me')
        .set('Authorization', `Bearer ${workerToken}`);
      expect(res.statusCode).toBe(403);
    });

    test('returns combined user and patient profile for authenticated patient', async () => {
      const mockUser = {
        _id: mockUserId,
        username: 'testpatient',
        email: 'patient@example.com',
        name: 'Sunita Rao',
        phone: '+919876543210',
        role: 'PATIENT',
        patientId: mockPatientId
      };
      const mockPatient = {
        _id: mockPatientId,
        name: 'Sunita Rao',
        phone: '+919876543210',
        age: 34,
        gender: 'female',
        location: { village: 'Bachupally', latitude: 17.541, longitude: 78.363 },
        language: 'te'
      };

      User.findById.mockResolvedValue(mockUser);
      Patient.findById.mockResolvedValue(mockPatient);

      const res = await request(app)
        .get('/api/patients/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patient.name).toBe('Sunita Rao');
      expect(res.body.data.patient.age).toBe(34);
      expect(res.body.data.patient.location.village).toBe('Bachupally');
      expect(res.body.data.user.username).toBe('testpatient');
    });
  });

  describe('PUT /api/patients/me', () => {
    test('validates age between 1 and 120', async () => {
      User.findById.mockResolvedValue({ _id: mockUserId, role: 'PATIENT', phone: '+919876543210' });
      const res = await request(app)
        .put('/api/patients/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ age: 150 });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/between 1 and 120/i);
    });

    test('validates gender is an allowed enum value', async () => {
      User.findById.mockResolvedValue({ _id: mockUserId, role: 'PATIENT', phone: '+919876543210' });
      const res = await request(app)
        .put('/api/patients/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ gender: 'unknown_gender' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/gender is invalid/i);
    });

    test('validates language is an allowed enum value', async () => {
      User.findById.mockResolvedValue({ _id: mockUserId, role: 'PATIENT', phone: '+919876543210' });
      const res = await request(app)
        .put('/api/patients/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ language: 'french' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/language is invalid/i);
    });

    test('updates patient record and keeps User account in sync', async () => {
      const mockUser = {
        _id: mockUserId,
        role: 'PATIENT',
        patientId: mockPatientId,
        name: 'Old Name',
        phone: '+919876543210',
        save: jest.fn().mockResolvedValue(true)
      };
      const mockPatient = {
        _id: mockPatientId,
        name: 'Old Name',
        phone: '+919876543210',
        age: 30,
        gender: 'male',
        location: { village: 'Old Village' },
        language: 'en',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);
      Patient.findById.mockResolvedValue(mockPatient);

      const res = await request(app)
        .put('/api/patients/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          name: 'Sunita Rao',
          age: 35,
          gender: 'female',
          village: 'Bachupally',
          language: 'te',
          patientId: 'ATTEMPT_TO_SPOOF_ANOTHER_ID'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPatient.name).toBe('Sunita Rao');
      expect(mockPatient.age).toBe(35);
      expect(mockPatient.gender).toBe('female');
      expect(mockPatient.location.village).toBe('Bachupally');
      expect(mockPatient.location.latitude).toBe(17.541);
      expect(mockPatient.language).toBe('te');
      expect(mockPatient.save).toHaveBeenCalled();

      // Ensure user was synced and mockUserId was preserved
      expect(mockUser.name).toBe('Sunita Rao');
      expect(mockUser.patientId).toBe(mockPatientId); // Not the spoofed ID
      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});
