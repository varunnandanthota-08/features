const request = require('supertest');
const { app } = require('../src/app');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/User');
jest.mock('bcryptjs');

describe('Auth Password Update Flow', () => {
  const mockUserId = 'user-patient-123';
  const token = jwt.sign(
    { userId: mockUserId, username: 'testpatient', role: 'PATIENT' },
    process.env.JWT_SECRET || 'fallback_secret_for_tests'
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123'
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects mismatched new and confirm password with 400', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'differentpassword'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/match/i);
  });

  test('rejects incorrect current password with 400', async () => {
    const mockUser = {
      _id: mockUserId,
      username: 'testpatient',
      password: 'hashed_old_password',
      save: jest.fn().mockResolvedValue(true)
    };
    User.findById.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/current password is incorrect/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  test('successfully updates password when current password is valid', async () => {
    const mockUser = {
      _id: mockUserId,
      username: 'testpatient',
      password: 'hashed_old_password',
      save: jest.fn().mockResolvedValue(true)
    };
    User.findById.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.genSalt.mockResolvedValue('salt10');
    bcrypt.hash.mockResolvedValue('hashed_new_password');

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'correctoldpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/password updated successfully/i);
    expect(mockUser.password).toBe('hashed_new_password');
    expect(mockUser.save).toHaveBeenCalled();
  });

  test('new password actually works for subsequent login', async () => {
    // After password was updated to 'hashed_new_password'
    User.findOne.mockResolvedValue({
      _id: mockUserId,
      username: 'testpatient',
      role: 'PATIENT',
      password: 'hashed_new_password'
    });

    // Login with new password succeeds
    bcrypt.compare.mockImplementation(async (plain, hashed) => {
      return plain === 'newpassword123' && hashed === 'hashed_new_password';
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testpatient',
        password: 'newpassword123'
      });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.token).toBeDefined();

    // Login with old password fails
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testpatient',
        password: 'oldpassword'
      });

    expect(oldLoginRes.statusCode).toBe(401);
    expect(oldLoginRes.body.success).toBe(false);
  });
});
