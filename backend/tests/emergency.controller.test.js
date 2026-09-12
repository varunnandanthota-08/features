const request = require('supertest');

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const mockGetActiveEmergencies = jest.fn();
const mockAcknowledgeEmergency = jest.fn();
const mockEscalateEmergency = jest.fn();
const mockGetEmergencyCase = jest.fn();

jest.mock('../src/services/emergency.service', () => ({
  createEmergencyCase: jest.fn(),
  getActiveEmergencies: mockGetActiveEmergencies,
  acknowledgeEmergency: mockAcknowledgeEmergency,
  escalateEmergency: mockEscalateEmergency,
  resolveEmergency: jest.fn(),
  getEmergencyCase: mockGetEmergencyCase
}));

const { app } = require('../src/app');

describe('emergency dashboard API', () => {
  beforeEach(() => {
    mockGetActiveEmergencies.mockReset();
    mockAcknowledgeEmergency.mockReset();
    mockEscalateEmergency.mockReset();
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
      escalatedFromHealthCenter: { healthCenterId: 'HC-001', name: 'Original Centre' },
      escalationTargetHealthCenter: { healthCenterId: 'HC-002', name: 'Backup Centre' },
      escalationStatus: 'ESCALATED',
      escalationLevel: 1,
      escalatedAt: '2026-09-10T10:02:01.000Z',
      escalatedToHealthCenterId: 'facility-backup',
      createdAt: '2026-09-10T10:00:00.000Z',
      acknowledgedAt: null
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

    expect(response.body.data[0]).toMatchObject({
      escalatedFromHealthCenter: { healthCenterId: 'HC-001' },
      escalationTargetHealthCenter: { healthCenterId: 'HC-002' },
      escalationStatus: 'ESCALATED',
      escalationLevel: 1,
      escalatedToHealthCenterId: 'facility-backup'
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
    expect(mockAcknowledgeEmergency).toHaveBeenCalledWith('EMG-1', 'worker-1', { authorizedHealthCenterId: undefined });
    expect(response.body.data.emergency).toMatchObject({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'worker-1'
    });
  });

  test('returns escalation state through the existing emergency endpoint', async () => {
    mockEscalateEmergency.mockResolvedValueOnce({
      caseId: 'EMG-1',
      status: 'ALERTED',
      escalationStatus: 'ESCALATED',
      escalationLevel: 1,
      escalationReason: 'No acknowledgement within SLA',
      escalatedAt: '2026-09-10T10:02:01.000Z'
    });

    const response = await request(app).post('/api/emergency/EMG-1/escalate');

    expect(response.status).toBe(200);
    expect(mockEscalateEmergency).toHaveBeenCalledWith('EMG-1', { authorizedHealthCenterId: undefined });
    expect(response.body.data.escalation).toMatchObject({
      status: 'ESCALATED',
      level: 1,
      reason: 'No acknowledgement within SLA',
      targetSelectionRequired: true
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