const express = require('express');
const {
  createReferral,
  getReferralById,
  getReferrals,
  updateReferralStatus
} = require('../controllers/referral.controller');

const router = express.Router();

router.post('/', createReferral);
router.get('/', getReferrals);
router.patch('/:referralId/status', updateReferralStatus);
router.get('/:referralId', getReferralById);

module.exports = router;