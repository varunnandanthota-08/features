const crypto = require('crypto');
const mongoose = require('mongoose');
const EmergencyCase = require('../models/EmergencyCase');
const HealthCenter = require('../models/HealthCenter');
const Patient = require('../models/Patient');
const { findByPhone } = require('./patient.service');
const { escalateCase, ESCALATION_STATUSES } = require('./escalation.service');

const emergencySources = new Set(['PHONE_IVR', 'WHATSAPP', 'SMS', 'HEALTH_WORKER', 'DASHBOARD', 'AUTOMATIC_DETECTION']);
const emergencyStatuses = new Set(['REGISTERED', 'ALERTED', 'ACKNOWLEDGED', 'RESPONDING', 'REFERRED', 'ESCALATED', 'RESOLVED']);
const activeEmergencyStatuses = ['ALERTED', 'ACKNOWLEDGED', 'RESPONDING', 'ESCALATED'];
const recommendationDoctorFields = {
  GENERAL: 'general',
  ENT: 'ent',
  CARDIOLOGY: 'cardiology',
  PEDIATRICS: 'pediatrics',
  GYNECOLOGY: 'gynecology'
};

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeLocation(location) {
  if (!location) return {};
  const { latitude, longitude } = location;
  if (latitude === undefined && longitude === undefined) return {};
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw validationError('location.latitude must be between -90 and 90');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw validationError('location.longitude must be between -180 and 180');
  }
  return { latitude, longitude };
}

function distanceKm(first, second) {
  if (!first || !second || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)
    || !Number.isFinite(second.latitude) || !Number.isFinite(second.longitude)) return null;
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function facilityData(healthCenter, distance) {
  return {
    healthCenterId: healthCenter.healthCenterId,
    name: healthCenter.name,
    address: healthCenter.address,
    village: healthCenter.village || null,
    location: healthCenter.location || null,
    emergencyAvailable: healthCenter.emergencyAvailable === true,
    availableCapacity: Math.max(0, healthCenter.capacity - (healthCenter.currentPatientLoad || 0)),
    distanceKm: distance === null ? null : Number(distance.toFixed(2))
  };
}

async function findSuitableHealthCenter({ location, village, excludeHealthCenterId, service, equipment, emergency = false } = {}) {
  const healthCenters = await HealthCenter.find({});
  const normalizedService = typeof service === 'string' ? service.trim().toUpperCase() : null;
  const normalizedEquipment = typeof equipment === 'string' ? equipment.trim().toLowerCase() : null;
  const candidates = healthCenters
    .map(healthCenter => {
      const availableCapacity = healthCenter.capacity - (healthCenter.currentPatientLoad || 0);
      const distance = distanceKm(location, healthCenter.location);
      const villageMatch = Boolean(village && healthCenter.village
        && healthCenter.village.trim().toLowerCase() === village.trim().toLowerCase());
      return { healthCenter, availableCapacity, distance, villageMatch };
    })
    .filter(candidate => !excludeHealthCenterId
      || (String(candidate.healthCenter._id) !== String(excludeHealthCenterId)
        && String(candidate.healthCenter.healthCenterId) !== String(excludeHealthCenterId)))
    .filter(candidate => candidate.availableCapacity > 0)
    .filter(candidate => {
      if (!normalizedService) return true;
      const serviceAvailable = (candidate.healthCenter.services || [])
        .some(value => value.trim().toUpperCase() === normalizedService);
      const doctorField = recommendationDoctorFields[normalizedService];
      return serviceAvailable && (!doctorField || Number(candidate.healthCenter.doctors?.[doctorField]) > 0);
    })
    .filter(candidate => !normalizedEquipment || candidate.healthCenter.equipment?.[normalizedEquipment] === true)
    .filter(candidate => !emergency || candidate.healthCenter.emergencyAvailable === true)
    .sort((first, second) => (
      Number(second.healthCenter.emergencyAvailable === true) - Number(first.healthCenter.emergencyAvailable === true)
      || (location
        ? second.availableCapacity - first.availableCapacity
        : Number(second.villageMatch) - Number(first.villageMatch))
      || (first.distance ?? Number.POSITIVE_INFINITY) - (second.distance ?? Number.POSITIVE_INFINITY)
      || second.availableCapacity - first.availableCapacity
    ));

  const selected = candidates[0];
  return selected ? {
    healthCenter: selected.healthCenter,
    facility: facilityData(selected.healthCenter, selected.distance)
  } : { healthCenter: null, facility: null };
}

