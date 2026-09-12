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

const caseSchema = new mongoose.Schema({
  caseId: { type: String, required: true, unique: true, index: true, trim: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  source: {
    type: String,
    enum: ['PHONE_IVR', 'WHATSAPP', 'SMS', 'DASHBOARD'],
    required: true
  },
  complaint: { type: String, required: true, trim: true },
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  assignedHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  sourceHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  referredToHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  referralId: { type: String, ref: 'Referral', default: null, index: true, trim: true },
  referredAt: { type: Date, default: null },
  assignedWorkerId: { type: String, default: null, trim: true },
  status: {
    type: String,
    enum: ['NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REFERRED', 'RESOLVED'],
    default: 'NEW'
  },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedByHealthCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCenter', default: null },
  acknowledgedByWorkerId: { type: String, default: null, trim: true },
  resolvedAt: { type: Date, default: null },
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
}, { timestamps: true });

module.exports = mongoose.model('Case', caseSchema);
