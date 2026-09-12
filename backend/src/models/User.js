const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['HEALTH_WORKER', 'PATIENT'],
    required: true
  },
  healthCenterId: {
    type: String,
    default: null
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null
  }
}, { timestamps: true });

userSchema.pre('save', function (next) {
  if (this.role === 'HEALTH_WORKER' && !this.healthCenterId) {
    return next(new Error('HEALTH_WORKER must be associated with a healthCenterId'));
  }
  if (this.role === 'PATIENT' && !this.patientId) {
    return next(new Error('PATIENT must be associated with a patientId'));
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
