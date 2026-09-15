const express = require('express');
const { createIvrController } = require('../controllers/ivr.controller');
const ivrService = require('../services/ivr.service');
const { createTwilioWebhookValidation } = require('../middleware/twilioWebhookValidation');

const controller = createIvrController(ivrService);
const router = express.Router();
const ivrWebhookValidation = createTwilioWebhookValidation({ useRequestUrl: true });

router.post('/incoming', ivrWebhookValidation, controller.incoming);
router.post('/language', ivrWebhookValidation, controller.language);
router.post('/menu', ivrWebhookValidation, controller.menu);
router.post('/name', ivrWebhookValidation, controller.name);
router.post('/age', ivrWebhookValidation, controller.age);
router.post('/gender', ivrWebhookValidation, controller.gender);
router.post('/location', ivrWebhookValidation, controller.location);
router.post('/symptoms', ivrWebhookValidation, controller.symptoms);
router.post('/duration', ivrWebhookValidation, controller.duration);
router.post('/severity', ivrWebhookValidation, controller.severity);
router.post('/emergency-screen', ivrWebhookValidation, controller.emergencyScreen);
router.post('/confirm', ivrWebhookValidation, controller.confirm);
router.post('/edit-selection', ivrWebhookValidation, controller.editSelection);
router.post('/edit-value', ivrWebhookValidation, controller.editValue);
router.post('/emergency-location', ivrWebhookValidation, controller.emergencyLocation);
router.post('/emergency-location-confirm', ivrWebhookValidation, controller.emergencyLocationConfirm);
router.post('/status-callback', ivrWebhookValidation, controller.statusCallback);

module.exports = router;