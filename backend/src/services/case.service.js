const crypto = require('crypto');
const mongoose = require('mongoose');
const Case = require('../models/Case');
const Patient = require('../models/Patient');
const HealthCenter = require('../models/HealthCenter');
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

async function resolvePatient({ patientId, phone }) {
  if (patientId) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) throw validationError('patientId must be a valid identifier');
    return Patient.findById(patientId);
  }
  if (typeof phone !== 'string' || !phone.trim()) throw validationError('patientId or phone is required');
  return findByPhone(phone.trim());
}

function realLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : {};
}

async function createCase({ patientId, phone, source, complaint, location } = {}) {
  if (!caseSources.has(source)) throw validationError('source is invalid');
  if (typeof complaint !== 'string' || !complaint.trim()) throw validationError('complaint is required');
  const patient = await resolvePatient({ patientId, phone });
  if (!patient) throw Object.assign(new Error('Patient not found'), { statusCode: 404 });

  const normalizedLocation = realLocation(location || patient.location);
  const selected = await findSuitableHealthCenter({
    location: normalizedLocation.latitude === undefined ? undefined : normalizedLocation,
    village: patient.location?.village
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

async function getActiveCases({ caseModel = Case } = {}) {
  const records = await caseModel.find({ status: { $in: activeCaseStatuses } }).sort({ createdAt: -1 });
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

async function resolveCase(caseId) {
  const record = await getCase(caseId);
  record.status = 'RESOLVED';
  record.resolvedAt = new Date();
  record.escalationStatus = ESCALATION_STATUSES.RESOLVED;
  await record.save();
  return record;
}

async function findEscalationTarget(record) {
  return findSuitableHealthCenter({ location: record.location, excludeHealthCenterId: record.assignedHealthCenterId });
}

async function escalateNormalCase(caseId, now = new Date()) {
  const record = await getCase(caseId);
  const result = await escalateCase(record, now, { targetSelector: findEscalationTarget });
  return result.case;
}

module.exports = {
  Case,
  activeCaseStatuses,
  createCase,
  getActiveCases,
  getCase,
  acknowledgeCase,
  resolveCase,
  escalateNormalCase,
  findEscalationTarget
};
