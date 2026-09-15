const crypto = require('crypto');
const mongoose = require('mongoose');
const Case = require('../models/Case');
const Patient = require('../models/Patient');
const HealthCenter = require('../models/HealthCenter');
const Referral = require('../models/Referral');
const { findByPhone } = require('./patient.service');
const { findSuitableHealthCenter } = require('./emergency.service');
const { escalateCase, ESCALATION_STATUSES } = require('./escalation.service');

const activeCaseStatuses = ['NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REFERRED'];
const caseSources = new Set(['PHONE_IVR', 'WHATSAPP', 'SMS', 'DASHBOARD']);

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resolvePatient({ patientId, phone, patientData } = {}) {
  if (patientId) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) throw validationError('patientId must be a valid identifier');
    const existing = await Patient.findById(patientId);
    if (existing) return existing;
  }
  const phoneToUse = typeof phone === 'string' && phone.trim() ? phone.trim() : (patientData?.phone ? String(patientData.phone).trim() : '');
  if (phoneToUse) {
    let patient = await findByPhone(phoneToUse);
    if (!patient && patientData) {
      patient = await Patient.create({
        phone: phoneToUse,
        name: patientData.name || null,
        age: patientData.age ? Number(patientData.age) : null,
        gender: patientData.gender || null,
        location: { village: patientData.village || null },
        language: patientData.language || 'en',
        source: 'DASHBOARD'
      });
    }
    return patient;
  }
  if (patientData && patientData.name) {
    const tempPhone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
    return Patient.create({
      phone: tempPhone,
      name: patientData.name,
      age: patientData.age ? Number(patientData.age) : null,
      gender: patientData.gender || null,
      location: { village: patientData.village || null },
      language: patientData.language || 'en',
      source: 'DASHBOARD'
    });
  }
  throw validationError('patientId or phone is required');
}

function realLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : {};
}

async function createCase({ patientId, phone, source, complaint, location, patientData } = {}) {
  if (!caseSources.has(source)) throw validationError('source is invalid');
  if (typeof complaint !== 'string' || !complaint.trim()) throw validationError('complaint is required');
  const patient = await resolvePatient({ patientId, phone, patientData });
  if (!patient) throw Object.assign(new Error('Patient not found'), { statusCode: 404 });

  let normalizedLocation = realLocation(location || patient.location);
  const villageText = location?.village || patient.location?.village || patientData?.village || null;

  if (normalizedLocation.latitude === undefined && villageText) {
    try {
      const { geocodeLocation } = require('./geocoding.service');
      const geocoded = await geocodeLocation(villageText);
      if (geocoded && geocoded.latitude !== undefined && geocoded.longitude !== undefined) {
        normalizedLocation = { latitude: geocoded.latitude, longitude: geocoded.longitude };
        if (patient && (!patient.location?.latitude || !patient.location?.longitude)) {
          patient.location = {
            ...(patient.location || {}),
            village: patient.location?.village || villageText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude
          };
          await patient.save();
        }
      }
    } catch (_) {}
  }

  const selected = await findSuitableHealthCenter({
    location: normalizedLocation.latitude === undefined ? undefined : normalizedLocation,
    village: villageText
  });
  const record = await Case.create({
    caseId: `CASE-${crypto.randomUUID()}`,
    patientId: patient._id,
    source,
    complaint: complaint.trim(),
    location: normalizedLocation,
    assignedHealthCenterId: selected.healthCenter?._id || null,
    sourceHealthCenterId: selected.healthCenter?._id || null,
    status: selected.healthCenter ? 'ASSIGNED' : 'NEW'
  });
  return { case: record, patient, selectedFacility: selected.facility };
}