async function resolvePatient({ patientId, phone }) {
  if (patientId) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) throw validationError('patientId must be a valid identifier');
    return Patient.findById(patientId);
  }
  if (typeof phone !== 'string' || !phone.trim()) throw validationError('patientId or phone is required');
  return findByPhone(phone.trim());
}

async function createEmergencyCase({ patientId, phone, source, reason, location, locationLabel, status = 'REGISTERED' }) {
  if (!emergencySources.has(source)) throw validationError('source is invalid');
  if (!emergencyStatuses.has(status)) throw validationError('status is invalid');
  if (typeof reason !== 'string' || !reason.trim()) throw validationError('reason is required');

  const patient = await resolvePatient({ patientId, phone });
  if (!patient) {
    const error = new Error('Patient not found');
    error.statusCode = 404;
    throw error;
  }

  const suppliedLocation = location && typeof location === 'object' ? location : patient.location;
  const normalizedLocation = normalizeLocation(suppliedLocation);
  const locationStatus = Number.isFinite(normalizedLocation.latitude)
    && Number.isFinite(normalizedLocation.longitude) ? 'RESOLVED' : 'UNRESOLVED';
  const selected = locationStatus === 'RESOLVED'
    ? await findSuitableHealthCenter({ location: normalizedLocation })
    : { healthCenter: null, facility: null };
  const emergency = await EmergencyCase.create({
    caseId: `EMG-${crypto.randomUUID()}`,
    patientId: patient._id,
    type: 'EMERGENCY',
    priority: 'CRITICAL',
    source,
    reason: reason.trim(),
    location: normalizedLocation,
    locationStatus,
    locationLabel: typeof locationLabel === 'string' && locationLabel.trim() ? locationLabel.trim() : null,
    assignedHealthCenterId: selected.healthCenter?._id || null,
    assignmentStatus: selected.healthCenter ? 'ASSIGNED' : 'PENDING',
    referredFacilityId: selected.healthCenter?._id || null,
    status
  });

  return { emergency, patient, selectedFacility: selected.facility };
}

async function getEmergencyCase(caseId) {
  const emergency = await EmergencyCase.findOne({ caseId });
  if (!emergency) {
    const error = new Error('Emergency case not found');
    error.statusCode = 404;
    throw error;
  }
  return emergency;
}

function toPlainDocument(document) {
  return typeof document?.toObject === 'function' ? document.toObject() : document;
}

async function getPatientLocation({ patientId, phone }) {
  const patient = await resolvePatient({ patientId, phone });
  return patient?.location || null;
}

