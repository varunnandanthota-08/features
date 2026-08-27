const express = require('express');
const {
  createHealthCenter,
  getHealthCenters,
  getHealthCenterById,
  updateHealthCenterAvailability,
  searchHealthCenters,
  getNearbyHealthCenters,
  recommendHealthCenters
} = require('../controllers/healthCenter.controller');

const router = express.Router();

router.post('/', createHealthCenter);
router.get('/', getHealthCenters);
router.get('/nearby', getNearbyHealthCenters);
router.get('/recommend', recommendHealthCenters);
router.get('/search', searchHealthCenters);
router.patch('/:healthCenterId/availability', updateHealthCenterAvailability);
router.get('/:healthCenterId', getHealthCenterById);

module.exports = router;