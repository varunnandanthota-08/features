const mockCaseCreate = jest.fn();
const mockCaseFind = jest.fn();
const mockCaseFindOne = jest.fn();
const mockPatientFindById = jest.fn();
const mockHealthCenterFindById = jest.fn();
const mockHealthCenterFindOne = jest.fn();
const mockFindByPhone = jest.fn();
const mockFindSuitableHealthCenter = jest.fn();
const mockEscalateCase = jest.fn();

jest.mock('../src/models/Case', () => ({
  create: mockCaseCreate,
  find: mockCaseFind,
  findOne: mockCaseFindOne
}));
jest.mock('../src/models/Patient', () => ({ findById: mockPatientFindById }));
jest.mock('../src/models/HealthCenter', () => ({ findById: mockHealthCenterFindById, findOne: mockHealthCenterFindOne }));
jest.mock('../src/services/patient.service', () => ({ findByPhone: mockFindByPhone }));
jest.mock('../src/services/emergency.service', () => ({ findSuitableHealthCenter: mockFindSuitableHealthCenter }));
jest.mock('../src/services/escalation.service', () => ({
  escalateCase: mockEscalateCase,
  ESCALATION_STATUSES: {
    ESCALATED: 'ESCALATED',
    ACKNOWLEDGED_AFTER_ESCALATION: 'ACKNOWLEDGED_AFTER_ESCALATION',
    RESOLVED: 'RESOLVED'
  }
}));

const { createCase, acknowledgeCase, resolveCase } = require('../src/services/case.service');

describe('normal case service', () => {
  beforeEach(() => {
    mockCaseCreate.mockReset();
    mockCaseFind.mockReset();
    mockCaseFindOne.mockReset();
    mockPatientFindById.mockReset();
    mockHealthCenterFindById.mockReset();
    mockHealthCenterFindOne.mockReset();
    mockFindByPhone.mockReset();
    mockFindSuitableHealthCenter.mockReset();
    mockFindByPhone.mockResolvedValue({ _id: 'patient-1', location: { village: 'Rampur' } });
    mockFindSuitableHealthCenter.mockResolvedValue({
      healthCenter: { _id: 'hc-1' },
      facility: { healthCenterId: 'HC-001', name: 'Community Health Centre J' }
    });
    mockCaseCreate.mockImplementation(async data => ({ _id: 'case-1', ...data }));
  });

  test('creates and assigns a normal complaint case', async () => {
    const result = await createCase({
      phone: '+919392123042',
      source: 'WHATSAPP',
      complaint: 'Persistent fever'
    });

    expect(result.case).toMatchObject({
      source: 'WHATSAPP',
      complaint: 'Persistent fever',
      assignedHealthCenterId: 'hc-1',
      sourceHealthCenterId: 'hc-1',
      status: 'ASSIGNED'
    });
    expect(mockFindSuitableHealthCenter).toHaveBeenCalledWith({
      location: undefined,
      village: 'Rampur'
    });
  });

  test('acknowledges and resolves a normal case', async () => {
    const record = {
      status: 'ASSIGNED',
      escalationStatus: 'NOT_ESCALATED',
      assignedHealthCenterId: 'hc-1',
      save: jest.fn().mockResolvedValue(undefined)
    };
    mockCaseFindOne.mockResolvedValue(record);
    mockHealthCenterFindOne.mockResolvedValue({ _id: 'hc-1', healthCenterId: 'HC-001' });
    await acknowledgeCase('CASE-1', { healthCenterId: 'HC-001', healthWorkerId: 'worker-1' });
    expect(record.status).toBe('ACKNOWLEDGED');
    expect(record.acknowledgedAt).toBeInstanceOf(Date);
    expect(record.acknowledgedByHealthCenterId).toBe('hc-1');
    expect(record.acknowledgedByWorkerId).toBe('worker-1');

    record.status = 'IN_PROGRESS';
    await resolveCase('CASE-1');
    expect(record.status).toBe('RESOLVED');
    expect(record.resolvedAt).toBeInstanceOf(Date);
  });

  test('only the escalation target can acknowledge an escalated case', async () => {
    const record = {
      status: 'ASSIGNED',
      escalationStatus: 'ESCALATED',
      escalatedToHealthCenterId: 'hc-b',
      assignedHealthCenterId: 'hc-a',
      save: jest.fn().mockResolvedValue(undefined)
    };
    mockCaseFindOne.mockResolvedValue(record);
    mockHealthCenterFindOne.mockImplementation(async ({ healthCenterId }) => ({
      _id: healthCenterId === 'HC-B' ? 'hc-b' : 'hc-a',
      healthCenterId
    }));

    await expect(acknowledgeCase('CASE-ESCALATED', {
      healthCenterId: 'HC-A', healthWorkerId: 'worker-a'
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(record.save).not.toHaveBeenCalled();

    await acknowledgeCase('CASE-ESCALATED', {
      healthCenterId: 'HC-B', healthWorkerId: 'worker-b'
    });
    expect(record.acknowledgedByHealthCenterId).toBe('hc-b');
    expect(record.escalationStatus).toBe('ACKNOWLEDGED_AFTER_ESCALATION');
  });

  test('only the destination can acknowledge a referral-transferred case', async () => {
    const record = {
      status: 'IN_PROGRESS',
      escalationStatus: 'NOT_ESCALATED',
      assignedHealthCenterId: 'hc-b',
      sourceHealthCenterId: 'hc-a',
      referredToHealthCenterId: 'hc-b',
      save: jest.fn().mockResolvedValue(undefined)
    };
    mockCaseFindOne.mockResolvedValue(record);
    mockHealthCenterFindOne.mockImplementation(async ({ healthCenterId }) => ({
      _id: healthCenterId === 'HC-B' ? 'hc-b' : 'hc-a',
      healthCenterId
    }));

    await expect(acknowledgeCase('CASE-REFERRED', {
      healthCenterId: 'HC-A', healthWorkerId: 'worker-a'
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(record.save).not.toHaveBeenCalled();
  });
});