const mongoose = require('mongoose');

async function connectToDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    return false;
  }

  await mongoose.connect(MONGODB_URI);
  return true;
}

module.exports = { connectToDatabase };
