const express = require('express');
const { createSmsController } = require('../controllers/sms.controller');

function createSmsRouter({ conversationProcessor } = {}) {
  const router = express.Router();
  const options = conversationProcessor ? { processMessage: conversationProcessor } : {};
  router.post('/webhook', createSmsController(options));
  return router;
}

module.exports = createSmsRouter();
module.exports.createSmsRouter = createSmsRouter;