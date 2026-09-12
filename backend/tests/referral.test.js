const request = require('supertest');

const mockReferral = {
  create: jest.fn(),
  deleteOne: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn()
};
const mockHealthCenter = {
  findOne: jest.fn()
};
const mockCase = {
  findOne: jest.fn()
};
let mockCaseRecord;

jest.mock('../src/models/Referral', () => mockReferral);
jest.mock('../src/models/HealthCenter', () => mockHealthCenter);
jest.mock('../src/models/Case', () => mockCase);

const { app } = require('../src/app');

const validReferral = {
  referralId: 'REF-001',
  caseId: 'CASE-001',
  patientId: 'PAT-001',
  fromHealthCenterId: 'HC-001',
  toHealthCenterId: 'HC-002',
  reason: 'Cardiology consultation required',
  requiredService: 'CARDIOLOGY',
  requiredEquipment: 'ECG',
  notes: 'Patient requires specialist evaluation'
};

const createdReferral = {
  ...validReferral,
  status: 'PENDING',
  statusHistory: [{ status: 'PENDING', changedAt: '2026-01-01T00:00:00.000Z' }],
  _id: 'referral-id'
};

function referralForStatus(status) {
  const historyByStatus = {
    PENDING: [{ status: 'PENDING', changedAt: new Date('2026-01-01T00:00:00.000Z') }],
    ACCEPTED: [
      { status: 'PENDING', changedAt: new Date('2026-01-01T00:00:00.000Z') },
      { status: 'ACCEPTED', changedAt: new Date('2026-01-02T00:00:00.000Z') }
    ],
    COMPLETED: [
      { status: 'PENDING', changedAt: new Date('2026-01-01T00:00:00.000Z') },
      { status: 'ACCEPTED', changedAt: new Date('2026-01-02T00:00:00.000Z') },
      { status: 'COMPLETED', changedAt: new Date('2026-01-03T00:00:00.000Z') }
    ],
    CANCELLED: [
      { status: 'PENDING', changedAt: new Date('2026-01-01T00:00:00.000Z') },
      { status: 'CANCELLED', changedAt: new Date('2026-01-02T00:00:00.000Z') }
    ]
  };
  return {
    ...createdReferral,
    status,
    statusHistory: historyByStatus[status],
    save: jest.fn().mockResolvedValue(undefined)
  };
}

