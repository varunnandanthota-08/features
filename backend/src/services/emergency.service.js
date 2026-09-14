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
  if (first.latitude < -90 || first.latitude > 90 || first.longitude < -180 || first.longitude > 180) return null;
  if (second.latitude < -90 || second.latitude > 90 || second.longitude < -180 || second.longitude > 180) return null;
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function facilityData(healthCenter, distance, isFallback = false) {
  return {
    healthCenterId: healthCenter.healthCenterId,
    name: healthCenter.name,
    address: healthCenter.address,
    village: healthCenter.village || null,
    location: healthCenter.location || null,
    emergencyAvailable: healthCenter.emergencyAvailable === true,
    availableCapacity: Math.max(0, healthCenter.capacity - (healthCenter.currentPatientLoad || 0)),
    distanceKm: distance === null ? null : Number(distance.toFixed(2)),
    isFallback
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
    .filter(candidate => {
      if (!excludeHealthCenterId) return true;
      const excluded = Array.isArray(excludeHealthCenterId)
        ? excludeHealthCenterId.map(id => String(id))
        : [String(excludeHealthCenterId)];
      return !excluded.includes(String(candidate.healthCenter._id))
        && !excluded.includes(String(candidate.healthCenter.healthCenterId));
    })
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
    .sort((first, second) => {
      if (emergency) {
        const emergencyDiff = Number(second.healthCenter.emergencyAvailable === true) - Number(first.healthCenter.emergencyAvailable === true);
        if (emergencyDiff !== 0) return emergencyDiff;
      }

      const villageDiff = Number(second.villageMatch) - Number(first.villageMatch);
      if (villageDiff !== 0) return villageDiff;

      const hasDistFirst = first.distance !== null && Number.isFinite(first.distance);
      const hasDistSecond = second.distance !== null && Number.isFinite(second.distance);
      if (hasDistFirst && hasDistSecond) {
        const distDiff = first.distance - second.distance;
        if (Math.abs(distDiff) > 0.001) return distDiff;
      } else if (hasDistFirst) {
        return -1;
      } else if (hasDistSecond) {
        return 1;
      }

      const capacityDiff = second.availableCapacity - first.availableCapacity;
      if (capacityDiff !== 0) return capacityDiff;

      const loadDiff = (first.healthCenter.currentPatientLoad || 0) - (second.healthCenter.currentPatientLoad || 0);
      if (loadDiff !== 0) return loadDiff;

      return String(first.healthCenter.healthCenterId).localeCompare(String(second.healthCenter.healthCenterId));
    });

  const selected = candidates[0];
  const isFallback = Boolean(selected && (selected.distance === null || !Number.isFinite(selected.distance)) && !selected.villageMatch);
  return selected ? {
    healthCenter: selected.healthCenter,
    facility: facilityData(selected.healthCenter, selected.distance, isFallback),
    isFallback
  } : { healthCenter: null, facility: null, isFallback: false };
}

async function resolvePatient({ patientId, phone }) {
  if (patientId) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) throw validationError('patientId must be a valid identifier');
    return Patient.findById(patientId);
  }
  if (typeof phone !== 'string' || !phone.trim()) throw validationError('patientId or phone is required');
  return findByPhone(phone.trim());
}

async function createEmergencyCase({ patientId, phone, source, reason, location, locationLabel, status = 'ALERTED' }) {
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
    ? await findSuitableHealthCenter({ location: normalizedLocation, emergency: true })
    : { healthCenter: null, facility: null };

  const slaMinutes = Number(process.env.EMERGENCY_ESCALATION_SLA_MINUTES) || 5;
  const emergencyEscalationDueAt = new Date(Date.now() + slaMinutes * 60 * 1000);

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
    sourceHealthCenterId: selected.healthCenter?._id || null,
    assignmentStatus: selected.healthCenter ? 'ASSIGNED' : 'PENDING',
    referredFacilityId: selected.healthCenter?._id || null,
    status: status || 'ALERTED',
    escalationStatus: 'NOT_ESCALATED',
    emergencyEscalationDueAt
  });

  return { emergency, patient, selectedFacility: selected.facility };
}

