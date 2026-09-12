const emergencyService = require('../services/emergency.service');

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  console.error(`[Emergency] ${fallbackMessage}:`, error.message);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

function emergencyResponse(emergency, patient, selectedFacility) {
  return {
    success: true,
    data: {
      emergency,
      patient,
      selectedFacility,
      escalation: {
        status: emergency.escalationStatus || 'NOT_ESCALATED',
        level: emergency.escalationLevel || 0,
        reason: emergency.escalationReason || null,
        escalatedAt: emergency.escalatedAt || null,
        escalatedTo: emergency.escalationTargetHealthCenter
          || emergency.escalatedToHealthCenterId
          || emergency.escalatedToHealthWorkerId
          || null,
        targetSelectionRequired: emergency.escalationStatus === 'ESCALATED'
          && !emergency.escalatedToHealthCenterId
          && !emergency.escalatedToHealthWorkerId,
        targetMessage: emergency.escalationStatus === 'ESCALATED'
          && !emergency.escalatedToHealthCenterId
          && !emergency.escalatedToHealthWorkerId
          ? 'Escalation required - target selection pending'
          : null
      },
      requiresImmediateAttention: emergency.priority === 'CRITICAL'
    }
  };
}

async function createEmergency(req, res) {
  try {
    const result = await emergencyService.createEmergencyCase(req.body || {});
    return res.status(201).json(emergencyResponse(result.emergency, result.patient, result.selectedFacility));
  } catch (error) {
    return sendError(res, error, 'Unable to create emergency case');
  }
}

async function acknowledgeEmergency(req, res) {
  try {
    const emergency = await emergencyService.acknowledgeEmergency(req.params.caseId, req.user?.username || req.body?.acknowledgedBy, { authorizedHealthCenterId: req.user?.healthCenterId });
    return res.status(200).json(emergencyResponse(emergency, null, null));
  } catch (error) {
    return sendError(res, error, 'Unable to acknowledge emergency case');
  }
}

async function escalateEmergency(req, res) {
  try {
    const emergency = await emergencyService.escalateEmergency(req.params.caseId, { authorizedHealthCenterId: req.user?.healthCenterId });
    return res.status(200).json(emergencyResponse(emergency, null, null));
  } catch (error) {
    return sendError(res, error, 'Unable to escalate emergency case');
  }
}

async function resolveEmergency(req, res) {
  try {
    const emergency = await emergencyService.resolveEmergency(req.params.caseId, { authorizedHealthCenterId: req.user?.healthCenterId });
    return res.status(200).json(emergencyResponse(emergency, null, null));
  } catch (error) {
    return sendError(res, error, 'Unable to resolve emergency case');
  }
}

async function getEmergency(req, res) {
  try {
    const emergency = await emergencyService.getEmergencyCase(req.params.caseId, { authorizedHealthCenterId: req.user?.healthCenterId });
    return res.status(200).json(emergencyResponse(emergency, null, null));
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve emergency case');
  }
}

async function getActiveEmergencies(req, res) {
  try {
    const emergencies = await emergencyService.getActiveEmergencies({ authorizedHealthCenterId: req.user?.healthCenterId });
    return res.status(200).json({
      success: true,
      data: emergencies,
      requiresImmediateAttention: emergencies.some(emergency => emergency.priority === 'CRITICAL')
    });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve active emergency cases');
  }
}

module.exports = {
  createEmergency,
  acknowledgeEmergency,
  escalateEmergency,
  resolveEmergency,
  getEmergency,
  getActiveEmergencies
};
