const HealthCenter = require('../models/HealthCenter');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateCreateInput(body) {
  const requiredStrings = ['healthCenterId', 'name', 'address'];
  for (const field of requiredStrings) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      throw badRequest(`${field} is required`);
    }
  }

  const validateNonNegative = (value, field, required = false) => {
    if (value === undefined && !required) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw badRequest(`${field} must be a non-negative number`);
    }
  };

  if (body.capacity === undefined) throw badRequest('capacity is required');
  validateNonNegative(body.capacity, 'capacity', true);
  validateNonNegative(body.currentPatientLoad, 'currentPatientLoad');

  for (const field of ['general', 'ent', 'cardiology', 'pediatrics', 'gynecology']) {
    validateNonNegative(body.doctors?.[field], `doctors.${field}`);
  }

  if (body.location) {
    const { latitude, longitude } = body.location;
    if (latitude !== undefined && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) {
      throw badRequest('location.latitude must be between -90 and 90');
    }
    if (longitude !== undefined && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) {
      throw badRequest('location.longitude must be between -180 and 180');
    }
  }
}

function validateAvailabilityInput(body, healthCenter) {
  const allowedFields = ['doctors', 'equipment', 'currentPatientLoad', 'emergencyAvailable'];
  const bodyFields = Object.keys(body);
  if (!bodyFields.length || bodyFields.some(field => !allowedFields.includes(field))) {
    throw badRequest('only availability fields may be updated');
  }

  const doctorFields = ['general', 'ent', 'cardiology', 'pediatrics', 'gynecology'];
  if (body.doctors !== undefined) {
    if (!body.doctors || typeof body.doctors !== 'object' || Array.isArray(body.doctors)
      || !Object.keys(body.doctors).length
      || Object.keys(body.doctors).some(field => !doctorFields.includes(field))) {
      throw badRequest('doctors contains an invalid field');
    }
    for (const field of Object.keys(body.doctors)) {
      const value = body.doctors[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw badRequest(`doctors.${field} must be a non-negative number`);
      }
    }
  }

  const equipmentFields = ['ecg', 'xray', 'ultrasound'];
  if (body.equipment !== undefined) {
    if (!body.equipment || typeof body.equipment !== 'object' || Array.isArray(body.equipment)
      || !Object.keys(body.equipment).length
      || Object.keys(body.equipment).some(field => !equipmentFields.includes(field))) {
      throw badRequest('equipment contains an invalid field');
    }
    for (const field of Object.keys(body.equipment)) {
      if (typeof body.equipment[field] !== 'boolean') {
        throw badRequest(`equipment.${field} must be a boolean`);
      }
    }
  }

  if (body.currentPatientLoad !== undefined
    && (typeof body.currentPatientLoad !== 'number'
      || !Number.isFinite(body.currentPatientLoad)
      || body.currentPatientLoad < 0
      || body.currentPatientLoad > healthCenter.capacity)) {
    throw badRequest('currentPatientLoad must be a non-negative number not exceeding capacity');
  }
  if (body.emergencyAvailable !== undefined && typeof body.emergencyAvailable !== 'boolean') {
    throw badRequest('emergencyAvailable must be a boolean');
  }
}

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: 'healthCenterId already exists' });
  }
  console.error(`[HealthCenter] ${fallbackMessage}:`, error.message);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

async function createHealthCenter(req, res) {
  try {
    validateCreateInput(req.body || {});
    const healthCenter = await HealthCenter.create(req.body);
    return res.status(201).json({ success: true, data: healthCenter });
  } catch (error) {
    return sendError(res, error, 'Unable to create health centre');
  }
}

async function getHealthCenters(req, res) {
  try {
    const healthCenters = await HealthCenter.find({});
    return res.status(200).json({ success: true, data: healthCenters });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve health centres');
  }
}

async function getHealthCenterById(req, res) {
  try {
    const healthCenter = await HealthCenter.findOne({ healthCenterId: req.params.healthCenterId });
    if (!healthCenter) return res.status(404).json({ success: false, message: 'Health centre not found' });
    return res.status(200).json({ success: true, data: healthCenter });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve health centre');
  }
}

async function updateHealthCenterAvailability(req, res) {
  try {
    const healthCenter = await HealthCenter.findOne({ healthCenterId: req.params.healthCenterId });
    if (!healthCenter) return res.status(404).json({ success: false, message: 'Health centre not found' });

    const body = req.body || {};
    validateAvailabilityInput(body, healthCenter);
    if (body.doctors) Object.assign(healthCenter.doctors, body.doctors);
    if (body.equipment) Object.assign(healthCenter.equipment, body.equipment);
    if (body.currentPatientLoad !== undefined) healthCenter.currentPatientLoad = body.currentPatientLoad;
    if (body.emergencyAvailable !== undefined) healthCenter.emergencyAvailable = body.emergencyAvailable;
    await healthCenter.save();

    const data = typeof healthCenter.toObject === 'function' ? healthCenter.toObject() : { ...healthCenter };
    data.availableCapacity = data.capacity - (data.currentPatientLoad || 0);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 'Unable to update health centre availability');
  }
}