async function getEmergencyCase(caseId, { authorizedHealthCenterId } = {}) {
  const emergency = await EmergencyCase.findOne({ caseId });
  if (!emergency) {
    const error = new Error('Emergency case not found');
    error.statusCode = 404;
    throw error;
  }
  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    const isAssigned = hc && (
      (String(emergency.assignedHealthCenterId) === String(hc._id) && (!emergency.escalatedToHealthCenterId || String(emergency.escalatedToHealthCenterId) === String(hc._id)))
      || (String(emergency.escalatedToHealthCenterId) === String(hc._id))
    );
    if (!isAssigned) {
      const error = new Error('Health centre is not authorized to access this emergency case');
      error.statusCode = 403;
      throw error;
    }
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

async function getActiveEmergencies({ authorizedHealthCenterId } = {}) {
  const query = { status: { $in: activeEmergencyStatuses } };
  if (authorizedHealthCenterId) {
    const hc = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    if (!hc) return [];
    query.$or = [
      {
        assignedHealthCenterId: hc._id,
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
  }
  const emergencies = await EmergencyCase.find(query)
    .sort({ priority: -1, createdAt: -1 });

  return Promise.all(emergencies.map(async emergency => {
    const plainEmergency = toPlainDocument(emergency);
    const assignedHealthCenterId = plainEmergency.assignedHealthCenterId || plainEmergency.referredFacilityId;
    const [patient, selectedHealthCenter, escalatedFromHealthCenter, escalationTargetHealthCenter] = await Promise.all([
      Patient.findById(plainEmergency.patientId),
      assignedHealthCenterId ? HealthCenter.findById(assignedHealthCenterId) : null,
      plainEmergency.escalatedFromHealthCenterId ? HealthCenter.findById(plainEmergency.escalatedFromHealthCenterId) : null,
      plainEmergency.escalatedToHealthCenterId ? HealthCenter.findById(plainEmergency.escalatedToHealthCenterId) : null
    ]);
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
      escalatedFromHealthCenter: escalatedFromHealthCenter || selectedHealthCenter,
      escalationTargetHealthCenter,
      escalationStatus: plainEmergency.escalationStatus || 'NOT_ESCALATED',
      escalationLevel: plainEmergency.escalationLevel || 0,
      escalatedAt: plainEmergency.escalatedAt || null,
      escalationReason: plainEmergency.escalationReason || null,
      escalatedFromHealthCenterId: plainEmergency.escalatedFromHealthCenterId || null,
      escalatedToHealthCenterId: plainEmergency.escalatedToHealthCenterId || null,
      escalatedToHealthWorkerId: plainEmergency.escalatedToHealthWorkerId || null,
      escalationHistory: plainEmergency.escalationHistory || [],
      emergencyEscalationDueAt: plainEmergency.emergencyEscalationDueAt || null,
      acknowledgedBy: plainEmergency.acknowledgedBy || null,
      acknowledgedByWorkerId: plainEmergency.acknowledgedByWorkerId || null,
      acknowledgedByHealthCenterId: plainEmergency.acknowledgedByHealthCenterId || null,
      targetSelectionRequired: plainEmergency.escalationStatus === 'ESCALATED'
        && !plainEmergency.escalatedToHealthCenterId
        && !plainEmergency.escalatedToHealthWorkerId,
      escalationTargetMessage: plainEmergency.escalationStatus === 'ESCALATED'
        && !plainEmergency.escalatedToHealthCenterId
        && !plainEmergency.escalatedToHealthWorkerId
        ? 'Escalation required - target selection pending'
        : null,
      createdAt: plainEmergency.createdAt,
      acknowledgedAt: plainEmergency.acknowledgedAt
    };
  }));
}

async function findEscalationTarget(caseRecord) {
  if (!caseRecord) return { healthCenter: null, facility: null };
  const excludedIds = new Set();
  if (caseRecord.assignedHealthCenterId) excludedIds.add(String(caseRecord.assignedHealthCenterId));
  if (caseRecord.referredFacilityId) excludedIds.add(String(caseRecord.referredFacilityId));
  if (caseRecord.sourceHealthCenterId) excludedIds.add(String(caseRecord.sourceHealthCenterId));
  if (caseRecord.escalatedFromHealthCenterId) excludedIds.add(String(caseRecord.escalatedFromHealthCenterId));
  if (caseRecord.escalatedToHealthCenterId) excludedIds.add(String(caseRecord.escalatedToHealthCenterId));
  if (Array.isArray(caseRecord.escalationHistory)) {
    caseRecord.escalationHistory.forEach(h => {
      if (h.escalatedFromHealthCenterId) excludedIds.add(String(h.escalatedFromHealthCenterId));
      if (h.escalatedToHealthCenterId) excludedIds.add(String(h.escalatedToHealthCenterId));
    });
  }

  return findSuitableHealthCenter({
    location: caseRecord.location,
    excludeHealthCenterId: Array.from(excludedIds),
    emergency: true
  });
}

async function acknowledgeEmergency(caseId, acknowledgedBy, { authorizedHealthCenterId, workerId } = {}) {
  const emergency = await getEmergencyCase(caseId, { authorizedHealthCenterId });
  if (emergency.status === 'RESOLVED') throw validationError('Resolved emergency cannot be acknowledged');
  if (emergency.status === 'REFERRED') throw validationError('Referred emergency cannot be acknowledged by previous centre');
  if (emergency.acknowledgedAt) throw validationError('Emergency has already been acknowledged', 409);
  if (typeof acknowledgedBy !== 'string' || !acknowledgedBy.trim()) throw validationError('acknowledgedBy is required');

  if (emergency.emergencyEscalationDueAt && new Date().getTime() > new Date(emergency.emergencyEscalationDueAt).getTime()) {
    throw validationError('Emergency SLA has expired', 400);
  }

  let healthCenter = null;
  if (authorizedHealthCenterId) {
    healthCenter = await HealthCenter.findOne({ healthCenterId: authorizedHealthCenterId });
    if (!healthCenter || (emergency.assignedHealthCenterId && String(emergency.assignedHealthCenterId) !== String(healthCenter._id))) {
      const error = new Error('Health centre is not authorized to access this emergency case');
      error.statusCode = 403;
      throw error;
    }
  }

  emergency.status = 'ACKNOWLEDGED';
  emergency.acknowledgedBy = acknowledgedBy.trim();
  emergency.acknowledgedByWorkerId = workerId || acknowledgedBy.trim();
  if (healthCenter) {
    emergency.acknowledgedByHealthCenterId = healthCenter._id;
  }
  emergency.acknowledgedAt = new Date();
  if (emergency.escalationStatus === ESCALATION_STATUSES.ESCALATED) {
    emergency.escalationStatus = ESCALATION_STATUSES.ACKNOWLEDGED_AFTER_ESCALATION;
  }
  await emergency.save();
  return emergency;
}

async function escalateEmergency(caseId, { authorizedHealthCenterId } = {}) {
  const emergency = await getEmergencyCase(caseId, { authorizedHealthCenterId });
  const result = await escalateCase(emergency, new Date(), { targetSelector: findEscalationTarget });
  const escalationTargetHealthCenter = result.case.escalatedToHealthCenterId
    ? await HealthCenter.findById(result.case.escalatedToHealthCenterId)
    : null;
  return {
    ...toPlainDocument(result.case),
    escalationTargetHealthCenter
  };
}

async function resolveEmergency(caseId, { authorizedHealthCenterId } = {}) {
  const emergency = await getEmergencyCase(caseId, { authorizedHealthCenterId });
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
