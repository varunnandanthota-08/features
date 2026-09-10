const {
  checkEscalations,
  eligibleEmergencyQuery,
  startEscalationMonitor,
  stopEscalationMonitor,
  isEscalationMonitorRunning
} = require('../src/services/escalation.monitor');

function overdueCase(overrides = {}) {
  return {
    caseId: 'EMG-MONITOR-1',
    type: 'EMERGENCY',
    priority: 'CRITICAL',
    status: 'ALERTED',
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    acknowledgedAt: null,
    assignedHealthCenterId: 'hc-a',
    escalationLevel: 0,
    escalationStatus: 'NOT_ESCALATED',
    escalationHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('escalation monitor', () => {
  afterEach(() => {
    stopEscalationMonitor();
    jest.useRealTimers();
  });

  test('queries only assigned, active, unacknowledged, level-zero cases', () => {
    expect(eligibleEmergencyQuery()).toEqual({
      status: { $in: ['REGISTERED', 'ALERTED', 'RESPONDING'] },
      assignedHealthCenterId: { $ne: null },
      acknowledgedAt: null,
      escalationLevel: 0,
      escalationStatus: { $nin: ['ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION', 'RESOLVED'] }
    });
  });

  test('automatically escalates an overdue emergency without assigning a fake target', async () => {
    const record = overdueCase();
    const caseModel = { find: jest.fn().mockResolvedValue([record]) };
    const logger = { log: jest.fn(), error: jest.fn() };

    const escalated = await checkEscalations({
      caseModel,
      now: new Date('2026-09-10T10:02:01.000Z'),
      logger,
      targetSelector: async () => ({ healthCenter: null, facility: null })
    });

    expect(escalated).toEqual([record]);
    expect(record).toMatchObject({
      escalationLevel: 1,
      escalationStatus: 'ESCALATED',
      escalationReason: 'No acknowledgement within SLA',
      escalatedToHealthCenterId: null,
      escalatedToHealthWorkerId: null
    });
    expect(record.escalationHistory).toHaveLength(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('EMG-MONITOR-1'));
  });

  test('automatically persists the next real Health Centre when the selector finds one', async () => {
    const record = overdueCase({ caseId: 'EMG-MONITOR-2' });
    const caseModel = { find: jest.fn().mockResolvedValue([record]) };
    const targetSelector = jest.fn().mockResolvedValue({
      healthCenter: { _id: 'hc-b', healthCenterId: 'HC-002', name: 'Backup Centre' },
      facility: { healthCenterId: 'HC-002', name: 'Backup Centre' }
    });

    await checkEscalations({
      caseModel,
      now: new Date('2026-09-10T10:02:01.000Z'),
      targetSelector,
      logger: { log: jest.fn(), error: jest.fn() }
    });

    expect(record.escalatedToHealthCenterId).toBe('hc-b');
    expect(record.escalationHistory[0].escalatedToHealthCenterId).toBe('hc-b');
  });

  test('monitors an overdue normal Case with the normal SLA', async () => {
    const record = overdueCase({
      caseId: 'CASE-MONITOR-1',
      type: 'CASE',
      priority: 'NORMAL',
      status: 'ASSIGNED',
      createdAt: new Date('2026-09-10T10:00:00.000Z')
    });
    const normalCaseModel = { find: jest.fn().mockResolvedValue([record]) };
    const targetSelector = jest.fn().mockResolvedValue({
      healthCenter: { _id: 'hc-b' },
      facility: { healthCenterId: 'HC-002', name: 'Backup Centre' }
    });

    const result = await checkEscalations({
      emergencyCaseModel: { find: jest.fn().mockResolvedValue([]) },
      normalCaseModel,
      now: new Date('2026-09-10T10:30:01.000Z'),
      normalTargetSelector: targetSelector,
      targetSelector: async () => ({ healthCenter: null }),
      logger: { log: jest.fn(), error: jest.fn() }
    });

    expect(result).toEqual([record]);
    expect(record.escalationLevel).toBe(1);
    expect(targetSelector).toHaveBeenCalledWith(record);
  });

  test.each([
    ['under SLA', overdueCase({ createdAt: new Date('2026-09-10T10:01:00.000Z') })],
    ['acknowledged', overdueCase({ acknowledgedAt: new Date('2026-09-10T10:01:00.000Z') })],
    ['resolved', overdueCase({ status: 'RESOLVED' })],
    ['already escalated', overdueCase({ escalationLevel: 1, escalationStatus: 'ESCALATED' })]
  ])('does not escalate %s cases', async (label, record) => {
    const caseModel = { find: jest.fn().mockResolvedValue([record]) };
    await expect(checkEscalations({
      caseModel,
      now: new Date('2026-09-10T10:02:01.000Z'),
      logger: { log: jest.fn(), error: jest.fn() }
    })).resolves.toEqual([]);
    expect(record.save).not.toHaveBeenCalled();
  });

  test('starts once, runs on a controlled interval, and stops cleanly', async () => {
    jest.useFakeTimers();
    const check = jest.fn().mockResolvedValue([]);
    const firstTimer = startEscalationMonitor({ intervalMs: 1000, check });
    const secondTimer = startEscalationMonitor({ intervalMs: 1000, check });

    expect(firstTimer).toBe(secondTimer);
    expect(isEscalationMonitorRunning()).toBe(true);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);

    stopEscalationMonitor();
    expect(isEscalationMonitorRunning()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});