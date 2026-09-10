const request = require('supertest');

const documentId = '507f1f77bcf86cd799439011';
const patientId = '507f191e810c19729de860ea';
const mockDocuments = new Map();
const mockMedicalReportCreate = jest.fn();
const mockCreateOrUpdatePatient = jest.fn();
const mockValidatePatientData = jest.fn();

jest.mock('../src/models/Document', () => ({
  findById: jest.fn(async id => mockDocuments.get(String(id)) || null),
  create: jest.fn()
}));

jest.mock('../src/models/MedicalReport', () => ({
  create: mockMedicalReportCreate
}));

jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient,
  validatePatientData: mockValidatePatientData
}));

jest.mock('../src/services/gemini.service', () => ({
  extractDocumentData: jest.fn()
}));

const { app } = require('../src/app');

function documentRecord(overrides = {}) {
  const record = {
    _id: documentId,
    documentType: 'PATIENT_REGISTRATION',
    extractionStatus: 'EXTRACTED',
    extractedData: {},
    verifiedBy: null,
    verifiedAt: null,
    patientId: null,
    save: jest.fn(async function save() { return this; }),
    ...overrides
  };
  return record;
}

function verify(body) {
  return request(app)
    .post('/api/documents/verify')
    .send(body);
}

function registrationFields(gender) {
  return {
    name: 'Ravi Kumar',
    age: 52,
    gender,
    phone: '+919392123042',
    village: 'Village A'
  };
}

