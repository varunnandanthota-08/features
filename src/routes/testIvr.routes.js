const express = require('express');
const { createTestIvrController } = require('../controllers/testIvr.controller');
const ivrService = require('../services/ivr.service');

const controller = createTestIvrController(ivrService);
const router = express.Router();

router.post('/start', controller.start);
router.post('/input', controller.input);
router.post('/reset', controller.reset);

module.exports = router;