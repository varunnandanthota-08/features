const mongoose = require('mongoose');
const { CONVERSATION_STATES } = require('../constants/conversationStates');

const conversationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  channel: {
    type: String,
    required: true,
    default: 'WHATSAPP'
  },
  state: {
    type: String,
    required: true,
    enum: Object.values(CONVERSATION_STATES),
    default: CONVERSATION_STATES.START
  },
  language: {
    type: String,
    enum: ['te', 'hi', 'en'],
    default: null
  },
  data: {
    name: { type: String, default: null },
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    village: { type: String, default: null },
    symptomsDescription: { type: String, default: null }
  },
  processedMessageIds: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

conversationSchema.index({ phone: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
