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
    required: true
  },
  age: {
    type: Number,
    required: true,
    min: 1,
    max: 120
  },
  gender: {
    type: String,
    required: true,
    enum: ['male', 'female', 'other', 'prefer_not_to_say']
  },
  location: {
    village: {
      type: String,
      required: true
    }
  },
  language: {
    type: String,
    required: true,
    enum: ['te', 'hi', 'en']
  },
  symptomsDescription: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true,
    default: 'WHATSAPP',
    enum: ['WHATSAPP', 'IVR']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema);
