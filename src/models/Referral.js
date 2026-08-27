const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'],
    required: true
  },
  changedAt: { type: Date, required: true }
}, { _id: false });

const referralSchema = new mongoose.Schema({
  referralId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
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
  statusHistory: { type: [statusHistorySchema], default: [] },
  notes: { type: String, trim: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Referral', referralSchema);