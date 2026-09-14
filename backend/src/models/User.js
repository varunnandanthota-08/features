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
  },
  name: {
    type: String,
    default: null,
    trim: true
  },
  email: {
    type: String,
    default: null,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    default: null,
    trim: true
  }
}, { timestamps: true });

userSchema.pre('save', function (next) {
  if (this.role === 'HEALTH_WORKER' && !this.healthCenterId) {
    return next(new Error('HEALTH_WORKER must be associated with a healthCenterId'));
  }
  // PATIENT role does NOT require a patientId immediately on signup. 
  // It is linked later during the health profile / case intake flow.
  next();
});

module.exports = mongoose.model('User', userSchema);
