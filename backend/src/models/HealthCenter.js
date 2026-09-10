const mongoose = require('mongoose');

const healthCenterSchema = new mongoose.Schema({
  healthCenterId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  village: { type: String, trim: true },
  district: { type: String, trim: true },
  state: { type: String, trim: true },
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  services: [{ type: String, trim: true }],
  doctors: {
    general: { type: Number, default: 0, min: 0 },
    ent: { type: Number, default: 0, min: 0 },
    cardiology: { type: Number, default: 0, min: 0 },
    pediatrics: { type: Number, default: 0, min: 0 },
    gynecology: { type: Number, default: 0, min: 0 }
  },
  equipment: {
    ecg: { type: Boolean, default: false },
    xray: { type: Boolean, default: false },
    ultrasound: { type: Boolean, default: false }
  },
  capacity: { type: Number, required: true, min: 0 },
  currentPatientLoad: { type: Number, default: 0, min: 0 },
  emergencyAvailable: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('HealthCenter', healthCenterSchema);