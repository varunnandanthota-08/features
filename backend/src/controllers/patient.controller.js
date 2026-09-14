const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { validatePatientData, toPatientDocument } = require('../services/patient.service');

const registerPatient = async (req, res) => {
  try {
    const { phone, name, age, gender, village, language, symptomsDescription } = req.body;
    
    // We only need the basic patient info for a health profile, not symptomsDescription
    // But validatePatientData might expect it. Wait, the model just requires phone.
    // Let's create it directly to avoid the strict validation of patient.service which is meant for cases.
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    let patient = await Patient.findOne({ phone });
    if (patient) {
      return res.status(400).json({ success: false, message: 'Patient with this phone already exists' });
    }

    patient = new Patient({
      phone,
      name: name || null,
      age: age ? Number(age) : null,
      gender: gender || null,
      location: { village: village || null },
      language: language || null,
      source: 'DASHBOARD'
    });

    await patient.save();

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: patient
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const User = require('../models/User');
const { geocodeLocation } = require('../services/geocoding.service');

const allowedGenders = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const allowedLanguages = new Set(['te', 'hi', 'en']);

const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'PATIENT') {
      return res.status(401).json({ success: false, message: 'Unauthorized or not a patient' });
    }

    let patient = null;
    if (user.patientId) {
      patient = await Patient.findById(user.patientId);
    }
    if (!patient && user.phone) {
      patient = await Patient.findOne({ phone: user.phone });
      if (patient) {
        user.patientId = patient._id;
        await user.save();
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          userId: user._id,
          username: user.username,
          email: user.email,
          name: user.name,
          phone: user.phone,
          patientId: user.patientId
        },
        patient: patient || null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updatePatient = async (req, res) => {
  try {
    const { name, age, gender, village, language, phone } = req.body;
    
    // We get the User strictly based on authenticated req.user.userId
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'PATIENT') {
      return res.status(401).json({ success: false, message: 'Unauthorized or not a patient' });
    }

    // Validation using existing backend model rules
    if (age !== undefined && age !== null && age !== '') {
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        return res.status(400).json({ success: false, message: 'Patient age must be an integer between 1 and 120' });
      }
    }

    if (gender && !allowedGenders.has(gender)) {
      return res.status(400).json({ success: false, message: 'Patient gender is invalid' });
    }

    if (language && !allowedLanguages.has(language)) {
      return res.status(400).json({ success: false, message: 'Patient language is invalid' });
    }

    const effectivePhone = phone ? String(phone).trim() : (user.phone || null);

    let patient = null;
    if (user.patientId) {
      patient = await Patient.findById(user.patientId);
    }
    if (!patient && effectivePhone) {
      patient = await Patient.findOne({ phone: effectivePhone });
    }

    if (!patient) {
      if (!effectivePhone) {
        return res.status(400).json({ success: false, message: 'Phone number is required for initial profile creation' });
      }
      
      const newLocation = { village: village ? String(village).trim() : null };
      if (newLocation.village) {
        try {
          const coords = await geocodeLocation(newLocation.village);
          if (coords) {
            newLocation.latitude = coords.latitude;
            newLocation.longitude = coords.longitude;
          }
        } catch (_) {}
      }

      patient = new Patient({
        phone: effectivePhone,
        name: name ? String(name).trim() : null,
        age: (age !== undefined && age !== null && age !== '') ? Number(age) : null,
        gender: gender || null,
        location: newLocation,
        language: language || null,
        source: 'DASHBOARD'
      });
      await patient.save();
      user.patientId = patient._id;
    } else {
      // Update existing patient
      if (name !== undefined) patient.name = name ? String(name).trim() : null;
      if (age !== undefined && age !== null && age !== '') patient.age = Number(age);
      if (gender !== undefined) patient.gender = gender;
      if (language !== undefined) patient.language = language;
      if (village !== undefined) {
        const trimmedVillage = village ? String(village).trim() : null;
        patient.location = { ...(patient.location || {}), village: trimmedVillage };
        if (trimmedVillage) {
          try {
            const coords = await geocodeLocation(trimmedVillage);
            if (coords) {
              patient.location.latitude = coords.latitude;
              patient.location.longitude = coords.longitude;
            }
          } catch (_) {}
        }
      }
      if (effectivePhone && effectivePhone !== patient.phone) {
        patient.phone = effectivePhone;
      }
      
      await patient.save();
      if (!user.patientId) {
        user.patientId = patient._id;
      }
    }

    // Keep User record in sync
    if (patient.name) user.name = patient.name;
    if (patient.phone) user.phone = patient.phone;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Health profile updated successfully',
      data: {
        patient,
        user: {
          userId: user._id,
          username: user.username,
          email: user.email,
          name: user.name,
          phone: user.phone,
          patientId: user.patientId
        }
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const getPatients = async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: patients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) return res.status(400).json({ success: false, message: 'Patient ID is required' });
    
    let patient = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      patient = await Patient.findById(rawId);
    }
    if (!patient) {
      patient = await Patient.findOne({ phone: rawId });
    }
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const Case = require('../models/Case');
    const Referral = require('../models/Referral');
    const Document = require('../models/Document');

    const [cases, referrals, documents] = await Promise.all([
      Case.find({ patientId: patient._id }).sort({ createdAt: -1 }),
      Referral.find({ patientId: patient._id }).sort({ createdAt: -1 }),
      Document.find({ patientId: patient._id }).sort({ createdAt: -1 })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        patient,
        cases,
        referrals,
        documents
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerPatient,
  getMyProfile,
  updatePatient,
  getPatients,
  getPatientById
};
