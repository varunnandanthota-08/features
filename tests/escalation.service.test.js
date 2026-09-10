const {
  ESCALATION_SLA_MINUTES,
  ESCALATION_STATUSES,
  shouldEscalate,
  escalateCase
} = require('../src/services/escalation.service');

function emergency(overrides = {}) {
  return {
    type: 'EMERGENCY',
    priority: 'CRITICAL',
    status: 'ALERTED',
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    acknowledgedAt: null,
    escalationLevel: 0,
    escalationStatus: ESCALATION_STATUSES.NOT_ESCALATED,
    assignedHealthCenterId: 'hc-a',
    escalationHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('shared escalation service', () => {
  const afterEmergencySla = new Date('2026-09-10T10:02:01.000Z');
  const beforeEmergencySla = new Date('2026-09-10T10:01:59.000Z');

  test('uses centralized configurable SLA values', () => {
    expect(ESCALATION_SLA_MINUTES).toMatchObject({ EMERGENCY: 2, NORMAL: 30 });
  });

  test('does not escalate an emergency under SLA', () => {
    expect(shouldEscalate(emergency(), beforeEmergencySla).shouldEscalate).toBe(false);
  });

  test('escalates an emergency over SLA and records level/reason/time', async () => {
    const record = emergency();
    const result = await escalateCase(record, afterEmergencySla);

    expect(result.targetSelectionRequired).toBe(true);
    expect(record).toMatchObject({
      escalationStatus: 'ESCALATED',
      escalationLevel: 1,
      escalationReason: 'No acknowledgement within SLA',
      escalatedAt: afterEmergencySla,
      escalatedFromHealthCenterId: 'hc-a',
      escalatedToHealthCenterId: null,
      escalatedToHealthWorkerId: null
    });
    expect(record.escalationHistory).toHaveLength(1);
    expect(record.save).toHaveBeenCalledTimes(1);
  });

  test('persists a real escalation target and records from/to history', async () => {
    const record = emergency({ assignedHealthCenterId: 'hc-a' });
    const targetSelector = jest.fn().mockResolvedValue({
      healthCenter: { _id: 'hc-b', healthCenterId: 'HC-002', name: 'Backup Centre' },
      facility: { healthCenterId: 'HC-002', name: 'Backup Centre' }
    });

    const result = await escalateCase(record, afterEmergencySla, { targetSelector });

    expect(result.targetSelectionRequired).toBe(false);
    expect(record.escalatedToHealthCenterId).toBe('hc-b');
    expect(record.escalationHistory[0]).toMatchObject({
      escalatedFromHealthCenterId: 'hc-a',
      escalatedToHealthCenterId: 'hc-b'
    });
  });

  test.each([
    ['acknowledged', emergency({ acknowledgedAt: new Date('2026-09-10T10:01:00.000Z') })],
    ['responding', emergency({ status: 'RESPONDING' })],
    ['resolved', emergency({ status: 'RESOLVED' })],
    ['already escalated', emergency({ escalationLevel: 1, escalationStatus: 'ESCALATED' })]
  ])('does not escalate %s', (label, record) => {
    expect(shouldEscalate(record, afterEmergencySla).shouldEscalate).toBe(false);
  });

  test('uses the longer normal-case SLA', () => {
    const record = emergency({ type: 'COMPLAINT', priority: 'NORMAL' });
    expect(shouldEscalate(record, new Date('2026-09-10T10:29:59.000Z')).shouldEscalate).toBe(false);
    expect(shouldEscalate(record, new Date('2026-09-10T10:30:01.000Z')).shouldEscalate).toBe(true);
  });

  test('rejects repeated escalation without adding a second level', async () => {
    const record = emergency();
    await escalateCase(record, afterEmergencySla);
    await expect(escalateCase(record, new Date('2026-09-10T10:05:00.000Z')))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(record.escalationHistory).toHaveLength(1);
  });
});