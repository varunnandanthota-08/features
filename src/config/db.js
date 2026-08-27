const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');

async function ensureConversationIndexes() {
  const indexes = await Conversation.collection.listIndexes().toArray();
  const legacyIndexNames = ['phone_1_channel_1', 'callSid_1_channel_1'];

  for (const index of indexes) {
    if (legacyIndexNames.includes(index.name)) {
      await Conversation.collection.dropIndex(index.name);
    }
  }

  await Conversation.createIndexes();
}

async function connectToDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    return false;
  }

  await mongoose.connect(MONGODB_URI);
  await ensureConversationIndexes();
  return true;
}

module.exports = { connectToDatabase };
