const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'],
    required: true
  },
  changedAt: { type: Date, required: true }
}, { _id: false });

const escalationHistorySchema = new mongoose.Schema({
  level: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['ESCALATED'], required: true },
  escalatedAt: { type: Date, required: true },
  escalatedFromHealthCenterId: { type: String, default: null, trim: true },
  escalatedToHealthCenterId: { type: String, default: null, trim: true }
}, { _id: false });

const referralSchema = new mongoose.Schema({
  referralId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  caseId: { type: String, required: true, index: true, trim: true },
  patientId: { type: String, required: true, trim: true },
  fromHealthCenterId: { type: String, required: true, trim: true },
  toHealthCenterId: { type: String, required: true, trim: true },
  reason: { type: String, required: true, trim: true },
  requiredService: { type: String, trim: true },
  requiredEquipment: { type: String, trim: true },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  acceptanceDueAt: { type: Date, default: null, index: true },
  escalationStatus: { type: String, enum: ['NOT_ESCALATED', 'ESCALATED'], default: 'NOT_ESCALATED' },
  escalationLevel: { type: Number, min: 0, default: 0 },
  escalatedAt: { type: Date, default: null },
  escalatedFromHealthCenterId: { type: String, default: null, trim: true },
  escalatedToHealthCenterId: { type: String, default: null, trim: true },
  escalationHistory: { type: [escalationHistorySchema], default: [] },
  statusHistory: { type: [statusHistorySchema], default: [] },
  notes: { type: String, trim: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Referral', referralSchema);