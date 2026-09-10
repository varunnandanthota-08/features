const Patient = require('../models/Patient');
const { normalizePhoneNumber } = require('../config/twilio');

const allowedGenders = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const allowedLanguages = new Set(['te', 'hi', 'en']);
const allowedSources = new Set(['WHATSAPP', 'IVR', 'SMS', 'DASHBOARD']);

function normalizePhone(phone) {
  return normalizePhoneNumber(phone);
}

function validatePatientData(patientData) {
  if (!patientData || typeof patientData !== 'object') {
    throw new TypeError('Patient data is required');
  }

  const requiredFields = ['phone', 'name', 'age', 'gender', 'village', 'language', 'symptomsDescription'];
  for (const field of requiredFields) {
    if (patientData[field] === undefined || patientData[field] === null || String(patientData[field]).trim() === '') {
      throw new Error(`Patient field is required: ${field}`);
    }
  }

  if (!Number.isInteger(patientData.age) || patientData.age < 1 || patientData.age > 120) {
    throw new Error('Patient age must be between 1 and 120');
  }
  if (!allowedGenders.has(patientData.gender)) {
    throw new Error('Patient gender is invalid');
  }
  if (!allowedLanguages.has(patientData.language)) {
    throw new Error('Patient language is invalid');
  }
  if (patientData.source !== undefined && !allowedSources.has(patientData.source)) {
    throw new Error('Patient source is invalid');
  }
}

function toPatientDocument(patientData) {
  validatePatientData(patientData);

  return {
    phone: normalizePhone(patientData.phone),
    name: patientData.name.trim(),
    age: patientData.age,
    gender: patientData.gender,
    location: { village: patientData.village.trim() },
    language: patientData.language,
    symptomsDescription: patientData.symptomsDescription.trim(),
    source: patientData.source || 'WHATSAPP'
  };
}

function findByPhone(phone) {
  return Patient.findOne({ phone: normalizePhone(phone) });
}

async function createOrUpdatePatient(patientData) {
  const document = toPatientDocument(patientData);

  return Patient.findOneAndUpdate(
    { phone: document.phone },
    { $set: document },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    }
  );
}

module.exports = {
  createOrUpdatePatient,
  findByPhone,
  normalizePhone,
  validatePatientData
};
