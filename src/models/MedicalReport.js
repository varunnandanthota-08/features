const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  patientName: {
    type: String,
    default: null
  },
  reportDate: {
    type: String,
    default: null
  },
  diagnosis: {
    type: String,
    default: null
  },
  bloodPressure: {
    type: String,
    default: null
  },
  medications: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  doctor: {
    type: String,
    default: null
  },
  otherRelevantInformation: {
    type: String,
    default: null
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    unique: true
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

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
