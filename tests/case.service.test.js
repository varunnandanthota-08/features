const mockCaseCreate = jest.fn();
const mockCaseFind = jest.fn();
const mockCaseFindOne = jest.fn();
const mockPatientFindById = jest.fn();
const mockHealthCenterFindById = jest.fn();
const mockFindByPhone = jest.fn();
const mockFindSuitableHealthCenter = jest.fn();
const mockEscalateCase = jest.fn();

jest.mock('../src/models/Case', () => ({
  create: mockCaseCreate,
  find: mockCaseFind,
  findOne: mockCaseFindOne
}));
jest.mock('../src/models/Patient', () => ({ findById: mockPatientFindById }));
jest.mock('../src/models/HealthCenter', () => ({ findById: mockHealthCenterFindById }));
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
      save: jest.fn().mockResolvedValue(undefined)
    };
    mockCaseFindOne.mockResolvedValue(record);
    await acknowledgeCase('CASE-1');
    expect(record.status).toBe('ACKNOWLEDGED');
    expect(record.acknowledgedAt).toBeInstanceOf(Date);

    record.status = 'IN_PROGRESS';
    await resolveCase('CASE-1');
    expect(record.status).toBe('RESOLVED');
    expect(record.resolvedAt).toBeInstanceOf(Date);
  });
});