const mongoose = require('mongoose');
const Referral = require('../models/Referral');
const Case = require('../models/Case');
const EmergencyCase = require('../models/EmergencyCase');
const HealthCenter = require('../models/HealthCenter');
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
  const trimmedCaseId = body.caseId?.trim();
  let caseRecord = await Case.findOne({ caseId: trimmedCaseId });
  let isEmergency = false;
  let emergencyRecord = null;

  if (!caseRecord) {
    emergencyRecord = await EmergencyCase.findOne({ caseId: trimmedCaseId });
    if (emergencyRecord) {
      isEmergency = true;
    } else {
      throw validationError('Case not found', 404);
    }
  }

  if (!sourceHealthCenter || !destinationHealthCenter) throw validationError('Health centres are required');

  if (isEmergency) {
    if (!sameId(emergencyRecord.assignedHealthCenterId, sourceHealthCenter._id)) {
      throw validationError('Source health centre is not assigned to this emergency', 409);
    }
    if (emergencyRecord.status === 'RESOLVED') {
      throw validationError('Resolved emergency cannot be referred');
    }

    const excludedIds = new Set();
    if (emergencyRecord.assignedHealthCenterId) excludedIds.add(String(emergencyRecord.assignedHealthCenterId));
    if (emergencyRecord.referredFacilityId) excludedIds.add(String(emergencyRecord.referredFacilityId));
    if (emergencyRecord.sourceHealthCenterId) excludedIds.add(String(emergencyRecord.sourceHealthCenterId));
    if (emergencyRecord.escalatedFromHealthCenterId) excludedIds.add(String(emergencyRecord.escalatedFromHealthCenterId));
    if (emergencyRecord.escalatedToHealthCenterId) excludedIds.add(String(emergencyRecord.escalatedToHealthCenterId));
    if (Array.isArray(emergencyRecord.escalationHistory)) {
      emergencyRecord.escalationHistory.forEach(h => {
        if (h.escalatedFromHealthCenterId) excludedIds.add(String(h.escalatedFromHealthCenterId));
        if (h.escalatedToHealthCenterId) excludedIds.add(String(h.escalatedToHealthCenterId));
      });
    }

    const destIdStr = String(destinationHealthCenter._id);
    const destCodeStr = String(destinationHealthCenter.healthCenterId);
    if (excludedIds.has(destIdStr) || excludedIds.has(destCodeStr)) {
      throw validationError('Cannot refer emergency to a previously assigned or source health centre', 400);
    }

    if (destinationHealthCenter.emergencyAvailable !== true) {
      throw validationError('Destination health centre does not provide emergency care', 400);
    }
    const availableCapacity = destinationHealthCenter.capacity - (destinationHealthCenter.currentPatientLoad || 0);
    if (availableCapacity <= 0) {
      throw validationError('Destination health centre has no available capacity', 400);
    }

    const referralData = {
      ...body,
      status: 'PENDING',
      acceptanceDueAt: new Date(Date.now() + (Number(process.env.EMERGENCY_ESCALATION_SLA_MINUTES) || 5) * 60 * 1000),
      statusHistory: [{ status: 'PENDING', changedAt: new Date() }]
    };
    const referral = await Referral.create(referralData);

    const now = new Date();
    const slaMinutes = Number(process.env.EMERGENCY_ESCALATION_SLA_MINUTES) || 5;
    const historyEntry = {
      level: (emergencyRecord.escalationLevel || 0) + 1,
      status: 'ESCALATED',
      reason: `Manual referral by health worker: ${body.reason || 'Referred to suitable facility'}`,
      escalatedAt: now,
      escalatedFromHealthCenterId: sourceHealthCenter._id,
      escalatedToHealthCenterId: destinationHealthCenter._id,
      escalatedToHealthWorkerId: null
    };

    emergencyRecord.assignedHealthCenterId = destinationHealthCenter._id;
    emergencyRecord.referredFacilityId = destinationHealthCenter._id;
    if (!emergencyRecord.sourceHealthCenterId) {
      emergencyRecord.sourceHealthCenterId = sourceHealthCenter._id;
    }
    emergencyRecord.status = 'ALERTED';
    emergencyRecord.assignmentStatus = 'ASSIGNED';
    emergencyRecord.escalationStatus = 'ESCALATED';
    emergencyRecord.escalationLevel = historyEntry.level;
    emergencyRecord.escalatedAt = now;
    emergencyRecord.escalationReason = historyEntry.reason;
    emergencyRecord.escalatedFromHealthCenterId = sourceHealthCenter._id;
    emergencyRecord.escalatedToHealthCenterId = destinationHealthCenter._id;
    emergencyRecord.escalationHistory = [...(emergencyRecord.escalationHistory || []), historyEntry];
    emergencyRecord.emergencyEscalationDueAt = new Date(now.getTime() + slaMinutes * 60 * 1000);
    emergencyRecord.acknowledgedAt = null;
    emergencyRecord.acknowledgedBy = null;
    emergencyRecord.acknowledgedByWorkerId = null;
    emergencyRecord.acknowledgedByHealthCenterId = null;

    await emergencyRecord.save();
    return referral;
  }

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
  const caseRecord = await Case.findOne({ caseId: referral.caseId })
    || await EmergencyCase.findOne({ caseId: referral.caseId });
  if (!caseRecord) throw validationError('Case not found', 404);

  const excludedIds = new Set();
  if (referral.fromHealthCenterId) excludedIds.add(String(referral.fromHealthCenterId));
  if (referral.toHealthCenterId) excludedIds.add(String(referral.toHealthCenterId));
  if (referral.escalatedFromHealthCenterId) excludedIds.add(String(referral.escalatedFromHealthCenterId));
  if (referral.escalatedToHealthCenterId) excludedIds.add(String(referral.escalatedToHealthCenterId));
  if (Array.isArray(referral.escalationHistory)) {
    referral.escalationHistory.forEach(h => {
      if (h.escalatedFromHealthCenterId) excludedIds.add(String(h.escalatedFromHealthCenterId));
      if (h.escalatedToHealthCenterId) excludedIds.add(String(h.escalatedToHealthCenterId));
    });
  }
  if (caseRecord.sourceHealthCenterId) excludedIds.add(String(caseRecord.sourceHealthCenterId));
  if (caseRecord.assignedHealthCenterId) excludedIds.add(String(caseRecord.assignedHealthCenterId));
  if (caseRecord.referredToHealthCenterId) excludedIds.add(String(caseRecord.referredToHealthCenterId));

  return findSuitableHealthCenter({
    location: caseRecord.location,
    village: null,
    excludeHealthCenterId: Array.from(excludedIds),
    service: referral.requiredService,
    equipment: referral.requiredEquipment,
    emergency: caseRecord.type === 'EMERGENCY'
  });
}

