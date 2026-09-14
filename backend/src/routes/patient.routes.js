const express = require('express');
const { registerPatient, getMyProfile, updatePatient, getPatients, getPatientById } = require('../controllers/patient.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

// Only allow HEALTH_WORKER (or ADMIN if applicable) to register a patient via dashboard
router.post('/register', authenticate, requireRole('HEALTH_WORKER'), registerPatient);

// Allow a PATIENT to get their own profile
router.get('/me', authenticate, requireRole('PATIENT'), getMyProfile);

// Allow a PATIENT to update their own profile
router.put('/me', authenticate, requireRole('PATIENT'), updatePatient);

// Allow a HEALTH_WORKER to view all patients
router.get('/', authenticate, requireRole('HEALTH_WORKER'), getPatients);

// Get patient by id (accessible to authenticated worker or the patient themselves)
router.get('/:id', authenticate, getPatientById);

module.exports = router;
