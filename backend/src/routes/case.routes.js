const express = require('express');
const {
  createCase,
  getActiveCases,
  acknowledgeCase,
  resolveCase,
  escalateCase
} = require('../controllers/case.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', createCase); // Public intake
router.get('/active', authenticate, requireRole('HEALTH_WORKER'), getActiveCases);
router.post('/:caseId/acknowledge', authenticate, requireRole('HEALTH_WORKER'), acknowledgeCase);
router.post('/:caseId/escalate', authenticate, requireRole('HEALTH_WORKER'), escalateCase);
router.post('/:caseId/resolve', authenticate, requireRole('HEALTH_WORKER'), resolveCase);

module.exports = router;