async function getActiveCases({ caseModel = Case, authorizedHealthCenterId } = {}) {
  const query = { status: { $in: activeCaseStatuses } };
  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    if (!hc) return [];
    query.$or = [
      {
        assignedHealthCenterId: hc._id,
        status: { $ne: 'REFERRED' },
        $or: [
          { escalationStatus: { $ne: 'ESCALATED' } },
          { escalatedToHealthCenterId: null },
          { escalatedToHealthCenterId: hc._id }
        ]
      },
      {
        escalatedToHealthCenterId: hc._id,
        escalationStatus: 'ESCALATED'
      }
    ];
  } else {
    return [];
  }
  const records = await caseModel.find(query).sort({ createdAt: -1 });
  return Promise.all(records.map(async record => {
    const plain = typeof record.toObject === 'function' ? record.toObject() : record;
    const [patient, assignedHealthCenter, escalationTargetHealthCenter] = await Promise.all([
      Patient.findById(plain.patientId),
      plain.assignedHealthCenterId ? HealthCenter.findById(plain.assignedHealthCenterId) : null,
      plain.escalatedToHealthCenterId ? HealthCenter.findById(plain.escalatedToHealthCenterId) : null
    ]);
    return {
      ...plain,
      kind: 'CASE',
      patient,
      assignedHealthCenter,
      selectedHealthCenter: assignedHealthCenter,
      escalatedFromHealthCenter: assignedHealthCenter,
      escalationTargetHealthCenter,
      targetSelectionRequired: plain.escalationStatus === 'ESCALATED' && !plain.escalatedToHealthCenterId && !plain.escalatedToHealthWorkerId,
      escalationTargetMessage: plain.escalationStatus === 'ESCALATED' && !plain.escalatedToHealthCenterId && !plain.escalatedToHealthWorkerId
        ? 'Escalation required - target selection pending' : null
    };
  }));
}

async function getCase(caseId) {
  const record = await Case.findOne({ caseId });
  if (!record) throw Object.assign(new Error('Case not found'), { statusCode: 404 });
  return record;
}

async function getCaseDetails(caseId, { authorizedHealthCenterId } = {}) {
  const record = await Case.findOne({ caseId });
  if (!record) throw Object.assign(new Error('Case not found'), { statusCode: 404 });

  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    if (!hc) throw Object.assign(new Error('Health centre not found'), { statusCode: 404 });
    const hcIdStr = String(hc._id);
    const isAssigned = record.assignedHealthCenterId && String(record.assignedHealthCenterId) === hcIdStr;
    const isSource = record.sourceHealthCenterId && String(record.sourceHealthCenterId) === hcIdStr;
    const isReferredTo = record.referredToHealthCenterId && String(record.referredToHealthCenterId) === hcIdStr;
    const isEscalatedTo = record.escalatedToHealthCenterId && String(record.escalatedToHealthCenterId) === hcIdStr;
    if (!isAssigned && !isSource && !isReferredTo && !isEscalatedTo) {
      throw Object.assign(new Error('Unauthorized to access this case'), { statusCode: 403 });
    }
  }

  const plain = typeof record.toObject === 'function' ? record.toObject() : record;
  const [patient, assignedHealthCenter, sourceHealthCenter, referredToHealthCenter, escalationTargetHealthCenter, referral] = await Promise.all([
    Patient.findById(plain.patientId),
    plain.assignedHealthCenterId ? HealthCenter.findById(plain.assignedHealthCenterId) : null,
    plain.sourceHealthCenterId ? HealthCenter.findById(plain.sourceHealthCenterId) : null,
    plain.referredToHealthCenterId ? HealthCenter.findById(plain.referredToHealthCenterId) : null,
    plain.escalatedToHealthCenterId ? HealthCenter.findById(plain.escalatedToHealthCenterId) : null,
    plain.referralId ? Referral.findOne({ referralId: plain.referralId }) : null
  ]);

  const targetSelectionRequired = plain.escalationStatus === 'ESCALATED' && !plain.escalatedToHealthCenterId && !plain.escalatedToHealthWorkerId;

  return {
    ...plain,
    kind: 'CASE',
    patient,
    assignedHealthCenter,
    selectedHealthCenter: assignedHealthCenter,
    sourceHealthCenter,
    referredToHealthCenter,
    escalationTargetHealthCenter,
    referral,
    escalation: {
      status: plain.escalationStatus || 'NOT_ESCALATED',
      level: plain.escalationLevel || 0,
      reason: plain.escalationReason || null,
      escalatedAt: plain.escalatedAt || null,
      targetSelectionRequired,
      targetMessage: targetSelectionRequired ? 'Escalation required - target selection pending' : null
    }
  };
}