describe('document verification endpoint', () => {
  beforeEach(() => {
    mockDocuments.clear();
    mockMedicalReportCreate.mockReset();
    mockCreateOrUpdatePatient.mockReset();
    mockValidatePatientData.mockReset();
    mockCreateOrUpdatePatient.mockResolvedValue({ _id: patientId });
    mockMedicalReportCreate.mockResolvedValue({ _id: '507f1f77bcf86cd799439012' });
  });

  test('returns 404 for a nonexistent document', async () => {
    const response = await verify({ documentId, fields: {} });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Document not found');
  });

  test('rejects an already VERIFIED document', async () => {
    mockDocuments.set(documentId, documentRecord({ extractionStatus: 'VERIFIED' }));

    const response = await verify({ documentId, fields: {} });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Only EXTRACTED documents');
  });

  test('reuses patient service and verifies a patient registration', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);

    const response = await verify({
      documentId,
      verifiedBy: 'worker-1',
      fields: {
        name: 'Ravi Kumar',
        age: 52,
        gender: 'male',
        phone: '+919392123042',
        village: 'Village A',
        address: 'Village A, District'
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      documentId,
      documentType: 'PATIENT_REGISTRATION',
      patientId,
      status: 'VERIFIED',
      verifiedBy: 'worker-1'
    });
    expect(mockValidatePatientData).toHaveBeenCalled();
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith({
      phone: '+919392123042',
      name: 'Ravi Kumar',
      age: 52,
      gender: 'male',
      village: 'Village A',
      language: 'en',
      symptomsDescription: 'Document registration',
      source: 'DASHBOARD'
    });
    expect(document.patientId).toBe(patientId);
    expect(document.extractionStatus).toBe('VERIFIED');
    expect(document.save).toHaveBeenCalledTimes(1);
  });

  test('normalizes Male OCR value before patient persistence', async () => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({ documentId, fields: registrationFields(' Male ') });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ gender: 'male' }));
  });

  test('normalizes Female OCR value before patient persistence', async () => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({ documentId, fields: registrationFields('Female') });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ gender: 'female' }));
  });

  test('normalizes a 10-digit Indian phone for patient persistence and document data', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);

    const response = await verify({ documentId, fields: registrationFields('male') });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ phone: '+919392123042' }));
    expect(document.extractedData.phone).toBe('+919392123042');
  });

  test('verifies the exact UI payload with OCR phone and display gender values', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);

    const response = await verify({
      documentId,
      verifiedBy: 'debug-worker',
      fields: {
        name: 'Rajesh Kumar',
        age: '34',
        gender: 'Male',
        phone: '9876543210',
        village: 'Rampur',
        address: 'Plot 42, Main Street'
      }
    });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+919876543210',
      gender: 'male'
    }));
    expect(document.extractedData.phone).toBe('+919876543210');
  });

  test('normalizes phone spaces and separators', async () => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({
      documentId,
      fields: { ...registrationFields('male'), phone: ' 987-654-3210 ' }
    });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ phone: '+919876543210' }));
  });

  test('preserves an existing E.164 phone', async () => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({
      documentId,
      fields: { ...registrationFields('male'), phone: '+919876543210' }
    });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ phone: '+919876543210' }));
  });

  test('rejects an invalid phone before patient persistence', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);

    const response = await verify({
      documentId,
      fields: { ...registrationFields('male'), phone: '12345' }
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('phone must be');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
    expect(document.extractionStatus).toBe('EXTRACTED');
  });

  test.each(['male', 'female', 'other', 'prefer_not_to_say'])('accepts existing Patient gender value %s', async gender => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({ documentId, fields: registrationFields(gender) });

    expect(response.status).toBe(200);
    expect(mockCreateOrUpdatePatient).toHaveBeenCalledWith(expect.objectContaining({ gender }));
  });

  test('rejects an unsupported gender value before patient persistence', async () => {
    mockDocuments.set(documentId, documentRecord());

    const response = await verify({ documentId, fields: registrationFields('unknown') });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('gender must be');
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  test('requires patientId for medical reports', async () => {
    mockDocuments.set(documentId, documentRecord({ documentType: 'MEDICAL_REPORT' }));

    const response = await verify({
      documentId,
      fields: { diagnosis: 'Hypertension' }
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('patientId is required');
    expect(mockMedicalReportCreate).not.toHaveBeenCalled();
  });

  test('saves a verified medical report', async () => {
    const document = documentRecord({ documentType: 'MEDICAL_REPORT' });
    mockDocuments.set(documentId, document);

    const response = await verify({
      documentId,
      patientId,
      verifiedBy: 'worker-2',
      fields: {
        patientName: 'Ravi Kumar',
        reportDate: '2026-09-10',
        diagnosis: 'Hypertension',
        bloodPressure: '140/90',
        medications: ['Medication A'],
        doctor: 'Dr. Rao',
        otherRelevantInformation: null
      }
    });

    expect(response.status).toBe(200);
    expect(mockMedicalReportCreate).toHaveBeenCalledWith(expect.objectContaining({
      patientId,
      documentId,
      patientName: 'Ravi Kumar',
      diagnosis: 'Hypertension',
      verifiedBy: 'worker-2'
    }));
    expect(document.patientId).toBe(patientId);
    expect(document.extractionStatus).toBe('VERIFIED');
  });

  test('does not verify a medical report when MedicalReport persistence fails', async () => {
    const document = documentRecord({ documentType: 'MEDICAL_REPORT' });
    mockDocuments.set(documentId, document);
    mockMedicalReportCreate.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await verify({
      documentId,
      patientId,
      fields: { diagnosis: 'Hypertension' }
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(document.extractionStatus).toBe('EXTRACTED');
    expect(document.save).not.toHaveBeenCalled();
  });

  test('does not report success or verify the document when patient persistence fails', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);
    mockCreateOrUpdatePatient.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await verify({
      documentId,
      fields: {
        name: 'Ravi Kumar',
        age: 52,
        gender: 'male',
        phone: '+919392123042',
        village: 'Village A'
      }
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(document.extractionStatus).toBe('EXTRACTED');
    expect(document.save).not.toHaveBeenCalled();
  });

  test('does not verify the document when patient persistence returns no patient', async () => {
    const document = documentRecord();
    mockDocuments.set(documentId, document);
    mockCreateOrUpdatePatient.mockResolvedValueOnce(null);

    const response = await verify({
      documentId,
      fields: {
        name: 'Ravi Kumar',
        age: 52,
        gender: 'male',
        phone: '+919392123042',
        village: 'Village A'
      }
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(document.extractionStatus).toBe('EXTRACTED');
    expect(document.save).not.toHaveBeenCalled();
  });
});
