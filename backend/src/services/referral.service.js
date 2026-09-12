const Referral = require('../models/Referral');
const Case = require('../models/Case');
const { findSuitableHealthCenter } = require('./emergency.service');

const REFERRAL_ACCEPTANCE_SLA_MINUTES = Number(process.env.REFERRAL_ACCEPTANCE_SLA_MINUTES) || 30;

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sameId(first, second) {
  return first !== null && first !== undefined
    && second !== null && second !== undefined
    && String(first) === String(second);
}

async function createReferralWithCase(body, { sourceHealthCenter, destinationHealthCenter } = {}) {
  const caseRecord = await Case.findOne({ caseId: body.caseId.trim() });
  if (!caseRecord) throw validationError('Case not found', 404);
  if (!sourceHealthCenter || !destinationHealthCenter) throw validationError('Health centres are required');
  if (!sameId(caseRecord.assignedHealthCenterId, sourceHealthCenter._id)) {
    throw validationError('Source health centre is not assigned to this case', 409);
  }
  if (caseRecord.status === 'RESOLVED') throw validationError('Resolved case cannot be referred');
  if (caseRecord.referralId) throw validationError('Case already has a referral', 409);

  const referralData = {
    ...body,
    status: 'PENDING',
    acceptanceDueAt: new Date(Date.now() + REFERRAL_ACCEPTANCE_SLA_MINUTES * 60 * 1000),
    statusHistory: [{ status: 'PENDING', changedAt: new Date() }]
  };
  const referral = await Referral.create(referralData);

  const previousCase = {
    status: caseRecord.status,
    sourceHealthCenterId: caseRecord.sourceHealthCenterId,
    referredToHealthCenterId: caseRecord.referredToHealthCenterId,
    referralId: caseRecord.referralId,
    referredAt: caseRecord.referredAt
  };

  try {
    caseRecord.status = 'REFERRED';
    caseRecord.sourceHealthCenterId = sourceHealthCenter._id;
    caseRecord.referredToHealthCenterId = destinationHealthCenter._id;
    caseRecord.referralId = referral.referralId;
    caseRecord.referredAt = new Date();
    await caseRecord.save();
  } catch (error) {
    try {
      await Referral.deleteOne({ referralId: referral.referralId });
    } catch (_) {
      // Preserve the original failure; the caller still receives an error.
    }
    Object.assign(caseRecord, previousCase);
    throw error;
  }

  return referral;
}

async function findReferralEscalationTarget(referral) {
  const caseRecord = await Case.findOne({ caseId: referral.caseId });
  if (!caseRecord) throw validationError('Case not found', 404);
  return findSuitableHealthCenter({
    location: caseRecord.location,
    village: null,
    excludeHealthCenterId: referral.toHealthCenterId,
    service: referral.requiredService,
    equipment: referral.requiredEquipment
  });
}

async function escalatePendingReferral(referral, now = new Date(), { targetSelector = findReferralEscalationTarget } = {}) {
  if (referral.status !== 'PENDING'
    || !referral.acceptanceDueAt
    || new Date(referral.acceptanceDueAt).getTime() > new Date(now).getTime()
    || referral.escalationStatus === 'ESCALATED') return null;

  const target = await targetSelector(referral);
  const targetHealthCenter = target?.healthCenter || null;
  const level = (referral.escalationLevel || 0) + 1;
  const escalatedAt = new Date(now);
  referral.escalationStatus = 'ESCALATED';
  referral.escalationLevel = level;
  referral.escalatedAt = escalatedAt;
  referral.escalatedFromHealthCenterId = referral.toHealthCenterId;
  referral.escalatedToHealthCenterId = targetHealthCenter?.healthCenterId || null;
  referral.escalationHistory = [...(referral.escalationHistory || []), {
    level,
    status: 'ESCALATED',
    escalatedAt,
    escalatedFromHealthCenterId: referral.toHealthCenterId,
    escalatedToHealthCenterId: targetHealthCenter?.healthCenterId || null
  }];
  if (targetHealthCenter) referral.toHealthCenterId = targetHealthCenter.healthCenterId;

  const caseRecord = await Case.findOne({ caseId: referral.caseId });
  if (caseRecord) {
    caseRecord.referredToHealthCenterId = targetHealthCenter?._id || caseRecord.referredToHealthCenterId;
    await caseRecord.save();
  }
  await referral.save();
  return referral;
}

async function updateReferralStatusWithCase(referral, requestedStatus) {
  if (!referral.caseId) {
    referral.status = requestedStatus;
    if (!Array.isArray(referral.statusHistory)) referral.statusHistory = [];
    referral.statusHistory.push({ status: requestedStatus, changedAt: new Date() });
    await referral.save();
    return referral;
  }

  const caseRecord = await Case.findOne({ caseId: referral.caseId });
  if (!caseRecord) throw validationError('Case not found', 404);

  const previousReferralStatus = referral.status;
  const previousHistory = Array.isArray(referral.statusHistory)
    ? referral.statusHistory.map(entry => ({ ...entry }))
    : [];
  const previousCase = {
    status: caseRecord.status,
    assignedHealthCenterId: caseRecord.assignedHealthCenterId
  };

  referral.status = requestedStatus;
  if (!Array.isArray(referral.statusHistory)) referral.statusHistory = [];
  referral.statusHistory.push({ status: requestedStatus, changedAt: new Date() });

  if (requestedStatus === 'ACCEPTED') {
    caseRecord.status = 'IN_PROGRESS';
    caseRecord.assignedHealthCenterId = caseRecord.referredToHealthCenterId;
  } else if (requestedStatus === 'CANCELLED' && previousReferralStatus === 'PENDING') {
    caseRecord.status = 'ASSIGNED';
    caseRecord.assignedHealthCenterId = caseRecord.sourceHealthCenterId || caseRecord.assignedHealthCenterId;
  }

  try {
    if (requestedStatus === 'ACCEPTED' || (requestedStatus === 'CANCELLED' && previousReferralStatus === 'PENDING')) {
      await caseRecord.save();
    }
    await referral.save();
  } catch (error) {
    referral.status = previousReferralStatus;
    referral.statusHistory = previousHistory;
    Object.assign(caseRecord, previousCase);
    try {
      if (requestedStatus === 'ACCEPTED' || (requestedStatus === 'CANCELLED' && previousReferralStatus === 'PENDING')) {
        await caseRecord.save();
      }
      await referral.save();
    } catch (_) {
      // Preserve the original failure; the caller still receives an error.
    }
    throw error;
  }

  return referral;
}

module.exports = {
  REFERRAL_ACCEPTANCE_SLA_MINUTES,
  createReferralWithCase,
  updateReferralStatusWithCase,
  findReferralEscalationTarget,
  escalatePendingReferral
};
