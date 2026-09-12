const express = require('express');
const {
  createEmergency,
  acknowledgeEmergency,
  escalateEmergency,
  resolveEmergency,
  getEmergency,
  getActiveEmergencies
} = require('../controllers/emergency.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', createEmergency); // Public SOS
router.post('/:caseId/acknowledge', authenticate, requireRole('HEALTH_WORKER'), acknowledgeEmergency);
router.post('/:caseId/escalate', authenticate, requireRole('HEALTH_WORKER'), escalateEmergency);
router.post('/:caseId/resolve', authenticate, requireRole('HEALTH_WORKER'), resolveEmergency);
router.get('/active', authenticate, requireRole('HEALTH_WORKER'), getActiveEmergencies);
router.get('/:caseId', authenticate, requireRole('HEALTH_WORKER'), getEmergency);

module.exports = router;
