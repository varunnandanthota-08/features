const express = require('express');
const {
  createReferral,
  getReferralById,
  getReferrals,
  updateReferralStatus
} = require('../controllers/referral.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', authenticate, requireRole('HEALTH_WORKER'), createReferral);
router.get('/', authenticate, requireRole('HEALTH_WORKER'), getReferrals);
router.patch('/:referralId/status', authenticate, requireRole('HEALTH_WORKER'), updateReferralStatus);
router.get('/:referralId', authenticate, requireRole('HEALTH_WORKER'), getReferralById);

module.exports = router;