const request = require('supertest');

const mockGetActiveEmergencies = jest.fn();
const mockAcknowledgeEmergency = jest.fn();
const mockGetEmergencyCase = jest.fn();

jest.mock('../src/services/emergency.service', () => ({
  createEmergencyCase: jest.fn(),
  getActiveEmergencies: mockGetActiveEmergencies,
  acknowledgeEmergency: mockAcknowledgeEmergency,
  escalateEmergency: jest.fn(),
  resolveEmergency: jest.fn(),
  getEmergencyCase: mockGetEmergencyCase
}));

const { app } = require('../src/app');

describe('emergency dashboard API', () => {
  beforeEach(() => {
    mockGetActiveEmergencies.mockReset();
    mockAcknowledgeEmergency.mockReset();
    mockGetEmergencyCase.mockReset();
  });

  test('returns active emergencies with immediate-attention indication', async () => {
    mockGetActiveEmergencies.mockResolvedValueOnce([{
      caseId: 'EMG-1',
      patient: { _id: 'patient-1', name: 'Ravi Kumar' },
      reason: 'Chest pain',
      source: 'PHONE_IVR',
      priority: 'CRITICAL',
      status: 'ALERTED',
      location: { latitude: 17.4, longitude: 78.4 },
      selectedHealthCenter: { name: 'Emergency Centre' },
      createdAt: '2026-09-10T10:00:00.000Z',
      acknowledgedAt: null,
      escalationLevel: 0
    }]);

    const response = await request(app).get('/api/emergency/active');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      requiresImmediateAttention: true,
      data: [{
        caseId: 'EMG-1',
        patient: { name: 'Ravi Kumar' },
        location: { latitude: 17.4, longitude: 78.4 },
        selectedHealthCenter: { name: 'Emergency Centre' }
      }]
    });
  });

  test('acknowledges an emergency through the dashboard endpoint', async () => {
    mockAcknowledgeEmergency.mockResolvedValueOnce({
      caseId: 'EMG-1',
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'worker-1',
      acknowledgedAt: '2026-09-10T10:05:00.000Z',
      priority: 'CRITICAL'
    });

    const response = await request(app)
      .post('/api/emergency/EMG-1/acknowledge')
      .send({ acknowledgedBy: 'worker-1' });

    expect(response.status).toBe(200);
    expect(mockAcknowledgeEmergency).toHaveBeenCalledWith('EMG-1', 'worker-1');
    expect(response.body.data.emergency).toMatchObject({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'worker-1'
    });
  });

  test('returns the normal not-found response for an invalid case', async () => {
    const error = new Error('Emergency case not found');
    error.statusCode = 404;
    mockGetEmergencyCase.mockRejectedValueOnce(error);

    const response = await request(app).get('/api/emergency/UNKNOWN');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Emergency case not found' });
  });
});