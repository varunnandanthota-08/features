const express = require('express');
const {
  createHealthCenter,
  getHealthCenters,
  geocodeHealthCenterLocation,
  getHealthCenterById,
  updateHealthCenterAvailability,
  searchHealthCenters,
  getNearbyHealthCenters,
  recommendHealthCenters
} = require('../controllers/healthCenter.controller');

const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

// Restrict to ADMIN (which doesn't exist yet) to prevent arbitrary creation
router.post('/', authenticate, requireRole('ADMIN'), createHealthCenter);
router.get('/', authenticate, getHealthCenters);
router.get('/nearby', authenticate, getNearbyHealthCenters);
router.get('/recommend', authenticate, recommendHealthCenters);
router.get('/geocode', authenticate, geocodeHealthCenterLocation);
router.get('/search', authenticate, searchHealthCenters);
router.patch('/:healthCenterId/availability', authenticate, requireRole('HEALTH_WORKER'), updateHealthCenterAvailability);
router.get('/:healthCenterId', authenticate, getHealthCenterById);

module.exports = router;