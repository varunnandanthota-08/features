const request = require('supertest');
const { app } = require('../src/app');
const mongoose = require('mongoose');
const Case = require('../src/models/Case');
const EmergencyCase = require('../src/models/EmergencyCase');
const Referral = require('../src/models/Referral');
const HealthCenter = require('../src/models/HealthCenter');
const jwt = require('jsonwebtoken');

// Mock models
jest.mock('../src/models/Case', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn()
}));
jest.mock('../src/models/EmergencyCase', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn()
}));
jest.mock('../src/models/Referral', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn()
}));
jest.mock('../src/models/Patient', () => ({
  findById: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../src/models/HealthCenter', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn()
}));

describe('Authorization & HC Ownership', () => {
  let tokenA, tokenB;

  beforeAll(() => {
    // Tokens
    tokenA = jwt.sign({ userId: 'uA', role: 'HEALTH_WORKER', healthCenterId: 'HC-A', username: 'wA' }, process.env.JWT_SECRET || 'fallback_secret_for_tests');
    tokenB = jwt.sign({ userId: 'uB', role: 'HEALTH_WORKER', healthCenterId: 'HC-B', username: 'wB' }, process.env.JWT_SECRET || 'fallback_secret_for_tests');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    HealthCenter.findOne.mockImplementation(async (query) => {
      if (query.healthCenterId === 'HC-A') return { _id: 'mongo-hc-a', healthCenterId: 'HC-A' };
      if (query.healthCenterId === 'HC-B') return { _id: 'mongo-hc-b', healthCenterId: 'HC-B' };
      return null;
    });
  });

  describe('Unauthenticated Access', () => {
    it('should reject unauthenticated access', async () => {
      const res = await request(app).get('/api/cases/active');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Case Ownership', () => {
    it('HC-A cannot access HC-B active cases', async () => {
      // Mock getActiveCases filtering
      Case.find.mockImplementation((query) => {
        if (query.$or && query.$or[0].assignedHealthCenterId === 'mongo-hc-a') {
          return { sort: jest.fn().mockResolvedValue([]) };
        }
        return { sort: jest.fn().mockResolvedValue([{
          caseId: 'CASE-B', assignedHealthCenterId: 'mongo-hc-b', status: 'ASSIGNED'
        }]) };
      });

      const resA = await request(app)
        .get('/api/cases/active')
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(resA.statusCode).toBe(200);
      expect(resA.body.data.length).toBe(0); // Service filters out since it's A

      // Mock is already setup above to handle HC B correctly

      const resB = await request(app)
        .get('/api/cases/active')
        .set('Authorization', `Bearer ${tokenB}`);
      
      expect(resB.statusCode).toBe(200);
      expect(resB.body.data.length).toBe(1);
    });

    it('HC-A cannot acknowledge HC-B case', async () => {
      Case.findOne.mockResolvedValue({
        caseId: 'CASE-B',
        assignedHealthCenterId: 'mongo-hc-b',
        status: 'ASSIGNED'
      });

      const res = await request(app)
        .post('/api/cases/CASE-B/acknowledge')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ healthCenterId: 'HC-A', healthWorkerId: 'wA' });

      expect(res.statusCode).toBe(403);
    });

    it('HC-A cannot escalate HC-B case', async () => {
      Case.findOne.mockResolvedValue({
        caseId: 'CASE-B',
        assignedHealthCenterId: 'mongo-hc-b',
        status: 'ASSIGNED'
      });

      const res = await request(app)
        .post('/api/cases/CASE-B/escalate')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Referral Ownership', () => {
    it('frontend cannot spoof fromHealthCenterId', async () => {
      // Mock create to succeed
      Referral.create.mockResolvedValue({
        referralId: 'REF-1',
        fromHealthCenterId: 'HC-A',
        status: 'PENDING',
        statusHistory: []
      });
      // Mock Case findOne for createReferral validation
      Case.findOne.mockResolvedValue({
        caseId: 'CASE-1',
        status: 'ASSIGNED',
        assignedHealthCenterId: 'mongo-hc-a',
        save: jest.fn()
      });

      const res = await request(app)
        .post('/api/referrals')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          referralId: 'REF-1',
          caseId: 'CASE-1',
          patientId: new mongoose.Types.ObjectId().toString(),
          fromHealthCenterId: 'HC-B', // Attempting to spoof
          toHealthCenterId: 'HC-B', // Dest
          reason: 'Test',
          requiredService: 'GENERAL'
        });
      
      expect(res.statusCode).toBe(201);
      expect(Referral.create).toHaveBeenCalledWith(expect.objectContaining({
        fromHealthCenterId: 'HC-A'
      }));
    });

    it('unrelated HC cannot mutate referral status', async () => {
      Referral.findOne.mockResolvedValue({
        referralId: 'REF-2',
        fromHealthCenterId: 'HC-A',
        toHealthCenterId: 'HC-B',
        status: 'PENDING',
        save: jest.fn()
      });

      // A random token C
      const tokenC = jwt.sign({ userId: 'uC', role: 'HEALTH_WORKER', healthCenterId: 'HC-C' }, process.env.JWT_SECRET || 'fallback_secret_for_tests');

      const res = await request(app)
        .patch('/api/referrals/REF-2/status')
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ status: 'ACCEPTED' });
      
      expect(res.statusCode).toBe(403);
    });

    it('destination HC can accept its incoming referral', async () => {
      Referral.findOne.mockResolvedValue({
        referralId: 'REF-3',
        fromHealthCenterId: 'HC-A',
        toHealthCenterId: 'HC-B',
        status: 'PENDING',
        statusHistory: [],
        save: jest.fn()
      });
      Case.findOne.mockResolvedValue({
        caseId: 'CASE-3',
        status: 'REFERRED',
        save: jest.fn()
      });

      const res = await request(app)
        .patch('/api/referrals/REF-3/status')
        .set('Authorization', `Bearer ${tokenB}`) // Dest HC
        .send({ status: 'ACCEPTED' });
      
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Emergency Ownership', () => {
    it('HC-A cannot access HC-B emergency', async () => {
      EmergencyCase.findOne.mockResolvedValue({
        caseId: 'EMG-B',
        assignedHealthCenterId: 'mongo-hc-b',
        status: 'ALERTED'
      });

      const res = await request(app)
        .post('/api/emergency/EMG-B/acknowledge')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ acknowledgedBy: 'wA' });

      expect(res.statusCode).toBe(403);
    });
  });
});
