const mongoose = require('mongoose');

const emergencyCaseSchema = new mongoose.Schema({
  caseId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  type: {
    type: String,
    enum: ['EMERGENCY'],
    default: 'EMERGENCY'
  },
  priority: {
    type: String,
    enum: ['CRITICAL'],
    default: 'CRITICAL'
  },
  source: {
    type: String,
    enum: ['PHONE_IVR', 'WHATSAPP', 'SMS', 'HEALTH_WORKER', 'DASHBOARD', 'AUTOMATIC_DETECTION'],
    required: true
  },
  reason: { type: String, required: true, trim: true },
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  locationStatus: {
    type: String,
    enum: ['RESOLVED', 'UNRESOLVED'],
    default: 'UNRESOLVED'
  },
  locationLabel: { type: String, default: null, trim: true },
  assignedWorkerId: { type: String, default: null, trim: true },
  assignedHealthCenterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthCenter',
    default: null
  },
  assignmentStatus: {
    type: String,
    enum: ['ASSIGNED', 'PENDING', 'ASSIGNMENT_PENDING'],
    default: 'PENDING'
  },
  referredFacilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthCenter',
    default: null
  },
  status: {
    type: String,
    enum: ['REGISTERED', 'ALERTED', 'ACKNOWLEDGED', 'RESPONDING', 'REFERRED', 'ESCALATED', 'RESOLVED'],
    default: 'REGISTERED'
  },
  acknowledgedBy: { type: String, default: null, trim: true },
  acknowledgedAt: { type: Date, default: null },
  escalationLevel: { type: Number, min: 0, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('EmergencyCase', emergencyCaseSchema);
