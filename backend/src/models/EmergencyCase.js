const mongoose = require('mongoose');

const escalationHistorySchema = new mongoose.Schema({
  level: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION', 'RESOLVED'],
    required: true
  },
  reason: { type: String, required: true, trim: true },
  escalatedAt: { type: Date, required: true },
  escalatedFromHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  escalatedToHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  escalatedToHealthWorkerId: { type: String, default: null, trim: true }
}, { _id: false });

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
  escalationLevel: { type: Number, min: 0, default: 0 },
  escalationStatus: {
    type: String,
    enum: ['NOT_ESCALATED', 'ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION', 'RESOLVED'],
    default: 'NOT_ESCALATED'
  },
  escalatedAt: { type: Date, default: null },
  escalationReason: { type: String, default: null, trim: true },
  escalatedFromHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  escalatedToHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  escalatedToHealthWorkerId: { type: String, default: null, trim: true },
  escalationHistory: { type: [escalationHistorySchema], default: [] }
}, {
  timestamps: true
});

module.exports = mongoose.model('EmergencyCase', emergencyCaseSchema);