describe('Referral API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHealthCenter.findOne.mockImplementation(({ healthCenterId }) => Promise.resolve(
      healthCenterId === 'HC-002'
        ? { _id: 'mongo-hc-002', healthCenterId: 'HC-002' }
        : { _id: 'mongo-hc-001', healthCenterId: 'HC-001' }
    ));
    mockCaseRecord = {
      caseId: 'CASE-001',
      patientId: 'PAT-001',
      assignedHealthCenterId: 'mongo-hc-001',
      sourceHealthCenterId: 'mongo-hc-001',
      referredToHealthCenterId: 'mongo-hc-002',
      status: 'ASSIGNED',
      save: jest.fn().mockResolvedValue(undefined)
    };
    mockCase.findOne.mockResolvedValue(mockCaseRecord);
    mockReferral.create.mockResolvedValue(createdReferral);
    mockReferral.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockReferral.findOne.mockResolvedValue(createdReferral);
    mockReferral.find.mockResolvedValue([createdReferral]);
  });

  test('creates a referral with PENDING status', async () => {
    const response = await request(app).post('/api/referrals').send(validReferral);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: validReferral });
    expect(mockReferral.create).toHaveBeenCalledWith(expect.objectContaining({
      ...validReferral,
      status: 'PENDING',
      statusHistory: [{ status: 'PENDING', changedAt: expect.any(Date) }]
    }));
    expect(response.body.data.statusHistory).toHaveLength(1);
    expect(response.body.data.statusHistory[0].status).toBe('PENDING');
    expect(mockCaseRecord.status).toBe('REFERRED');
    expect(mockCaseRecord.referralId).toBe('REF-001');
    expect(mockCaseRecord.referredToHealthCenterId).toBe('mongo-hc-002');
    expect(mockReferral.create).toHaveBeenCalledWith(expect.objectContaining({
      acceptanceDueAt: expect.any(Date),
      status: 'PENDING'
    }));
  });

  test('accepting a referral moves the Case to the destination in progress', async () => {
    const referral = referralForStatus('PENDING');
    mockReferral.findOne.mockResolvedValue(referral);
    mockCaseRecord.status = 'REFERRED';
    mockCaseRecord.referredToHealthCenterId = 'mongo-hc-002';

    const response = await request(app).patch('/api/referrals/REF-001/status').send({ status: 'ACCEPTED' });

    expect(response.status).toBe(200);
    expect(mockCaseRecord.status).toBe('IN_PROGRESS');
    expect(mockCaseRecord.assignedHealthCenterId).toBe('mongo-hc-002');
  });

  test('completing a referral does not resolve the Case', async () => {
    const referral = referralForStatus('ACCEPTED');
    mockReferral.findOne.mockResolvedValue(referral);
    mockCaseRecord.status = 'IN_PROGRESS';
    mockCaseRecord.assignedHealthCenterId = 'mongo-hc-002';

    const response = await request(app).patch('/api/referrals/REF-001/status').send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    expect(mockCaseRecord.status).toBe('IN_PROGRESS');
    expect(mockCaseRecord.assignedHealthCenterId).toBe('mongo-hc-002');
  });

  test('cancelling a pending referral restores the original Case assignment', async () => {
    const referral = referralForStatus('PENDING');
    mockReferral.findOne.mockResolvedValue(referral);
    mockCaseRecord.status = 'REFERRED';
    mockCaseRecord.assignedHealthCenterId = 'mongo-hc-001';

    const response = await request(app).patch('/api/referrals/REF-001/status').send({ status: 'CANCELLED' });

    expect(response.status).toBe(200);
    expect(mockCaseRecord.status).toBe('ASSIGNED');
    expect(mockCaseRecord.assignedHealthCenterId).toBe('mongo-hc-001');
  });

  test('rejects a duplicate referralId with 409', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.code = 11000;
    mockReferral.create.mockRejectedValue(duplicateError);

    const response = await request(app).post('/api/referrals').send(validReferral);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, message: 'referralId already exists' });
  });

  test.each([
    ['patientId', 400],
    ['fromHealthCenterId', 400],
    ['toHealthCenterId', 400]
  ])('rejects missing %s', async (field, status) => {
    const body = { ...validReferral };
    delete body[field];

    const response = await request(app).post('/api/referrals').send(body);

    expect(response.status).toBe(status);
    expect(mockReferral.create).not.toHaveBeenCalled();
  });

  test('returns 404 when the source health centre does not exist', async () => {
    mockHealthCenter.findOne.mockResolvedValueOnce(null);

    const response = await request(app).post('/api/referrals').send(validReferral);

    expect(response.status).toBe(404);
    expect(mockReferral.create).not.toHaveBeenCalled();
  });

  test('returns 404 when the destination health centre does not exist', async () => {
    mockHealthCenter.findOne
      .mockResolvedValueOnce({ healthCenterId: 'HC-001' })
      .mockResolvedValueOnce(null);

    const response = await request(app).post('/api/referrals').send(validReferral);

    expect(response.status).toBe(404);
    expect(mockReferral.create).not.toHaveBeenCalled();
  });

  test('rejects the same source and destination health centre', async () => {
    const response = await request(app).post('/api/referrals').send({
      ...validReferral,
      toHealthCenterId: validReferral.fromHealthCenterId
    });

    expect(response.status).toBe(400);
    expect(mockHealthCenter.findOne).not.toHaveBeenCalled();
  });

  test('gets a referral by referralId', async () => {
    const response = await request(app).get('/api/referrals/REF-001');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: createdReferral });
    expect(mockReferral.findOne).toHaveBeenCalledWith({ referralId: 'REF-001' });
  });

  test('returns 404 for a nonexistent referral', async () => {
    mockReferral.findOne.mockResolvedValue(null);

    const response = await request(app).get('/api/referrals/UNKNOWN');

    expect(response.status).toBe(404);
  });

  test('gets all referrals', async () => {
    const response = await request(app).get('/api/referrals');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [createdReferral] });
    expect(mockReferral.find).toHaveBeenCalledWith({});
  });

  test('filters referrals by status', async () => {
    const response = await request(app).get('/api/referrals?status=PENDING');

    expect(response.status).toBe(200);
    expect(mockReferral.find).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  test('rejects an invalid status', async () => {
    const response = await request(app).get('/api/referrals?status=UNKNOWN');

    expect(response.status).toBe(400);
    expect(mockReferral.find).not.toHaveBeenCalled();
  });

  test.each([
    ['PENDING', 'ACCEPTED'],
    ['PENDING', 'CANCELLED'],
    ['ACCEPTED', 'COMPLETED'],
    ['ACCEPTED', 'CANCELLED']
  ])('updates status from %s to %s', async (currentStatus, requestedStatus) => {
    const referral = referralForStatus(currentStatus);
    mockReferral.findOne.mockResolvedValue(referral);

    const response = await request(app).patch('/api/referrals/REF-001/status').send({ status: requestedStatus });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(requestedStatus);
    expect(referral.statusHistory.at(-1)).toEqual({ status: requestedStatus, changedAt: expect.any(Date) });
    expect(referral.statusHistory.at(-2).changedAt.getTime()).toBeLessThanOrEqual(
      referral.statusHistory.at(-1).changedAt.getTime()
    );
    expect(referral.save).toHaveBeenCalled();
  });

  test.each([
    ['COMPLETED', 'ACCEPTED'],
    ['COMPLETED', 'CANCELLED'],
    ['CANCELLED', 'ACCEPTED'],
    ['CANCELLED', 'COMPLETED'],
    ['PENDING', 'COMPLETED'],
    ['ACCEPTED', 'PENDING']
  ])('rejects invalid transition from %s to %s', async (currentStatus, requestedStatus) => {
    const referral = referralForStatus(currentStatus);
    const initialHistory = referral.statusHistory.map(entry => ({ ...entry }));
    mockReferral.findOne.mockResolvedValue(referral);

    const response = await request(app).patch('/api/referrals/REF-001/status').send({ status: requestedStatus });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Invalid referral status transition' });
    expect(referral.statusHistory).toEqual(initialHistory);
    expect(referral.save).not.toHaveBeenCalled();
  });

  test.each([undefined, 'UNKNOWN'])('rejects status update value %s', async requestedStatus => {
    const referral = referralForStatus('PENDING');
    mockReferral.findOne.mockResolvedValue(referral);
    const body = requestedStatus === undefined ? {} : { status: requestedStatus };

    const response = await request(app).patch('/api/referrals/REF-001/status').send(body);

    expect(response.status).toBe(400);
    expect(referral.save).not.toHaveBeenCalled();
  });

  test('returns 404 when updating a nonexistent referral', async () => {
    mockReferral.findOne.mockResolvedValue(null);

    const response = await request(app).patch('/api/referrals/UNKNOWN/status').send({ status: 'ACCEPTED' });

    expect(response.status).toBe(404);
  });

  test('GET referral returns status history', async () => {
    const response = await request(app).get('/api/referrals/REF-001');

    expect(response.status).toBe(200);
    expect(response.body.data.statusHistory).toHaveLength(1);
    expect(response.body.data.statusHistory[0].status).toBe('PENDING');
  });
});
