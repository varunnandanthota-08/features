const express = require('express');
const {
  createReferral,
  getReferrals,
  getPatientReferrals,
  updateReferralStatus,
  getReferralById
} = require('../controllers/referral.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', authenticate, requireRole('HEALTH_WORKER', 'PATIENT'), createReferral);
router.get('/', authenticate, requireRole('HEALTH_WORKER'), getReferrals);
router.get('/patient', authenticate, requireRole('PATIENT'), getPatientReferrals);
router.patch('/:referralId/status', authenticate, requireRole('HEALTH_WORKER'), updateReferralStatus);
router.get('/:referralId', authenticate, requireRole('HEALTH_WORKER', 'PATIENT'), getReferralById);

module.exports = router;