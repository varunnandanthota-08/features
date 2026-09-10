const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: null
  },
  age: {
    type: Number,
    min: 1,
    max: 120,
    default: null
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: null
  },
  location: {
    village: {
      type: String,
      default: null
    },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  language: {
    type: String,
    enum: ['te', 'hi', 'en'],
    default: null
  },
  symptomsDescription: {
    type: String,
    default: null
  },
  source: {
    type: String,
    required: true,
    default: 'WHATSAPP',
    enum: ['WHATSAPP', 'IVR', 'SMS', 'DASHBOARD']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema);
