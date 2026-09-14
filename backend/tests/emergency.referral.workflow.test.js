const mongoose = require('mongoose');
const EmergencyCase = require('../src/models/EmergencyCase');
const Case = require('../src/models/Case');
const Referral = require('../src/models/Referral');
const HealthCenter = require('../src/models/HealthCenter');
const Patient = require('../src/models/Patient');

const {
  acknowledgeEmergency,
  findEscalationTarget,
  createEmergencyCase,
  getEmergencyCase
} = require('../src/services/emergency.service');
const { shouldEscalate, escalateCase } = require('../src/services/escalation.service');
const {
  createReferralWithCase,
  findReferralEscalationTarget,
  escalatePendingReferral
} = require('../src/services/referral.service');

describe('Emergency & Referral Workflow Hardened Tests (A - J)', () => {
  let hcAId, hcBId, hcCId, hcDId;
  let hcA, hcB, hcC, hcD;
  let patientId;

  beforeAll(() => {
    hcAId = new mongoose.Types.ObjectId();
    hcBId = new mongoose.Types.ObjectId();
    hcCId = new mongoose.Types.ObjectId();
    hcDId = new mongoose.Types.ObjectId();
    patientId = new mongoose.Types.ObjectId();

    hcA = {
      _id: hcAId,
      healthCenterId: 'HC-001',
      name: 'Centre A',
      capacity: 20,
      currentPatientLoad: 2,
      location: { latitude: 17.385, longitude: 78.486 },
      emergencyAvailable: true
    };
    hcB = {
      _id: hcBId,
      healthCenterId: 'HC-002',
      name: 'Centre B',
      capacity: 20,
      currentPatientLoad: 2,
      location: { latitude: 17.395, longitude: 78.496 },
      emergencyAvailable: true
    };
    hcC = {
      _id: hcCId,
      healthCenterId: 'HC-003',
      name: 'Centre C',
      capacity: 20,
      currentPatientLoad: 2,
      location: { latitude: 17.405, longitude: 78.506 },
      emergencyAvailable: true
    };
    hcD = {
      _id: hcDId,
      healthCenterId: 'HC-004',
      name: 'Centre D',
      capacity: 20,
      currentPatientLoad: 2,
      location: { latitude: 17.415, longitude: 78.516 },
      emergencyAvailable: true
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // A. Emergency acknowledged before 5 minutes -> succeeds.
  test('A. Emergency acknowledged before 5 minutes -> succeeds', async () => {
    const mockCase = {
      caseId: 'EMG-TEST-A',
      status: 'ALERTED',
      escalationStatus: 'NOT_ESCALATED',
      assignedHealthCenterId: hcAId,
      emergencyEscalationDueAt: new Date(Date.now() + 4 * 60 * 1000), // 4 mins remaining
      acknowledgedAt: null,
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(mockCase);
    jest.spyOn(HealthCenter, 'findOne').mockResolvedValue(hcA);

    const result = await acknowledgeEmergency('EMG-TEST-A', 'Dr. Worker', {
      authorizedHealthCenterId: 'HC-001'
    });

    expect(result.status).toBe('ACKNOWLEDGED');
    expect(result.acknowledgedBy).toBe('Dr. Worker');
    expect(result.acknowledgedAt).toBeInstanceOf(Date);
    expect(mockCase.save).toHaveBeenCalledTimes(1);
  });

  // B. Emergency SLA expires -> old centre cannot acknowledge.
  test('B. Emergency SLA expires -> old centre cannot acknowledge', async () => {
    const expiredDueAt = new Date(Date.now() - 10 * 1000); // 10 seconds ago
    const mockCase = {
      caseId: 'EMG-TEST-B',
      status: 'ALERTED',
      escalationStatus: 'NOT_ESCALATED',
      assignedHealthCenterId: hcAId,
      emergencyEscalationDueAt: expiredDueAt,
      acknowledgedAt: null,
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(mockCase);
    jest.spyOn(HealthCenter, 'findOne').mockResolvedValue(hcA);

    await expect(acknowledgeEmergency('EMG-TEST-B', 'Dr. Worker', {
      authorizedHealthCenterId: 'HC-001'
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Emergency SLA has expired'
    });
    expect(mockCase.save).not.toHaveBeenCalled();
  });

  // C. Emergency HC-A -> HC-B after expiry.
  test('C. Emergency HC-A -> HC-B after expiry', async () => {
    const now = new Date('2026-09-10T10:05:01.000Z');
    const mockCase = {
      caseId: 'EMG-TEST-C',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ALERTED',
      createdAt: new Date('2026-09-10T10:00:00.000Z'),
      emergencyEscalationDueAt: new Date('2026-09-10T10:05:00.000Z'),
      assignedHealthCenterId: hcAId,
      sourceHealthCenterId: hcAId,
      escalationLevel: 0,
      escalationStatus: 'NOT_ESCALATED',
      escalationHistory: [],
      save: jest.fn().mockResolvedValue(undefined)
    };

    const targetSelector = jest.fn().mockResolvedValue({
      healthCenter: hcB,
      facility: { healthCenterId: 'HC-002', name: 'Centre B' }
    });

    const result = await escalateCase(mockCase, now, { targetSelector });

    expect(result.case.assignedHealthCenterId).toEqual(hcBId);
    expect(result.case.escalationLevel).toBe(1);
    expect(result.case.escalationStatus).toBe('ESCALATED');
    expect(result.case.emergencyEscalationDueAt).toEqual(new Date('2026-09-10T10:10:01.000Z'));
    expect(result.case.escalationHistory).toHaveLength(1);
    expect(result.case.escalationHistory[0]).toMatchObject({
      level: 1,
      escalatedFromHealthCenterId: hcAId,
      escalatedToHealthCenterId: hcBId
    });
  });

  // D. HC-B expiry -> HC-C, NOT HC-A.
  test('D. HC-B expiry -> HC-C, NOT HC-A', async () => {
    const emergencyDoc = {
      caseId: 'EMG-TEST-D',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ESCALATED',
      assignedHealthCenterId: hcBId,
      sourceHealthCenterId: hcAId,
      escalatedFromHealthCenterId: hcAId,
      escalatedToHealthCenterId: hcBId,
      escalationLevel: 1,
      escalationStatus: 'ESCALATED',
      escalationHistory: [
        { level: 1, escalatedFromHealthCenterId: hcAId, escalatedToHealthCenterId: hcBId }
      ],
      location: { latitude: 17.385, longitude: 78.486 }
    };

    jest.spyOn(HealthCenter, 'find').mockResolvedValue([hcA, hcB, hcC]);

    const target = await findEscalationTarget(emergencyDoc);
    expect(target.healthCenter).not.toBeNull();
    expect(target.healthCenter.healthCenterId).toBe('HC-003');
    expect(target.healthCenter.healthCenterId).not.toBe('HC-001');
    expect(target.healthCenter.healthCenterId).not.toBe('HC-002');
  });

  // E. Three-step emergency escalation excludes all previous centres.
  test('E. Three-step emergency escalation (HC-A -> HC-B -> HC-C -> HC-D) excludes all previous centres', async () => {
    const emergencyDoc = {
      caseId: 'EMG-TEST-E',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ESCALATED',
      assignedHealthCenterId: hcCId,
      sourceHealthCenterId: hcAId,
      escalatedFromHealthCenterId: hcBId,
      escalatedToHealthCenterId: hcCId,
      escalationLevel: 2,
      escalationStatus: 'ESCALATED',
      escalationHistory: [
        { level: 1, escalatedFromHealthCenterId: hcAId, escalatedToHealthCenterId: hcBId },
        { level: 2, escalatedFromHealthCenterId: hcBId, escalatedToHealthCenterId: hcCId }
      ],
      location: { latitude: 17.385, longitude: 78.486 }
    };

    jest.spyOn(HealthCenter, 'find').mockResolvedValue([hcA, hcB, hcC, hcD]);

    const target = await findEscalationTarget(emergencyDoc);
    expect(target.healthCenter).not.toBeNull();
    expect(target.healthCenter.healthCenterId).toBe('HC-004');
  });

  // F. Manual emergency referral works and does not return "case not found".
  test('F. Manual emergency referral works and does not return "case not found"', async () => {
    const emergencyDoc = {
      caseId: 'EMG-MANUAL-F',
      type: 'EMERGENCY',
      patientId,
      assignedHealthCenterId: hcAId,
      sourceHealthCenterId: hcAId,
      status: 'ALERTED',
      escalationLevel: 0,
      escalationStatus: 'NOT_ESCALATED',
      escalationHistory: [],
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(Case, 'findOne').mockResolvedValue(null);
    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(emergencyDoc);
    jest.spyOn(Referral, 'create').mockResolvedValue({
      referralId: 'REF-MANUAL-F',
      caseId: 'EMG-MANUAL-F',
      status: 'PENDING'
    });

    const referral = await createReferralWithCase(
      {
        referralId: 'REF-MANUAL-F',
        caseId: 'EMG-MANUAL-F',
        patientId: String(patientId),
        fromHealthCenterId: 'HC-001',
        toHealthCenterId: 'HC-002',
        reason: 'Requires specialized emergency care'
      },
      { sourceHealthCenter: hcA, destinationHealthCenter: hcB }
    );

    expect(referral).toBeDefined();
    expect(referral.referralId).toBe('REF-MANUAL-F');
  });

  // G. Manual emergency referral transfers ownership correctly.
  test('G. Manual emergency referral transfers ownership to destination centre with fresh SLA', async () => {
    const emergencyDoc = {
      caseId: 'EMG-MANUAL-G',
      type: 'EMERGENCY',
      patientId,
      assignedHealthCenterId: hcAId,
      sourceHealthCenterId: hcAId,
      status: 'ALERTED',
      escalationLevel: 0,
      escalationStatus: 'NOT_ESCALATED',
      escalationHistory: [],
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(Case, 'findOne').mockResolvedValue(null);
    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(emergencyDoc);
    jest.spyOn(Referral, 'create').mockResolvedValue({
      referralId: 'REF-MANUAL-G',
      caseId: 'EMG-MANUAL-G'
    });

    await createReferralWithCase(
      {
        referralId: 'REF-MANUAL-G',
        caseId: 'EMG-MANUAL-G',
        patientId: String(patientId),
        fromHealthCenterId: 'HC-001',
        toHealthCenterId: 'HC-002',
        reason: 'Transferring to HC-B'
      },
      { sourceHealthCenter: hcA, destinationHealthCenter: hcB }
    );

    expect(emergencyDoc.assignedHealthCenterId).toEqual(hcBId);
    expect(emergencyDoc.referredFacilityId).toEqual(hcBId);
    expect(emergencyDoc.status).toBe('ALERTED');
    expect(emergencyDoc.escalationStatus).toBe('ESCALATED');
    expect(emergencyDoc.emergencyEscalationDueAt.getTime()).toBeGreaterThan(Date.now());
    expect(emergencyDoc.escalationHistory).toHaveLength(1);
    expect(emergencyDoc.escalationHistory[0].escalatedToHealthCenterId).toEqual(hcBId);
    expect(emergencyDoc.save).toHaveBeenCalled();
  });

  // H. Old centre cannot acknowledge after manual emergency referral.
  test('H. Old centre cannot acknowledge after manual emergency referral', async () => {
    const transferredEmergency = {
      caseId: 'EMG-TRANSFERRED-H',
      type: 'EMERGENCY',
      status: 'ALERTED',
      assignedHealthCenterId: hcBId, // now owned by HC-B
      escalatedToHealthCenterId: hcBId,
      emergencyEscalationDueAt: new Date(Date.now() + 5 * 60 * 1000),
      acknowledgedAt: null,
      save: jest.fn()
    };

    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(transferredEmergency);
    jest.spyOn(HealthCenter, 'findOne').mockImplementation(({ healthCenterId }) => {
      if (healthCenterId === 'HC-001') return Promise.resolve(hcA);
      if (healthCenterId === 'HC-002') return Promise.resolve(hcB);
      return Promise.resolve(null);
    });

    // HC-A attempts to acknowledge: must be rejected
    await expect(acknowledgeEmergency('EMG-TRANSFERRED-H', 'Dr. Centre A', {
      authorizedHealthCenterId: 'HC-001'
    })).rejects.toMatchObject({
      statusCode: 403
    });

    // HC-B acknowledges: succeeds
    const ack = await acknowledgeEmergency('EMG-TRANSFERRED-H', 'Dr. Centre B', {
      authorizedHealthCenterId: 'HC-002'
    });
    expect(ack.status).toBe('ACKNOWLEDGED');
  });

  // I. Normal referral SLA escalation does not return to source/current/previous centre.
  test('I. Normal referral SLA escalation does not return to source, current, or previous centre', async () => {
    const referral = {
      referralId: 'REF-NORMAL-I',
      caseId: 'CASE-I',
      status: 'PENDING',
      fromHealthCenterId: 'HC-001',
      toHealthCenterId: 'HC-002',
      escalationLevel: 1,
      escalationStatus: 'ESCALATED',
      escalationHistory: [
        { level: 1, escalatedFromHealthCenterId: 'HC-001', escalatedToHealthCenterId: 'HC-002' }
      ],
      acceptanceDueAt: new Date(Date.now() - 1000),
      save: jest.fn().mockResolvedValue(undefined)
    };

    const caseDoc = {
      caseId: 'CASE-I',
      location: { latitude: 17.385, longitude: 78.486 },
      sourceHealthCenterId: hcAId,
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(Case, 'findOne').mockResolvedValue(caseDoc);
    jest.spyOn(HealthCenter, 'find').mockResolvedValue([hcA, hcB, hcC]);

    const target = await findReferralEscalationTarget(referral);
    expect(target.healthCenter).not.toBeNull();
    expect(target.healthCenter.healthCenterId).toBe('HC-003');
  });

  // J. No suitable new centre does not create an escalation loop.
  test('J. No suitable new centre does not create an escalation loop for emergency or referral', async () => {
    // 1. Emergency when all centres have been used
    const emergencyDoc = {
      caseId: 'EMG-EXHAUSTED',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ESCALATED',
      assignedHealthCenterId: hcCId,
      sourceHealthCenterId: hcAId,
      escalationLevel: 2,
      escalationStatus: 'ESCALATED',
      escalationHistory: [
        { level: 1, escalatedFromHealthCenterId: hcAId, escalatedToHealthCenterId: hcBId },
        { level: 2, escalatedFromHealthCenterId: hcBId, escalatedToHealthCenterId: hcCId }
      ],
      location: { latitude: 17.385, longitude: 78.486 },
      emergencyEscalationDueAt: new Date(Date.now() - 1000),
      save: jest.fn().mockResolvedValue(undefined)
    };

    // Only centres A, B, C exist
    jest.spyOn(HealthCenter, 'find').mockResolvedValue([hcA, hcB, hcC]);

    const target = await findEscalationTarget(emergencyDoc);
    expect(target.healthCenter).toBeNull();

    // Now escalate with no target available
    const escalatedResult = await escalateCase(emergencyDoc, new Date(), {
      targetSelector: async () => ({ healthCenter: null, facility: null })
    });

    expect(escalatedResult.case.escalatedToHealthCenterId).toBeNull();
    expect(escalatedResult.case.status).toBe('ESCALATED');
    expect(escalatedResult.case.assignmentStatus).toBe('ASSIGNMENT_PENDING');
    expect(escalatedResult.case.emergencyEscalationDueAt).toBeNull(); // stops infinite loop

    // 2. Normal referral when all centres have been used
    const referral = {
      referralId: 'REF-EXHAUSTED',
      caseId: 'CASE-EXHAUSTED',
      status: 'PENDING',
      fromHealthCenterId: 'HC-001',
      toHealthCenterId: 'HC-003',
      escalationLevel: 2,
      escalationStatus: 'ESCALATED',
      escalationHistory: [
        { level: 1, escalatedFromHealthCenterId: 'HC-001', escalatedToHealthCenterId: 'HC-002' },
        { level: 2, escalatedFromHealthCenterId: 'HC-002', escalatedToHealthCenterId: 'HC-003' }
      ],
      acceptanceDueAt: new Date(Date.now() - 1000),
      save: jest.fn().mockResolvedValue(undefined)
    };

    const escalatedRef = await escalatePendingReferral(referral, new Date(), {
      targetSelector: async () => ({ healthCenter: null })
    });

    expect(escalatedRef.toHealthCenterId).toBe('HC-003'); // not looped back to HC-001 or HC-002
    expect(escalatedRef.escalatedToHealthCenterId).toBeNull();
    expect(escalatedRef.acceptanceDueAt).toBeNull(); // stops infinite loop
  });
});