async function acknowledgeCase(caseId, { healthCenterId, healthWorkerId } = {}) {
  const record = await getCase(caseId);
  if (typeof healthCenterId !== 'string' || !healthCenterId.trim()) {
    throw validationError('healthCenterId is required');
  }
  if (typeof healthWorkerId !== 'string' || !healthWorkerId.trim()) {
    throw validationError('healthWorkerId is required');
  }
  if (record.status === 'RESOLVED') throw validationError('Resolved case cannot be acknowledged');
  const actingHealthCenter = await HealthCenter.findOne({ healthCenterId: healthCenterId.trim() });
  if (!actingHealthCenter) throw Object.assign(new Error('Health centre not found'), { statusCode: 404 });
  const expectedHealthCenterId = record.escalationStatus === ESCALATION_STATUSES.ESCALATED
    ? record.escalatedToHealthCenterId
    : record.assignedHealthCenterId;
  if (!expectedHealthCenterId || String(expectedHealthCenterId) !== String(actingHealthCenter._id)) {
    throw validationError('Health centre is not authorized to acknowledge this case', 403);
  }
  record.status = 'ACKNOWLEDGED';
  record.acknowledgedAt = new Date();
  record.acknowledgedByHealthCenterId = actingHealthCenter._id;
  record.acknowledgedByWorkerId = healthWorkerId.trim();
  if (record.escalationStatus === ESCALATION_STATUSES.ESCALATED) record.escalationStatus = ESCALATION_STATUSES.ACKNOWLEDGED_AFTER_ESCALATION;
  await record.save();
  return record;
}

async function resolveCase(caseId, { authorizedHealthCenterId } = {}) {
  const record = await getCase(caseId);
  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    const expectedId = record.escalationStatus === ESCALATION_STATUSES.ESCALATED
      ? record.escalatedToHealthCenterId
      : record.assignedHealthCenterId;
    if (!hc || !expectedId || String(expectedId) !== String(hc._id)) {
      throw validationError('Health centre is not authorized to resolve this case', 403);
    }
  }
  record.status = 'RESOLVED';
  record.resolvedAt = new Date();
  record.escalationStatus = ESCALATION_STATUSES.RESOLVED;
  await record.save();
  return record;
}

async function findEscalationTarget(record) {
  return findSuitableHealthCenter({ location: record.location, excludeHealthCenterId: record.assignedHealthCenterId });
}

async function escalateNormalCase(caseId, now = new Date(), { authorizedHealthCenterId } = {}) {
  const record = await getCase(caseId);
  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    const expectedId = record.escalationStatus === ESCALATION_STATUSES.ESCALATED
      ? record.escalatedToHealthCenterId
      : record.assignedHealthCenterId;
    if (!hc || !expectedId || String(expectedId) !== String(hc._id)) {
      throw validationError('Health centre is not authorized to escalate this case', 403);
    }
  }
  const result = await escalateCase(record, now, { targetSelector: findEscalationTarget });
  return result.case;
}

async function getPatientCases(patientId) {
  if (!patientId) return [];
  const query = mongoose.Types.ObjectId.isValid(patientId)
    ? { patientId }
    : { patientId: null };
  const records = await Case.find(query)
    .populate('assignedHealthCenterId')
    .sort({ createdAt: -1 });
  return records;
}

module.exports = {
  Case,
  activeCaseStatuses,
  createCase,
  getActiveCases,
  getPatientCases,
  getCase,
  getCaseDetails,
  acknowledgeCase,
  resolveCase,
  escalateNormalCase,
  findEscalationTarget
};
