const EmergencyCase = require('../models/EmergencyCase');
const Case = require('../models/Case');
const { shouldEscalate, escalateCase } = require('./escalation.service');
const { findEscalationTarget } = require('./emergency.service');
const { findEscalationTarget: findNormalEscalationTarget } = require('./case.service');

const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;
const ESCALATION_CHECK_INTERVAL_MS = Number(process.env.ESCALATION_CHECK_INTERVAL_MS) > 0
  ? Number(process.env.ESCALATION_CHECK_INTERVAL_MS)
  : DEFAULT_CHECK_INTERVAL_MS;
const activeEmergencyStatuses = ['REGISTERED', 'ALERTED', 'RESPONDING'];
const activeCaseStatuses = ['NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS'];

let monitorTimer = null;

function eligibleEmergencyQuery() {
  return {
    status: { $in: activeEmergencyStatuses },
    assignedHealthCenterId: { $ne: null },
    acknowledgedAt: null,
    escalationLevel: 0,
    escalationStatus: { $nin: ['ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION', 'RESOLVED'] }
  };
}

function eligibleCaseQuery() {
  return {
    status: { $in: activeCaseStatuses },
    assignedHealthCenterId: { $ne: null },
    acknowledgedAt: null,
    escalationLevel: 0,
    escalationStatus: { $nin: ['ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION', 'RESOLVED'] }
  };
}

async function checkEscalations({
  caseModel = null,
  emergencyCaseModel = EmergencyCase,
  normalCaseModel = Case,
  now = new Date(),
  logger = console,
  targetSelector = findEscalationTarget,
  normalTargetSelector = findNormalEscalationTarget
} = {}) {
  const emergencyModel = caseModel || emergencyCaseModel;
  const emergencyCandidates = await emergencyModel.find(eligibleEmergencyQuery());
  const normalCandidates = caseModel || !normalCaseModel ? [] : await normalCaseModel.find(eligibleCaseQuery());
  const escalated = [];

  for (const caseRecord of [...emergencyCandidates, ...normalCandidates]) {
    const decision = shouldEscalate(caseRecord, now);
    if (!decision.shouldEscalate) continue;
    const selector = caseRecord.type === 'EMERGENCY' ? targetSelector : normalTargetSelector;
    const result = await escalateCase(caseRecord, now, { targetSelector: selector });
    escalated.push(result.case);
    logger.log(`[Escalation] Auto-escalated ${caseRecord.type === 'EMERGENCY' ? 'emergency' : 'case'} ${caseRecord.caseId} at level ${result.case.escalationLevel}`);
  }

  return escalated;
}

function startEscalationMonitor({
  intervalMs = ESCALATION_CHECK_INTERVAL_MS,
  check = checkEscalations,
  logger = console
} = {}) {
  if (monitorTimer) return monitorTimer;
  const runCheck = () => {
    check({ logger }).catch(error => logger.error('[Escalation] Monitor check failed:', error.message));
  };
  monitorTimer = setInterval(runCheck, intervalMs);
  if (typeof monitorTimer.unref === 'function') monitorTimer.unref();
  return monitorTimer;
}

function stopEscalationMonitor() {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
}

function isEscalationMonitorRunning() {
  return Boolean(monitorTimer);
}

module.exports = {
  DEFAULT_CHECK_INTERVAL_MS,
  ESCALATION_CHECK_INTERVAL_MS,
  activeEmergencyStatuses,
  activeCaseStatuses,
  eligibleEmergencyQuery,
  eligibleCaseQuery,
  checkEscalations,
  startEscalationMonitor,
  stopEscalationMonitor,
  isEscalationMonitorRunning
};
