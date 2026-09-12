const request = require('supertest');
const { app } = require('../src/app');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');

jest.mock('../src/models/User');
jest.mock('bcryptjs');

describe('Auth Endpoints (Mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new health worker', async () => {
      User.findOne.mockResolvedValue(null);
      bcrypt.genSalt.mockResolvedValue('salt');
      bcrypt.hash.mockResolvedValue('hashedpassword');
      
      const mockSave = jest.fn().mockResolvedValue(true);
      User.mockImplementation(() => ({
        _id: 'user123',
        username: 'hw_user',
        role: 'HEALTH_WORKER',
        healthCenterId: 'HC-123',
        save: mockSave
      }));

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'hw_user',
          password: 'password123',
          role: 'HEALTH_WORKER',
          healthCenterId: 'HC-123'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('hw_user');
      expect(res.body.data.password).toBeUndefined();
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      User.findOne.mockResolvedValue({
        _id: 'user123',
        username: 'testuser',
        role: 'PATIENT',
        patientId: 'patient123',
        password: 'hashedpassword'
      });
      bcrypt.compare.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.data.username).toBe('testuser');
      expect(res.body.data.password).toBeUndefined();
    });

    it('should reject invalid credentials', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
    });
  });
});

