const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null
  },
  documentType: {
    type: String,
    required: true,
    enum: ['PATIENT_REGISTRATION', 'MEDICAL_REPORT']
  },
  originalFileName: {
    type: String,
    default: null
  },
  mimeType: {
    type: String,
    default: null
  },
  extractedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  confidence: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  extractionStatus: {
    type: String,
    required: true,
    enum: ['DRAFT', 'EXTRACTED', 'VERIFIED', 'FAILED'],
    default: 'DRAFT'
  },
  uploadedBy: {
    type: String,
    default: null
  },
  verifiedBy: {
    type: String,
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Document', documentSchema);