async function escalatePendingReferral(referral, now = new Date(), { targetSelector = findReferralEscalationTarget } = {}) {
  if (referral.status !== 'PENDING'
    || !referral.acceptanceDueAt
    || new Date(referral.acceptanceDueAt).getTime() > new Date(now).getTime()) return null;

  const target = await targetSelector(referral);
  const targetHealthCenter = target?.healthCenter || null;
  const level = (referral.escalationLevel || 0) + 1;
  const escalatedAt = new Date(now);

  if (targetHealthCenter) {
    referral.escalationStatus = 'ESCALATED';
    referral.escalationLevel = level;
    referral.escalatedAt = escalatedAt;
    referral.escalatedFromHealthCenterId = referral.toHealthCenterId;
    referral.escalatedToHealthCenterId = targetHealthCenter.healthCenterId;
    referral.escalationHistory = [...(referral.escalationHistory || []), {
      level,
      status: 'ESCALATED',
      escalatedAt,
      escalatedFromHealthCenterId: referral.toHealthCenterId,
      escalatedToHealthCenterId: targetHealthCenter.healthCenterId
    }];
    referral.toHealthCenterId = targetHealthCenter.healthCenterId;
    referral.acceptanceDueAt = new Date(escalatedAt.getTime() + REFERRAL_ACCEPTANCE_SLA_MINUTES * 60 * 1000);

    const caseRecord = await Case.findOne({ caseId: referral.caseId });
    if (caseRecord) {
      caseRecord.referredToHealthCenterId = targetHealthCenter?._id || caseRecord.referredToHealthCenterId;
      await caseRecord.save();
    }
  } else {
    referral.escalationStatus = 'ESCALATED';
    referral.escalationLevel = level;
    referral.escalatedAt = escalatedAt;
    referral.escalatedFromHealthCenterId = referral.toHealthCenterId;
    referral.escalatedToHealthCenterId = null;
    referral.escalationHistory = [...(referral.escalationHistory || []), {
      level,
      status: 'ESCALATED',
      escalatedAt,
      escalatedFromHealthCenterId: referral.toHealthCenterId,
      escalatedToHealthCenterId: null
    }];
    referral.acceptanceDueAt = null;
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

  let caseRecord = await Case.findOne({ caseId: referral.caseId });
  let emergencyRecord = null;
  if (!caseRecord) {
    emergencyRecord = await EmergencyCase.findOne({ caseId: referral.caseId });
  }
  if (!caseRecord && !emergencyRecord) throw validationError('Case not found', 404);

  const previousReferralStatus = referral.status;
  const previousHistory = Array.isArray(referral.statusHistory)
    ? referral.statusHistory.map(entry => ({ ...entry }))
    : [];

  referral.status = requestedStatus;
  if (!Array.isArray(referral.statusHistory)) referral.statusHistory = [];
  referral.statusHistory.push({ status: requestedStatus, changedAt: new Date() });

  if (emergencyRecord) {
    if (requestedStatus === 'ACCEPTED') {
      emergencyRecord.status = 'ACKNOWLEDGED';
      emergencyRecord.acknowledgedAt = new Date();
      await emergencyRecord.save();
    }
    await referral.save();
    return referral;
  }

  const previousCase = {
    status: caseRecord.status,
    assignedHealthCenterId: caseRecord.assignedHealthCenterId
  };

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
