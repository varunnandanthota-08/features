const Referral = require('../models/Referral');
const HealthCenter = require('../models/HealthCenter');
const { createReferralWithCase, updateReferralStatusWithCase } = require('../services/referral.service');

const allowedStatuses = ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];
const validTransitions = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateCreateInput(body) {
  for (const field of ['referralId', 'caseId', 'patientId', 'fromHealthCenterId', 'toHealthCenterId', 'reason']) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      throw badRequest(`${field} is required`);
    }
  }

  if (body.fromHealthCenterId.trim() === body.toHealthCenterId.trim()) {
    throw badRequest('source and destination health centres must be different');
  }

  if (body.status !== undefined && !allowedStatuses.includes(body.status)) {
    throw badRequest('status must be PENDING, ACCEPTED, COMPLETED, or CANCELLED');
  }
}

function sendError(res, error, fallbackMessage) {
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: 'referralId already exists' });
  }
  const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  console.error(`[Referral] ${fallbackMessage}:`, error.message);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

async function createReferral(req, res) {
  try {
    const body = req.body || {};
    if (req.user && req.user.role === 'HEALTH_WORKER') {
      body.fromHealthCenterId = req.user.healthCenterId; // Prevent spoofing
    } else if (req.user && req.user.role === 'PATIENT') {
      const User = require('../models/User');
      const Patient = require('../models/Patient');
      const Case = require('../models/Case');
      const user = await User.findById(req.user.userId);
      let patientId = user?.patientId;
      if (!patientId && user?.phone) {
        const p = await Patient.findOne({ phone: user.phone });
        patientId = p?._id;
      }
      if (!patientId) {
        return res.status(403).json({ success: false, message: 'Patient profile not found' });
      }
      const caseRecord = await Case.findOne({ caseId: body.caseId?.trim() });
      if (!caseRecord || String(caseRecord.patientId) !== String(patientId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized to refer this case' });
      }
      body.patientId = String(patientId);
      if (!body.fromHealthCenterId && caseRecord.assignedHealthCenterId) {
        const assignedHc = await HealthCenter.findById(caseRecord.assignedHealthCenterId);
        if (assignedHc) body.fromHealthCenterId = assignedHc.healthCenterId;
      }
    }
    validateCreateInput(body);

    const sourceHealthCenter = await HealthCenter.findOne({ healthCenterId: body.fromHealthCenterId.trim() });
    if (!sourceHealthCenter) {
      return res.status(404).json({ success: false, message: 'Source health centre not found' });
    }

    const destinationHealthCenter = await HealthCenter.findOne({ healthCenterId: body.toHealthCenterId.trim() });
    if (!destinationHealthCenter) {
      return res.status(404).json({ success: false, message: 'Destination health centre not found' });
    }

    const referral = await createReferralWithCase(body, { sourceHealthCenter, destinationHealthCenter });
    return res.status(201).json({ success: true, data: referral });
  } catch (error) {
    return sendError(res, error, 'Unable to create referral');
  }
}

async function getReferralById(req, res) {
  try {
    const referral = await Referral.findOne({ referralId: req.params.referralId });
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found' });
    if (req.user && req.user.role === 'HEALTH_WORKER') {
      if (referral.fromHealthCenterId !== req.user.healthCenterId && referral.toHealthCenterId !== req.user.healthCenterId) {
        return res.status(403).json({ success: false, message: 'Unauthorized to access this referral' });
      }
    } else if (req.user && req.user.role === 'PATIENT') {
      const User = require('../models/User');
      const Patient = require('../models/Patient');
      const user = await User.findById(req.user.userId);
      let patientId = user?.patientId;
      if (!patientId && user?.phone) {
        const p = await Patient.findOne({ phone: user.phone });
        patientId = p?._id;
      }
      if (!patientId || String(referral.patientId) !== String(patientId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized to access this referral' });
      }
    }
    return res.status(200).json({ success: true, data: referral });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve referral');
  }
}

async function getReferrals(req, res) {
  try {
    const query = {};
    if (req.user && req.user.role === 'HEALTH_WORKER') {
      query.$or = [
        { fromHealthCenterId: req.user.healthCenterId },
        { toHealthCenterId: req.user.healthCenterId }
      ];
    }
    if (req.query.status !== undefined) {
      if (!allowedStatuses.includes(req.query.status)) {
        throw badRequest('status must be PENDING, ACCEPTED, COMPLETED, or CANCELLED');
      }
      query.status = req.query.status;
    }
    const referrals = await Referral.find(query);
    return res.status(200).json({ success: true, data: referrals });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve referrals');
  }
}

async function getPatientReferrals(req, res) {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user?.userId);
    const patientId = req.user?.patientId || user?.patientId;
    if (!patientId) {
      return res.status(200).json({ success: true, data: [] });
    }
    const referrals = await Referral.find({ patientId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: referrals });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve patient referrals');
  }
}

async function updateReferralStatus(req, res) {
  try {
    const referral = await Referral.findOne({ referralId: req.params.referralId });
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found' });

    if (req.user && req.user.role === 'HEALTH_WORKER') {
      if (referral.toHealthCenterId !== req.user.healthCenterId) {
        return res.status(403).json({ success: false, message: 'Only the destination health centre can update the referral status' });
      }
    }

    const requestedStatus = req.body?.status;
    if (typeof requestedStatus !== 'string' || !requestedStatus.trim()) {
      throw badRequest('status is required');
    }
    if (!allowedStatuses.includes(requestedStatus)) {
      throw badRequest('status must be PENDING, ACCEPTED, COMPLETED, or CANCELLED');
    }
    if (!validTransitions[referral.status]?.includes(requestedStatus)) {
      throw badRequest('Invalid referral status transition');
    }

    await updateReferralStatusWithCase(referral, requestedStatus);
    return res.status(200).json({ success: true, data: referral });
  } catch (error) {
    return sendError(res, error, 'Unable to update referral status');
  }
}

module.exports = { createReferral, getReferralById, getReferrals, getPatientReferrals, updateReferralStatus };