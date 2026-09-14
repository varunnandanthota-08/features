const express = require('express');
const {
  createHealthCenter,
  getHealthCenters,
  geocodeHealthCenterLocation,
  getHealthCenterById,
  updateHealthCenterAvailability,
  searchHealthCenters,
  getNearbyHealthCenters,
  recommendHealthCenters,
  getOverviewStats
} = require('../controllers/healthCenter.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

// Restrict to ADMIN (which doesn't exist yet) to prevent arbitrary creation
router.post('/', authenticate, requireRole('ADMIN'), createHealthCenter);
router.get('/', getHealthCenters);
router.get('/stats', getOverviewStats);
router.get('/nearby', getNearbyHealthCenters);
router.get('/recommend', recommendHealthCenters);
router.get('/geocode', geocodeHealthCenterLocation);
router.get('/search', searchHealthCenters);
router.patch('/:healthCenterId/availability', authenticate, requireRole('HEALTH_WORKER'), updateHealthCenterAvailability);
router.get('/:healthCenterId', getHealthCenterById);

module.exports = router;