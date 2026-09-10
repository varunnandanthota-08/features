const express = require('express');
const {
  createEmergency,
  acknowledgeEmergency,
  escalateEmergency,
  resolveEmergency,
  getEmergency,
  getActiveEmergencies
} = require('../controllers/emergency.controller');

const router = express.Router();

router.post('/', createEmergency);
router.post('/:caseId/acknowledge', acknowledgeEmergency);
router.post('/:caseId/escalate', escalateEmergency);
router.post('/:caseId/resolve', resolveEmergency);
router.get('/active', getActiveEmergencies);
router.get('/:caseId', getEmergency);

module.exports = router;
