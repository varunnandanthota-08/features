const mongoose = require('mongoose');
const Document = require('../models/Document');
const { extractDocumentData } = require('../services/gemini.service');
const { verifyDocument: verifyDocumentService } = require('../services/document.service');

const documentTypes = new Set(['PATIENT_REGISTRATION', 'MEDICAL_REPORT']);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateRequest(req) {
  if (!req.file) throw badRequest('file is required');

  const documentType = typeof req.body?.documentType === 'string'
    ? req.body.documentType.trim()
    : '';
  if (!documentTypes.has(documentType)) {
    throw badRequest('documentType must be PATIENT_REGISTRATION or MEDICAL_REPORT');
  }

  const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim() : '';
  if (patientId && !mongoose.Types.ObjectId.isValid(patientId)) {
    throw badRequest('patientId must be a valid identifier');
  }

  return { documentType, patientId: patientId || null };
}

async function extractDocument(req, res) {
  try {
    const { documentType, patientId } = validateRequest(req);
    let extraction;

    try {
      extraction = await extractDocumentData(req.file, documentType);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Document] Extraction failed:', {
          name: error.name,
          message: error.message,
          documentType,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          fileName: req.file.originalname
        });
      } else {
        console.error('[Document] Extraction failed');
      }
      return res.status(502).json({
        success: false,
        message: 'Unable to extract document data'
      });
    }

    const document = await Document.create({
      patientId,
      documentType,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      extractedData: extraction.extractedData,
      confidence: extraction.confidence,
      extractionStatus: 'EXTRACTED'
    });

    return res.status(200).json({
      success: true,
      documentId: document._id,
      documentType: document.documentType,
      extractedData: document.extractedData,
      confidence: document.confidence,
      status: document.extractionStatus
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    console.error('[Document] Extraction request failed:', error.message);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Unable to process document extraction' : error.message
    });
  }
}

async function verifyDocument(req, res) {
  try {
    const { documentId, patientId, fields, verifiedBy } = req.body || {};
    const document = await verifyDocumentService({ documentId, patientId, fields, verifiedBy });

    return res.status(200).json({
      success: true,
      documentId: document._id,
      documentType: document.documentType,
      patientId: document.patientId,
      extractedData: document.extractedData,
      status: document.extractionStatus,
      verifiedBy: document.verifiedBy,
      verifiedAt: document.verifiedAt
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    console.error('[Document] Verification failed:', error.message);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Unable to verify document' : error.message
    });
  }
}

module.exports = { extractDocument, verifyDocument };
