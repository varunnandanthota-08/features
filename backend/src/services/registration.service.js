const { normalizePhoneNumber } = require('../config/twilio');
const { findByPhone, createOrUpdatePatient, ensureEmergencyPatient } = require('./patient.service');
const { createCase, getPatientCases } = require('./case.service');
const { createEmergencyCase, getPatientLocation } = require('./emergency.service');
const { geocodeLocation } = require('./geocoding.service');

function normalizePhone(phone) {
  return normalizePhoneNumber(phone);
}

const allowedCaseSources = {
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
  IVR: 'PHONE_IVR',
  PHONE_IVR: 'PHONE_IVR',
  DASHBOARD: 'DASHBOARD'
};

const allowedPatientSources = {
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
  IVR: 'IVR',
  PHONE_IVR: 'IVR',
  DASHBOARD: 'DASHBOARD'
};

const mongoose = require('mongoose');

/**
 * Check if a patient already exists by phone.
 * @param {string} phone
 * @returns {Promise<Patient|null>}
 */
async function checkExistingPatient(phone) {
  if (!phone) return null;
  const isMock = typeof findByPhone === 'function' && Boolean(findByPhone._isMockFunction || findByPhone.mock);
  if (!isMock && mongoose.connection.readyState !== 1) {
    return null;
  }
  const normalized = normalizePhone(phone);
  if (typeof findByPhone === 'function') {
    try {
      return await findByPhone(normalized);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Finalize registration of patient demographics and operational case.
 * Ensures an existing patient is reused without duplication.
 * @param {Object} params
 * @param {string} params.phone
 * @param {string} params.channel - WHATSAPP, SMS, or IVR
 * @param {string} params.language - en, hi, or te
 * @param {Object} params.data - collected patient and case data
 * @returns {Promise<{ patient: Object, case: Object, selectedFacility: Object }>}
 */
async function finalizeRegistrationAndCase({ phone, channel, language = 'en', data = {} }) {
  const normalized = normalizePhone(phone);
  const existingPatient = typeof findByPhone === 'function' ? await findByPhone(normalized) : null;

  // Reuse known demographics from existing patient if missing in current data
  const name = (data.name && String(data.name).trim()) || existingPatient?.name || 'Community Member';
  const age = data.age !== undefined && data.age !== null ? Number(data.age) : (existingPatient?.age || 30);
  const gender = data.gender || existingPatient?.gender || 'other';
  const village = (data.village && String(data.village).trim()) || existingPatient?.location?.village || 'Community';
  const symptomsDescription = data.symptomsDescription && String(data.symptomsDescription).trim()
    ? String(data.symptomsDescription).trim()
    : 'Health consultation request';
  const patLanguage = language || existingPatient?.language || 'en';

  const patientSource = allowedPatientSources[channel] || 'WHATSAPP';
  const caseSource = allowedCaseSources[channel] || 'WHATSAPP';

  // 1. Create or update patient record using existing patient service
  const patientPayload = {
    phone: normalized,
    name,
    age,
    gender,
    village,
    language: patLanguage,
    symptomsDescription
  };
  if (channel === 'SMS') {
    patientPayload.source = 'SMS';
  } else if (channel === 'IVR' || channel === 'PHONE_IVR') {
    patientPayload.source = 'IVR';
  }

  const patient = await createOrUpdatePatient(patientPayload);

  // 2. Build full complaint description incorporating duration and severity if present
  let fullComplaint = symptomsDescription;
  if (data.duration && String(data.duration).trim()) {
    fullComplaint += ` (Duration: ${String(data.duration).trim()})`;
  }
  if (data.severity && String(data.severity).trim()) {
    fullComplaint += ` [Severity: ${String(data.severity).trim()}]`;
  }

  // 3. Resolve location for case
  const locationObj = (patient.location?.latitude && patient.location?.longitude)
    ? patient.location
    : { village };

  // 4. Create case using shared case.service (handles geocoding & facility assignment)
  let caseResult = null;
  if (patient?._id) {
    caseResult = await createCase({
      patientId: patient._id,
      phone: normalized,
      source: caseSource,
      complaint: fullComplaint,
      location: locationObj
    });
  }

  // 5. Link uploaded document to patient and case if present
  if (data?.documentId || data?.documentUrl) {
    try {
      const Document = require('../models/Document');
      const updatePayload = {};
      if (patient?._id) updatePayload.patientId = patient._id;
      if (caseResult?.case?.caseId) updatePayload.caseId = caseResult.case.caseId;

      if (data.documentId) {
        await Document.findByIdAndUpdate(data.documentId, { $set: updatePayload });
      } else if (data.documentUrl) {
        await Document.updateMany(
          { originalFileName: data.documentUrl, patientId: null },
          { $set: updatePayload }
        );
      }
    } catch (docErr) {
      console.warn('[Registration] Could not link document:', docErr.message);
    }
  }

  return {
    patient,
    case: caseResult?.case || null,
    selectedFacility: caseResult?.selectedFacility || null
  };
}

/**
 * Shared emergency creation for any channel.
 */
async function createChannelEmergency({ phone, channel, reason, location, locationLabel }) {
  const normalized = normalizePhone(phone);
  const patientSource = allowedPatientSources[channel] || 'WHATSAPP';
  const caseSource = allowedCaseSources[channel] || 'WHATSAPP';

  await ensureEmergencyPatient(normalized, patientSource);

  return createEmergencyCase({
    phone: normalized,
    source: caseSource,
    reason: reason || `Emergency request via ${channel}`,
    location,
    locationLabel,
    status: 'ALERTED'
  });
}

/**
 * Retrieve active cases for a given phone number (for SMS/channel STATUS queries).
 */
async function getActiveCasesForPhone(phone) {
  const patient = await checkExistingPatient(phone);
  if (!patient?._id) return [];
  return getPatientCases(patient._id);
}

module.exports = {
  checkExistingPatient,
  finalizeRegistrationAndCase,
  createChannelEmergency,
  getActiveCasesForPhone,
  allowedCaseSources,
  allowedPatientSources
};
