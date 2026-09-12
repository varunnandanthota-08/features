const ESCALATION_SLA_MINUTES = Object.freeze({
  EMERGENCY: Number(process.env.EMERGENCY_ESCALATION_SLA_MINUTES) || 2,
  NORMAL: Number(process.env.NORMAL_ESCALATION_SLA_MINUTES) || 30
});

const ESCALATION_STATUSES = Object.freeze({
  NOT_ESCALATED: 'NOT_ESCALATED',
  ESCALATED: 'ESCALATED',
  ACKNOWLEDGED_AFTER_ESCALATION: 'ACKNOWLEDGED_AFTER_ESCALATION',
  RESOLVED: 'RESOLVED'
});

function caseCategory(caseRecord) {
  return caseRecord?.type === 'EMERGENCY' || caseRecord?.priority === 'CRITICAL'
    ? 'EMERGENCY'
    : 'NORMAL';
}

function acknowledgementDate(caseRecord) {
  return caseRecord?.acknowledgedAt ? new Date(caseRecord.acknowledgedAt) : null;
}

function shouldEscalate(caseRecord, now = new Date()) {
  const currentTime = new Date(now);
  const createdAt = new Date(caseRecord?.createdAt);
  const slaMinutes = ESCALATION_SLA_MINUTES[caseCategory(caseRecord)];
  const alreadyEscalated = Number(caseRecord?.escalationLevel || 0) > 0
    || caseRecord?.escalationStatus === ESCALATION_STATUSES.ESCALATED
    || caseRecord?.escalationStatus === ESCALATION_STATUSES.ACKNOWLEDGED_AFTER_ESCALATION;
  const acknowledged = Boolean(acknowledgementDate(caseRecord))
    || ['ACKNOWLEDGED', 'RESPONDING'].includes(caseRecord?.status);
  const referred = caseRecord?.status === 'REFERRED';
  const resolved = caseRecord?.status === 'RESOLVED'
    || caseRecord?.escalationStatus === ESCALATION_STATUSES.RESOLVED;
  const elapsedMinutes = Number.isFinite(createdAt.getTime())
    ? (currentTime.getTime() - createdAt.getTime()) / 60000
    : 0;
  const overdue = elapsedMinutes >= slaMinutes;

  return {
    shouldEscalate: !alreadyEscalated && !acknowledged && !referred && !resolved && overdue,
    alreadyEscalated,
    acknowledged,
    referred,
    resolved,
    overdue,
    category: caseCategory(caseRecord),
    slaMinutes,
    elapsedMinutes,
    reason: overdue ? 'No acknowledgement within SLA' : 'SLA not exceeded'
  };
}

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function escalateCase(caseRecord, now = new Date(), { targetSelector = null } = {}) {
  if (!caseRecord || typeof caseRecord.save !== 'function') {
    throw validationError('A valid case is required');
  }
  const decision = shouldEscalate(caseRecord, now);
  if (decision.alreadyEscalated) throw validationError('Case has already been escalated', 409);
  if (decision.resolved) throw validationError('Resolved case cannot be escalated');
  if (decision.acknowledged) throw validationError('Acknowledged case cannot be escalated', 409);
  if (!decision.shouldEscalate) throw validationError('Case SLA has not been exceeded', 409);

  const target = targetSelector ? await targetSelector(caseRecord) : null;
  const targetHealthCenter = target?.healthCenter || null;
  const escalatedAt = new Date(now);
  const historyEntry = {
    level: (caseRecord.escalationLevel || 0) + 1,
    status: ESCALATION_STATUSES.ESCALATED,
    reason: decision.reason,
    escalatedAt,
    escalatedFromHealthCenterId: caseRecord.assignedHealthCenterId || null,
    escalatedToHealthCenterId: targetHealthCenter?._id || null,
    escalatedToHealthWorkerId: null
  };
  caseRecord.escalationStatus = ESCALATION_STATUSES.ESCALATED;
  caseRecord.escalationLevel = historyEntry.level;
  caseRecord.escalatedAt = escalatedAt;
  caseRecord.escalationReason = decision.reason;
  caseRecord.escalatedFromHealthCenterId = historyEntry.escalatedFromHealthCenterId;
  caseRecord.escalatedToHealthCenterId = targetHealthCenter?._id || null;
  caseRecord.escalatedToHealthWorkerId = null;
  caseRecord.escalationHistory = [...(caseRecord.escalationHistory || []), historyEntry];
  await caseRecord.save();

  return {
    case: caseRecord,
    decision,
    targetSelectionRequired: !targetHealthCenter,
    escalatedTo: target?.facility || null
  };
}

module.exports = {
  ESCALATION_SLA_MINUTES,
  ESCALATION_STATUSES,
  caseCategory,
  shouldEscalate,
  escalateCase
};
