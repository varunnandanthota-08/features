const { GoogleGenAI } = require('@google/genai');

const PRIMARY_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const RETRY_DELAY_MS = 100;

const documentFields = {
  PATIENT_REGISTRATION: ['name', 'age', 'gender', 'phone', 'village', 'address'],
  MEDICAL_REPORT: [
    'patientName',
    'reportDate',
    'diagnosis',
    'bloodPressure',
    'medications',
    'doctor',
    'otherRelevantInformation'
  ]
};

function getFileParts(file) {
  const buffer = Buffer.isBuffer(file) ? file : file?.buffer;
  const mimeType = Buffer.isBuffer(file) ? 'application/octet-stream' : (file?.mimetype || file?.mimeType);

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new TypeError('A document file buffer is required');
  }
  if (!mimeType || typeof mimeType !== 'string') {
    throw new TypeError('A document MIME type is required');
  }

  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  };
}

function buildExtractionPrompt(documentType, fields) {
  const fieldShape = fields.reduce((shape, field) => {
    shape[field] = { value: null, confidence: null };
    return shape;
  }, {});

  return [
    `Extract only information visibly present in this ${documentType} document.`,
    'Do not infer, diagnose, summarize beyond the document, or invent missing values.',
    'Use null for a value that cannot be read or is not present.',
    'Return only valid JSON with exactly this structure:',
    JSON.stringify(fieldShape),
    'Each confidence must be a number from 0 to 1 when readable, otherwise null.'
  ].join('\n');
}

function normalizeExtraction(data, fields) {
  const normalized = {};

  for (const field of fields) {
    const extracted = data && typeof data[field] === 'object' && data[field] !== null
      ? data[field]
      : {};
    const confidence = typeof extracted.confidence === 'number'
      && extracted.confidence >= 0
      && extracted.confidence <= 1
      ? extracted.confidence
      : null;

    normalized[field] = {
      value: extracted.value ?? null,
      confidence
    };
  }

  return normalized;
}

function getResponseText(result) {
  const text = typeof result?.text === 'function' ? result.text() : result?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini returned an empty extraction response');
  }
  return text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
}

function isTransientAvailabilityError(error) {
  const status = error?.status ?? error?.statusCode ?? error?.code;
  const message = typeof error?.message === 'string' ? error.message : '';

  return status === 503
    || /\b503\b/.test(message)
    || /unavailable|high demand|overloaded/i.test(message);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function extractDocumentData(file, documentType) {
  const fields = documentFields[documentType];
  if (!fields) {
    throw new Error(`Unsupported document type: ${documentType}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      contents: [{
        role: 'user',
        parts: [
          { text: buildExtractionPrompt(documentType, fields) },
          getFileParts(file)
        ]
      }],
      config: {
        responseMimeType: 'application/json'
      }
    };
    const models = [PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL];
    let result;

    for (let attempt = 0; attempt < models.length; attempt += 1) {
      try {
        result = await ai.models.generateContent({ ...request, model: models[attempt] });
        break;
      } catch (error) {
        const canRetry = isTransientAvailabilityError(error) && attempt < models.length - 1;
        if (!canRetry) throw error;
        await delay(RETRY_DELAY_MS);
      }
    }

    const parsed = JSON.parse(getResponseText(result));
    const normalized = normalizeExtraction(parsed, fields);

    return {
      extractedData: normalized,
      confidence: Object.fromEntries(
        Object.entries(normalized).map(([field, extraction]) => [field, extraction.confidence])
      )
    };
  } catch (error) {
    if (error.message === 'GEMINI_API_KEY is not configured'
      || error.message.startsWith('Unsupported document type:')
      || error.message.includes('file buffer is required')
      || error.message.includes('MIME type is required')) {
      throw error;
    }
    throw new Error(`Gemini document extraction failed: ${error.message}`);
  }
}

module.exports = { extractDocumentData };
