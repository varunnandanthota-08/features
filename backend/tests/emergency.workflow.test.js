const mongoose = require('mongoose');
const EmergencyCase = require('../src/models/EmergencyCase');
const HealthCenter = require('../src/models/HealthCenter');
const Patient = require('../src/models/Patient');
const {
  createEmergencyCase,
  acknowledgeEmergency,
  findEscalationTarget,
  getActiveEmergencies,
  getEmergencyCase,
  resolveEmergency
} = require('../src/services/emergency.service');
const { shouldEscalate, escalateCase, ESCALATION_SLA_MINUTES } = require('../src/services/escalation.service');
const { checkEscalations } = require('../src/services/escalation.monitor');

describe('Emergency Alarm & 5-minute Escalation/Acknowledgement Workflow', () => {
  let hcAId;
  let hcBId;
  let patientId;

  beforeAll(() => {
    hcAId = new mongoose.Types.ObjectId();
    hcBId = new mongoose.Types.ObjectId();
    patientId = new mongoose.Types.ObjectId();
  });

  test('1. Emergency SLA is configured to exactly 5 minutes', () => {
    expect(ESCALATION_SLA_MINUTES.EMERGENCY).toBe(5);
    expect(ESCALATION_SLA_MINUTES.NORMAL).toBe(30);
  });

  test('2. Newly created emergency starts in ALERTED status with 5-minute deadline', async () => {
    const mockSave = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Patient, 'findById').mockResolvedValue({
      _id: patientId,
      name: 'Ramu',
      phone: '+919876543210',
      location: { latitude: 17.385, longitude: 78.486 }
    });
    jest.spyOn(HealthCenter, 'find').mockResolvedValue([
      {
        _id: hcAId,
        healthCenterId: 'HC-001',
        name: 'Primary Health Centre A',
        capacity: 10,
        currentPatientLoad: 2,
        location: { latitude: 17.385, longitude: 78.486 },
        emergencyAvailable: true
      }
    ]);

    const beforeCreate = Date.now();
    jest.spyOn(EmergencyCase, 'create').mockImplementation(async (doc) => ({
      ...doc,
      save: mockSave
    }));

    const result = await createEmergencyCase({
      patientId: patientId.toString(),
      source: 'PHONE_IVR',
      reason: 'Severe chest pain and difficulty breathing'
    });

    expect(result.emergency.status).toBe('ALERTED');
    expect(result.emergency.escalationStatus).toBe('NOT_ESCALATED');
    expect(result.emergency.assignedHealthCenterId).toEqual(hcAId);
    expect(result.emergency.emergencyEscalationDueAt).toBeInstanceOf(Date);

    const deadlineMs = result.emergency.emergencyEscalationDueAt.getTime();
    expect(deadlineMs).toBeGreaterThanOrEqual(beforeCreate + 5 * 60 * 1000 - 1000);
    expect(deadlineMs).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);

    Patient.findById.mockRestore();
    HealthCenter.find.mockRestore();
    EmergencyCase.create.mockRestore();
  });

  test('3. Emergency acknowledgement does not require manual worker ID and updates fields', async () => {
    const mockCase = {
      caseId: 'EMG-ACK-1',
      status: 'ALERTED',
      escalationStatus: 'NOT_ESCALATED',
      assignedHealthCenterId: hcAId,
      acknowledgedAt: null,
      acknowledgedBy: null,
      save: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(mockCase);
    jest.spyOn(HealthCenter, 'findOne').mockResolvedValue({
      _id: hcAId,
      healthCenterId: 'HC-001'
    });

    const ack = await acknowledgeEmergency('EMG-ACK-1', 'Dr. Ramesh', {
      authorizedHealthCenterId: 'HC-001',
      workerId: 'worker-123'
    });

    expect(ack.status).toBe('ACKNOWLEDGED');
    expect(ack.acknowledgedBy).toBe('Dr. Ramesh');
    expect(ack.acknowledgedByWorkerId).toBe('worker-123');
    expect(ack.acknowledgedByHealthCenterId).toEqual(hcAId);
    expect(ack.acknowledgedAt).toBeInstanceOf(Date);
    expect(mockCase.save).toHaveBeenCalled();

    EmergencyCase.findOne.mockRestore();
    HealthCenter.findOne.mockRestore();
  });

  test('4. Escalation exclusion prevents selecting the same HC or any past HC', async () => {
    const pastHc1 = new mongoose.Types.ObjectId();
    const pastHc2 = new mongoose.Types.ObjectId();
    const newTargetHc = new mongoose.Types.ObjectId();

    const emergencyDoc = {
      assignedHealthCenterId: pastHc1,
      escalatedFromHealthCenterId: pastHc2,
      escalationHistory: [
        { escalatedFromHealthCenterId: pastHc2, escalatedToHealthCenterId: pastHc1 }
      ],
      location: { latitude: 17.385, longitude: 78.486 }
    };

    jest.spyOn(HealthCenter, 'find').mockResolvedValue([
      {
        _id: pastHc1,
        healthCenterId: 'HC-001',
        name: 'Centre 1',
        capacity: 20,
        currentPatientLoad: 2,
        location: { latitude: 17.385, longitude: 78.486 },
        emergencyAvailable: true
      },
      {
        _id: pastHc2,
        healthCenterId: 'HC-002',
        name: 'Centre 2',
        capacity: 20,
        currentPatientLoad: 2,
        location: { latitude: 17.385, longitude: 78.486 },
        emergencyAvailable: true
      },
      {
        _id: newTargetHc,
        healthCenterId: 'HC-003',
        name: 'Centre 3 Backup',
        capacity: 15,
        currentPatientLoad: 5,
        location: { latitude: 17.390, longitude: 78.490 },
        emergencyAvailable: true
      }
    ]);

    const target = await findEscalationTarget(emergencyDoc);
    expect(target.healthCenter).not.toBeNull();
    expect(String(target.healthCenter._id)).toBe(String(newTargetHc));
    expect(String(target.healthCenter._id)).not.toBe(String(pastHc1));
    expect(String(target.healthCenter._id)).not.toBe(String(pastHc2));

    HealthCenter.find.mockRestore();
  });

  test('5. Should escalate only after 5 minutes has elapsed', () => {
    const baseTime = new Date('2026-09-10T10:00:00.000Z');
    const emergencyDoc = {
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ALERTED',
      createdAt: baseTime,
      emergencyEscalationDueAt: new Date('2026-09-10T10:05:00.000Z'),
      escalationLevel: 0,
      escalationStatus: 'NOT_ESCALATED',
      acknowledgedAt: null
    };

    const beforeSla = new Date('2026-09-10T10:04:59.000Z');
    const afterSla = new Date('2026-09-10T10:05:01.000Z');

    expect(shouldEscalate(emergencyDoc, beforeSla).shouldEscalate).toBe(false);
    expect(shouldEscalate(emergencyDoc, afterSla).shouldEscalate).toBe(true);
  });

  test('6. Escalation reassigns ownership to target HC and sets new 5-minute deadline', async () => {
    const createdAt = new Date('2026-09-10T10:00:00.000Z');
    const escalateTime = new Date('2026-09-10T10:05:01.000Z');

    const emergencyDoc = {
      caseId: 'EMG-ESC-1',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      status: 'ALERTED',
      createdAt,
      assignedHealthCenterId: hcAId,
      escalationLevel: 0,
      escalationStatus: 'NOT_ESCALATED',
      escalationHistory: [],
      acknowledgedAt: null,
      save: jest.fn().mockResolvedValue(undefined)
    };

    const targetSelector = jest.fn().mockResolvedValue({
      healthCenter: { _id: hcBId, healthCenterId: 'HC-002', name: 'Centre B' },
      facility: { healthCenterId: 'HC-002', name: 'Centre B' }
    });

    const result = await escalateCase(emergencyDoc, escalateTime, { targetSelector });

    expect(result.case.status).toBe('ESCALATED');
    expect(result.case.escalationStatus).toBe('ESCALATED');
    expect(result.case.escalationLevel).toBe(1);
    expect(result.case.escalatedFromHealthCenterId).toEqual(hcAId);
    expect(result.case.escalatedToHealthCenterId).toEqual(hcBId);
    expect(result.case.assignedHealthCenterId).toEqual(hcBId);
    expect(result.case.emergencyEscalationDueAt).toEqual(new Date(escalateTime.getTime() + 5 * 60 * 1000));
  });

  test('7. Active emergencies query filters out escalated-away emergencies for source HC', async () => {
    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          caseId: 'EMG-ACTIVE-1',
          status: 'ALERTED',
          assignedHealthCenterId: hcAId,
          escalationStatus: 'NOT_ESCALATED',
          patientId,
          toObject: function() { return this; }
        }
      ])
    });
    jest.spyOn(EmergencyCase, 'find').mockImplementation(mockFind);
    jest.spyOn(HealthCenter, 'findOne').mockResolvedValue({
      _id: hcAId,
      healthCenterId: 'HC-001'
    });
    jest.spyOn(Patient, 'findById').mockResolvedValue({ name: 'Patient 1' });
    jest.spyOn(HealthCenter, 'findById').mockResolvedValue({ name: 'HC-001' });

    const results = await getActiveEmergencies({ authorizedHealthCenterId: 'HC-001' });

    expect(results).toHaveLength(1);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
      status: { $in: ['ALERTED', 'ACKNOWLEDGED', 'RESPONDING', 'ESCALATED'] },
      $or: [
        {
          assignedHealthCenterId: hcAId,
          $or: [
            { escalationStatus: { $ne: 'ESCALATED' } },
            { escalatedToHealthCenterId: null },
            { escalatedToHealthCenterId: hcAId }
          ]
        },
        {
          escalatedToHealthCenterId: hcAId,
          escalationStatus: 'ESCALATED'
        }
      ]
    }));

    EmergencyCase.find.mockRestore();
    HealthCenter.findOne.mockRestore();
    Patient.findById.mockRestore();
    HealthCenter.findById.mockRestore();
  });

  test('8. Authorization denies access to unrelated health centre', async () => {
    const unrelatedHcId = new mongoose.Types.ObjectId();
    const mockCase = {
      caseId: 'EMG-AUTH-1',
      assignedHealthCenterId: hcAId,
      escalatedToHealthCenterId: null
    };
    jest.spyOn(EmergencyCase, 'findOne').mockResolvedValue(mockCase);
    jest.spyOn(HealthCenter, 'findOne').mockResolvedValue({
      _id: unrelatedHcId,
      healthCenterId: 'HC-UNRELATED'
    });

    await expect(getEmergencyCase('EMG-AUTH-1', { authorizedHealthCenterId: 'HC-UNRELATED' }))
      .rejects.toThrow('Health centre is not authorized to access this emergency case');

    EmergencyCase.findOne.mockRestore();
    HealthCenter.findOne.mockRestore();
  });
});
