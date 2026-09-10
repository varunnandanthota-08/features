const { GoogleGenAI } = require('@google/genai');

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn()
}));

const { extractDocumentData } = require('../src/services/gemini.service');

const extractionResponse = {
  text: JSON.stringify({
    name: { value: 'Ravi Kumar', confidence: 0.98 },
    age: { value: 52, confidence: 0.99 },
    gender: { value: 'male', confidence: 0.98 },
    phone: { value: '+919392123042', confidence: 0.97 },
    village: { value: 'Village A', confidence: 0.95 },
    address: { value: null, confidence: null }
  })
};

const medicalReportResponse = {
  text: JSON.stringify({
    patientName: { value: 'Ravi Kumar', confidence: 0.96 },
    reportDate: { value: '2026-09-10', confidence: 0.94 },
    diagnosis: { value: 'Hypertension', confidence: 0.91 },
    bloodPressure: { value: '140/90', confidence: 0.97 },
    medications: { value: ['Medication A'], confidence: 0.9 },
    doctor: { value: 'Dr. Rao', confidence: 0.95 }
  })
};

const file = { buffer: Buffer.from('document bytes'), mimetype: 'image/png' };

describe('Gemini document extraction resilience', () => {
  let generateContent;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent = jest.fn();
    GoogleGenAI.mockImplementation(() => ({
      models: { generateContent }
    }));
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    jest.clearAllMocks();
  });

  test('retries the primary model once after a transient 503', async () => {
    generateContent
      .mockRejectedValueOnce({ status: 503, message: 'UNAVAILABLE: high demand' })
      .mockResolvedValueOnce(extractionResponse);

    await expect(extractDocumentData(file, 'PATIENT_REGISTRATION')).resolves.toEqual(expect.objectContaining({
      extractedData: expect.objectContaining({ name: { value: 'Ravi Kumar', confidence: 0.98 } })
    }));

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-3.6-flash',
      'gemini-3.6-flash'
    ]);
  });

  test('uses the supported fallback after the primary model remains unavailable', async () => {
    generateContent
      .mockRejectedValueOnce({ status: 503, message: 'UNAVAILABLE' })
      .mockRejectedValueOnce({ status: 503, message: 'model overloaded' })
      .mockResolvedValueOnce(extractionResponse);

    await expect(extractDocumentData(file, 'PATIENT_REGISTRATION')).resolves.toBeDefined();

    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-3.6-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash'
    ]);
  });

  test('does not retry non-transient errors', async () => {
    generateContent.mockRejectedValueOnce({ status: 400, message: 'Invalid API key' });

    await expect(extractDocumentData(file, 'PATIENT_REGISTRATION'))
      .rejects.toThrow('Gemini document extraction failed: Invalid API key');

    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  test('extracts medical report fields and normalizes missing fields to null', async () => {
    generateContent.mockResolvedValueOnce(medicalReportResponse);

    await expect(extractDocumentData(file, 'MEDICAL_REPORT')).resolves.toEqual({
      extractedData: {
        patientName: { value: 'Ravi Kumar', confidence: 0.96 },
        reportDate: { value: '2026-09-10', confidence: 0.94 },
        diagnosis: { value: 'Hypertension', confidence: 0.91 },
        bloodPressure: { value: '140/90', confidence: 0.97 },
        medications: { value: ['Medication A'], confidence: 0.9 },
        doctor: { value: 'Dr. Rao', confidence: 0.95 },
        otherRelevantInformation: { value: null, confidence: null }
      },
      confidence: {
        patientName: 0.96,
        reportDate: 0.94,
        diagnosis: 0.91,
        bloodPressure: 0.97,
        medications: 0.9,
        doctor: 0.95,
        otherRelevantInformation: null
      }
    });
  });
});