function parseNearbyQuery(query) {
  const parseCoordinate = (field, minimum, maximum) => {
    if (query[field] === undefined || query[field] === '') throw badRequest(`${field} is required`);
    const value = Number(query[field]);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw badRequest(`${field} must be between ${minimum} and ${maximum}`);
    }
    return value;
  };

  const latitude = parseCoordinate('latitude', -90, 90);
  const longitude = parseCoordinate('longitude', -180, 180);
  const radius = query.radius === undefined ? 10 : Number(query.radius);
  if (!Number.isFinite(radius) || radius <= 0) throw badRequest('radius must be a positive number');
  return { latitude, longitude, radius };
}

function haversineDistanceKm(latitudeOne, longitudeOne, latitudeTwo, longitudeTwo) {
  const earthRadiusKm = 6371;
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeTwo - latitudeOne);
  const longitudeDelta = toRadians(longitudeTwo - longitudeOne);
  const latitudeOneRadians = toRadians(latitudeOne);
  const latitudeTwoRadians = toRadians(latitudeTwo);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOneRadians) * Math.cos(latitudeTwoRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function parseRecommendationQuery(query) {
  const { latitude, longitude } = parseNearbyQuery({
    latitude: query.latitude,
    longitude: query.longitude,
    radius: 10
  });
  const requirements = {
    latitude,
    longitude,
    service: query.service?.trim().toUpperCase() || null,
    equipment: query.equipment?.trim().toLowerCase() || null,
    emergency: query.emergency === undefined ? false : query.emergency.toLowerCase() === 'true',
    maxDistance: query.maxDistance === undefined ? null : Number(query.maxDistance)
  };

  if (query.emergency !== undefined && !['true', 'false'].includes(query.emergency.toLowerCase())) {
    throw badRequest('emergency must be true or false');
  }
  if (requirements.maxDistance !== null
    && (!Number.isFinite(requirements.maxDistance) || requirements.maxDistance <= 0)) {
    throw badRequest('maxDistance must be a positive number');
  }
  if (requirements.equipment && !['ecg', 'xray', 'ultrasound'].includes(requirements.equipment)) {
    throw badRequest('equipment must be ecg, xray, or ultrasound');
  }
  return requirements;
}

const doctorFieldForService = {
  GENERAL: 'general',
  ENT: 'ent',
  CARDIOLOGY: 'cardiology',
  PEDIATRICS: 'pediatrics',
  GYNECOLOGY: 'gynecology'
};

function hasService(healthCenter, service) {
  return healthCenter.services?.some(value => value.trim().toUpperCase() === service);
}

function hasRequiredDoctor(healthCenter, service) {
  const doctorField = doctorFieldForService[service];
  return !doctorField || Number(healthCenter.doctors?.[doctorField]) > 0;
}

function calculateFacilityScore(healthCenter, requirements, distanceKm) {
  const availableCapacity = healthCenter.capacity - (healthCenter.currentPatientLoad || 0);
  const capacityScore = Math.min(10, (availableCapacity / healthCenter.capacity) * 10);
  const distanceLimit = requirements.maxDistance || 10;
  const distanceScore = Math.max(0, 10 - (distanceKm / distanceLimit) * 10);

  // Requirements are filtered first; these weights make the ranking transparent and deterministic.
  let score = capacityScore + distanceScore;
  if (requirements.service) score += 30;
  if (requirements.equipment) score += 25;
  if (requirements.emergency) score += 20;
  if (requirements.service && hasRequiredDoctor(healthCenter, requirements.service)) score += 15;
  return Math.round(score);
}

function recommendationReasons(healthCenter, requirements, distanceKm) {
  const reasons = [];
  if (requirements.service) reasons.push(`${requirements.service} available`);
  if (requirements.equipment) reasons.push(`${requirements.equipment.toUpperCase()} available`);
  if (requirements.service && hasRequiredDoctor(healthCenter, requirements.service)) {
    reasons.push(`${requirements.service} doctor available`);
  }
  if (requirements.emergency) reasons.push('Emergency care available');
  reasons.push('Capacity available', `${distanceKm.toFixed(2)} km away`);
  return reasons;
}

async function recommendHealthCenters(req, res) {
  try {
    const requirements = parseRecommendationQuery(req.query);
    const healthCenters = await HealthCenter.find({});
    const suitableFacilities = healthCenters
      .filter(healthCenter => {
        const availableCapacity = healthCenter.capacity - (healthCenter.currentPatientLoad || 0);
        if (availableCapacity <= 0 || !healthCenter.location) return false;
        if (requirements.service && (!hasService(healthCenter, requirements.service)
          || !hasRequiredDoctor(healthCenter, requirements.service))) return false;
        if (requirements.equipment && healthCenter.equipment?.[requirements.equipment] !== true) return false;
        if (requirements.emergency && healthCenter.emergencyAvailable !== true) return false;
        const distanceKm = haversineDistanceKm(
          requirements.latitude,
          requirements.longitude,
          healthCenter.location.latitude,
          healthCenter.location.longitude
        );
        return requirements.maxDistance === null || distanceKm <= requirements.maxDistance;
      })
      .map(healthCenter => {
        const distanceKm = haversineDistanceKm(
          requirements.latitude,
          requirements.longitude,
          healthCenter.location.latitude,
          healthCenter.location.longitude
        );
        return {
          healthCenter,
          distanceKm,
          score: calculateFacilityScore(healthCenter, requirements, distanceKm)
        };
      })
      .sort((first, second) => second.score - first.score || first.distanceKm - second.distanceKm);

    const facilities = suitableFacilities.map(({ healthCenter, distanceKm, score }) => ({
      healthCenterId: healthCenter.healthCenterId,
      name: healthCenter.name,
      distanceKm: Number(distanceKm.toFixed(2)),
      score,
      availableCapacity: healthCenter.capacity - (healthCenter.currentPatientLoad || 0),
      services: healthCenter.services || [],
      equipment: healthCenter.equipment || {},
      emergencyAvailable: healthCenter.emergencyAvailable === true,
      reasons: []
    }));
    const first = suitableFacilities[0];
    const recommendation = first ? {
      healthCenterId: first.healthCenter.healthCenterId,
      name: first.healthCenter.name,
      distanceKm: Number(first.distanceKm.toFixed(2)),
      score: first.score,
      reasons: recommendationReasons(first.healthCenter, requirements, first.distanceKm)
    } : null;

    return res.status(200).json({ success: true, data: { recommendation, facilities } });
  } catch (error) {
    return sendError(res, error, 'Unable to recommend health centres');
  }
}

async function getNearbyHealthCenters(req, res) {
  try {
    const { latitude, longitude, radius } = parseNearbyQuery(req.query);
    const healthCenters = await HealthCenter.find({});
    const nearbyHealthCenters = healthCenters
      .filter(healthCenter => healthCenter.location
        && Number.isFinite(healthCenter.location.latitude)
        && Number.isFinite(healthCenter.location.longitude))
      .map(healthCenter => ({
        healthCenterId: healthCenter.healthCenterId,
        name: healthCenter.name,
        distanceKm: haversineDistanceKm(
          latitude,
          longitude,
          healthCenter.location.latitude,
          healthCenter.location.longitude
        ),
        location: {
          latitude: healthCenter.location.latitude,
          longitude: healthCenter.location.longitude
        }
      }))
      .filter(healthCenter => healthCenter.distanceKm <= radius)
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .map(healthCenter => ({
        ...healthCenter,
        distanceKm: Number(healthCenter.distanceKm.toFixed(2))
      }));

    return res.status(200).json({ success: true, data: nearbyHealthCenters });
  } catch (error) {
    return sendError(res, error, 'Unable to find nearby health centres');
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchHealthCenters(req, res) {
  try {
    const { service, district, state, emergencyAvailable, minCapacityAvailable } = req.query;
    const query = {};
    if (service) query.services = { $regex: `^${escapeRegex(service.trim())}$`, $options: 'i' };
    if (district) query.district = { $regex: `^${escapeRegex(district.trim())}$`, $options: 'i' };
    if (state) query.state = { $regex: `^${escapeRegex(state.trim())}$`, $options: 'i' };
    if (emergencyAvailable !== undefined) {
      if (!['true', 'false'].includes(emergencyAvailable.toLowerCase())) throw badRequest('emergencyAvailable must be true or false');
      query.emergencyAvailable = emergencyAvailable.toLowerCase() === 'true';
    }
    if (minCapacityAvailable !== undefined) {
      const minimum = Number(minCapacityAvailable);
      if (!Number.isFinite(minimum) || minimum < 0) throw badRequest('minCapacityAvailable must be a non-negative number');
      query.$expr = { $gte: [{ $subtract: ['$capacity', '$currentPatientLoad'] }, minimum] };
    }

    const healthCenters = await HealthCenter.find(query);
    return res.status(200).json({ success: true, data: healthCenters });
  } catch (error) {
    return sendError(res, error, 'Unable to search health centres');
  }
}

module.exports = {
  createHealthCenter,
  getHealthCenters,
  getHealthCenterById,
  updateHealthCenterAvailability,
  searchHealthCenters,
  getNearbyHealthCenters,
  recommendHealthCenters,
  calculateFacilityScore
};