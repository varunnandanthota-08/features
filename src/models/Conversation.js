const mongoose = require('mongoose');
const { CONVERSATION_STATES } = require('../constants/conversationStates');

const conversationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  callSid: {
    type: String,
    default: null,
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

conversationSchema.index(
  { phone: 1, channel: 1 },
  {
    name: 'whatsapp_phone_channel_unique',
    unique: true,
    partialFilterExpression: { channel: 'WHATSAPP' }
  }
);
conversationSchema.index(
  { callSid: 1, channel: 1 },
  {
    name: 'ivr_call_sid_channel_unique',
    unique: true,
    partialFilterExpression: { channel: 'IVR', callSid: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Conversation', conversationSchema);
