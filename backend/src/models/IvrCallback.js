const mongoose = require('mongoose');

const ivrCallbackSchema = new mongoose.Schema({
  callSid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  callerPhone: {
    type: String,
    required: true,
    index: true
  },
  callStatus: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  callbackRequested: {
    type: Boolean,
    default: true
  },
  callbackStatus: {
    type: String,
    enum: ['PENDING', 'CALLING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  callbackCallSid: {
    type: String,
    default: null
  },
  lastAttemptAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('IvrCallback', ivrCallbackSchema);
