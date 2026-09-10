const request = require('supertest');

const mockExtractDocumentData = jest.fn();
const mockDocumentCreate = jest.fn();
const mockCreateOrUpdatePatient = jest.fn();

jest.mock('../src/services/gemini.service', () => ({
  extractDocumentData: mockExtractDocumentData
}));

jest.mock('../src/models/Document', () => ({
  create: mockDocumentCreate
}));

jest.mock('../src/services/patient.service', () => ({
  createOrUpdatePatient: mockCreateOrUpdatePatient
}));

const { app } = require('../src/app');

const extractedData = {
  name: { value: 'Ravi Kumar', confidence: 0.98 },
  age: { value: 52, confidence: 0.99 }
};

function extractionResult() {
  return {
    extractedData,
    confidence: { name: 0.98, age: 0.99 }
  };
}

function upload(documentType = 'PATIENT_REGISTRATION') {
  return request(app)
    .post('/api/documents/extract')
    .field('documentType', documentType)
    .attach('file', Buffer.from('document bytes'), {
      filename: 'registration.png',
      contentType: 'image/png'
    });
}

describe('document extraction endpoint', () => {
  beforeEach(() => {
    mockExtractDocumentData.mockReset();
    mockDocumentCreate.mockReset();
    mockCreateOrUpdatePatient.mockReset();
    mockExtractDocumentData.mockResolvedValue(extractionResult());
    mockDocumentCreate.mockImplementation(async data => ({
      _id: 'document-123',
      ...data
    }));
  });

  test('returns 400 when file is missing', async () => {
    const response = await request(app)
      .post('/api/documents/extract')
      .field('documentType', 'PATIENT_REGISTRATION');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('file is required');
    expect(mockExtractDocumentData).not.toHaveBeenCalled();
  });

  test('returns 400 for an invalid document type', async () => {
    const response = await upload('UNKNOWN');

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('documentType must be');
    expect(mockExtractDocumentData).not.toHaveBeenCalled();
  });

  test('returns 400 for an unsupported file type', async () => {
    const response = await request(app)
      .post('/api/documents/extract')
      .field('documentType', 'PATIENT_REGISTRATION')
      .attach('file', Buffer.from('not an image'), {
        filename: 'registration.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Unsupported file type');
    expect(mockExtractDocumentData).not.toHaveBeenCalled();
  });

  test('extracts and creates an EXTRACTED document without creating a patient', async () => {
    const response = await upload();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      documentId: 'document-123',
      documentType: 'PATIENT_REGISTRATION',
      extractedData,
      confidence: { name: 0.98, age: 0.99 },
      status: 'EXTRACTED'
    });
    expect(mockExtractDocumentData).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'registration.png', mimetype: 'image/png' }),
      'PATIENT_REGISTRATION'
    );
    expect(mockDocumentCreate).toHaveBeenCalledWith({
      patientId: null,
      documentType: 'PATIENT_REGISTRATION',
      originalFileName: 'registration.png',
      mimeType: 'image/png',
      extractedData,
      confidence: { name: 0.98, age: 0.99 },
      extractionStatus: 'EXTRACTED'
    });
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });

  test('returns 502 and does not create a document when Gemini fails', async () => {
    mockExtractDocumentData.mockRejectedValueOnce(new Error('Gemini unavailable'));

    const response = await upload('MEDICAL_REPORT');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      success: false,
      message: 'Unable to extract document data'
    });
    expect(mockDocumentCreate).not.toHaveBeenCalled();
    expect(mockCreateOrUpdatePatient).not.toHaveBeenCalled();
  });
});