async function getActiveEmergencies() {
  const emergencies = await EmergencyCase.find({ status: { $in: activeEmergencyStatuses } })
    .sort({ priority: -1, createdAt: -1 });

  return Promise.all(emergencies.map(async emergency => {
    const plainEmergency = toPlainDocument(emergency);
    const assignedHealthCenterId = plainEmergency.assignedHealthCenterId || plainEmergency.referredFacilityId;
    const [patient, selectedHealthCenter] = await Promise.all([
      Patient.findById(plainEmergency.patientId),
      assignedHealthCenterId ? HealthCenter.findById(assignedHealthCenterId) : null
    ]);
    const escalationTargetHealthCenter = plainEmergency.escalatedToHealthCenterId
      ? await HealthCenter.findById(plainEmergency.escalatedToHealthCenterId)
      : null;
    const patientLocation = {
      village: plainEmergency.locationLabel || patient?.location?.village || null,
      latitude: plainEmergency.location?.latitude,
      longitude: plainEmergency.location?.longitude
    };
    const assignmentStatus = plainEmergency.assignmentStatus
      || (selectedHealthCenter ? 'ASSIGNED' : 'PENDING');

    return {
      kind: 'EMERGENCY',
      caseId: plainEmergency.caseId,
      patient,
      reason: plainEmergency.reason,
      source: plainEmergency.source,
      priority: plainEmergency.priority,
      status: plainEmergency.status,
      location: plainEmergency.location || {},
      locationStatus: plainEmergency.locationStatus || 'UNRESOLVED',
      patientLocation,
      assignmentStatus,
      assignedHealthCenterId: assignedHealthCenterId || null,
      assignedHealthCenter: selectedHealthCenter,
      selectedHealthCenter,
      escalatedFromHealthCenter: selectedHealthCenter,
      escalationTargetHealthCenter,
      escalationStatus: plainEmergency.escalationStatus || 'NOT_ESCALATED',
      escalationLevel: plainEmergency.escalationLevel || 0,
      escalatedAt: plainEmergency.escalatedAt || null,
      escalationReason: plainEmergency.escalationReason || null,
      escalatedFromHealthCenterId: plainEmergency.escalatedFromHealthCenterId || null,
      escalatedToHealthCenterId: plainEmergency.escalatedToHealthCenterId || null,
      escalatedToHealthWorkerId: plainEmergency.escalatedToHealthWorkerId || null,
      escalationHistory: plainEmergency.escalationHistory || [],
      targetSelectionRequired: plainEmergency.escalationStatus === 'ESCALATED'
        && !plainEmergency.escalatedToHealthCenterId
        && !plainEmergency.escalatedToHealthWorkerId,
      escalationTargetMessage: plainEmergency.escalationStatus === 'ESCALATED'
        && !plainEmergency.escalatedToHealthCenterId
        && !plainEmergency.escalatedToHealthWorkerId
        ? 'Escalation required - target selection pending'
        : null,
      createdAt: plainEmergency.createdAt,
      acknowledgedAt: plainEmergency.acknowledgedAt,
      escalationLevel: plainEmergency.escalationLevel
    };
  }));
}

async function findEscalationTarget(caseRecord) {
  if (!caseRecord?.assignedHealthCenterId) return { healthCenter: null, facility: null };
  return findSuitableHealthCenter({
    location: caseRecord.location,
    excludeHealthCenterId: caseRecord.assignedHealthCenterId
  });
}

async function acknowledgeEmergency(caseId, acknowledgedBy) {
  const emergency = await getEmergencyCase(caseId);
  if (emergency.status === 'RESOLVED') throw validationError('Resolved emergency cannot be acknowledged');
  if (typeof acknowledgedBy !== 'string' || !acknowledgedBy.trim()) throw validationError('acknowledgedBy is required');
  emergency.status = 'ACKNOWLEDGED';
  emergency.acknowledgedBy = acknowledgedBy.trim();
  emergency.acknowledgedAt = new Date();
  if (emergency.escalationStatus === ESCALATION_STATUSES.ESCALATED) {
    emergency.escalationStatus = ESCALATION_STATUSES.ACKNOWLEDGED_AFTER_ESCALATION;
  }
  await emergency.save();
  return emergency;
}

async function escalateEmergency(caseId) {
  const emergency = await getEmergencyCase(caseId);
  const result = await escalateCase(emergency, new Date(), { targetSelector: findEscalationTarget });
  const escalationTargetHealthCenter = result.case.escalatedToHealthCenterId
    ? await HealthCenter.findById(result.case.escalatedToHealthCenterId)
    : null;
  return {
    ...toPlainDocument(result.case),
    escalationTargetHealthCenter
  };
}

async function resolveEmergency(caseId) {
  const emergency = await getEmergencyCase(caseId);
  emergency.status = 'RESOLVED';
  emergency.escalationStatus = ESCALATION_STATUSES.RESOLVED;
  await emergency.save();
  return emergency;
}

module.exports = {
  createEmergencyCase,
  getPatientLocation,
  findSuitableHealthCenter,
  findEscalationTarget,
  acknowledgeEmergency,
  escalateEmergency,
  resolveEmergency,
  getEmergencyCase,
  getActiveEmergencies
};
