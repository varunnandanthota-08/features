const mongoose = require('mongoose');
const Document = require('../models/Document');
const MedicalReport = require('../models/MedicalReport');
const { createOrUpdatePatient, validatePatientData } = require('./patient.service');

const patientRegistrationFields = ['name', 'age', 'gender', 'phone', 'village', 'address'];
const medicalReportFields = [
  'patientName',
  'reportDate',
  'diagnosis',
  'bloodPressure',
  'medications',
  'doctor',
  'otherRelevantInformation'
];

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function fieldValue(fields, field) {
  const value = fields?.[field];
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function requireString(fields, field) {
  const value = fieldValue(fields, field);
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`);
  }
  return value.trim();
}

function normalizeGender(value) {
  if (typeof value !== 'string') {
    throw validationError('gender must be male, female, other, or prefer_not_to_say');
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const genders = {
    male: 'male',
    female: 'female',
    other: 'other',
    prefer_not_to_say: 'prefer_not_to_say'
  };

  if (!genders[normalized]) {
    throw validationError('gender must be male, female, other, or prefer_not_to_say');
  }

  return genders[normalized];
}

function normalizeRegistrationPhone(value) {
  if (typeof value !== 'string') {
    throw validationError('phone must be a valid Indian mobile or E.164 number');
  }

  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (/^[6-9]\d{9}$/.test(normalized)) {
    return `+91${normalized}`;
  }
  if (/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return normalized;
  }

  throw validationError('phone must be a valid Indian mobile or E.164 number');
}

function validatePatientRegistration(fields) {
  const name = requireString(fields, 'name');
  const phone = normalizeRegistrationPhone(fieldValue(fields, 'phone'));
  const ageValue = fieldValue(fields, 'age');
  const gender = normalizeGender(fieldValue(fields, 'gender'));
  const village = fieldValue(fields, 'village');
  const address = fieldValue(fields, 'address');
  const age = ageValue === null || ageValue === undefined || ageValue === '' ? null : Number(ageValue);

  if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
    throw validationError('age must be between 1 and 120');
  }
  if (age === null) throw validationError('age is required for patient registration');

  try {
    validatePatientData({
      phone,
      name,
      age,
      gender,
      village: typeof village === 'string' && village.trim() ? village.trim() : (typeof address === 'string' ? address.trim() : ''),
      language: 'en',
      symptomsDescription: 'Document registration'
    });
  } catch (error) {
    throw validationError(error.message);
  }

  return { name, age, gender, phone, village, address };
}

function normalizeVerifiedFields(fields, fieldNames) {
  return fieldNames.reduce((result, field) => {
    result[field] = fieldValue(fields, field) ?? null;
    return result;
  }, {});
}

async function verifyDocument({ documentId, patientId, fields, verifiedBy }) {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    throw validationError('documentId must be a valid identifier');
  }

  const document = await Document.findById(documentId);
  if (!document) {
    const error = new Error('Document not found');
    error.statusCode = 404;
    throw error;
  }
  if (document.extractionStatus !== 'EXTRACTED') {
    throw validationError('Only EXTRACTED documents can be verified');
  }

  const verifiedAt = new Date();
  let normalizedFields;
  let verifiedPatientId = patientId || null;
  if (document.documentType === 'PATIENT_REGISTRATION') {
    normalizedFields = validatePatientRegistration(fields);
    const patient = await createOrUpdatePatient({
      phone: normalizedFields.phone,
      name: normalizedFields.name,
      age: normalizedFields.age,
      gender: normalizedFields.gender,
      village: typeof normalizedFields.village === 'string' && normalizedFields.village.trim()
        ? normalizedFields.village.trim()
        : normalizedFields.address,
      language: 'en',
      symptomsDescription: 'Document registration',
      source: 'DASHBOARD'
    });
    if (!patient || !patient._id) {
      throw new Error('Patient persistence did not return a patient');
    }
    verifiedPatientId = patient._id;
  } else if (document.documentType === 'MEDICAL_REPORT') {
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      throw validationError('patientId is required for medical reports');
    }
    normalizedFields = normalizeVerifiedFields(fields, medicalReportFields);
    await MedicalReport.create({
      patientId,
      ...normalizedFields,
      documentId: document._id,
      verifiedBy: verifiedBy || null,
      verifiedAt
    });
  } else {
    throw validationError('Unsupported document type');
  }

  document.extractedData = normalizedFields;
  document.extractionStatus = 'VERIFIED';
  document.verifiedBy = verifiedBy || null;
  document.verifiedAt = verifiedAt;
  document.patientId = verifiedPatientId;
  await document.save();

  return document;
}

module.exports = { verifyDocument };
