const caseService = require('../services/case.service');

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

function caseResponse(record, patient = null, selectedFacility = null) {
  const targetSelectionRequired = record.escalationStatus === 'ESCALATED'
    && !record.escalatedToHealthCenterId
    && !record.escalatedToHealthWorkerId;
  return {
    success: true,
    data: {
      case: record,
      patient,
      selectedFacility,
      escalation: {
        status: record.escalationStatus || 'NOT_ESCALATED',
        level: record.escalationLevel || 0,
        reason: record.escalationReason || null,
        escalatedAt: record.escalatedAt || null,
        targetSelectionRequired,
        targetMessage: targetSelectionRequired ? 'Escalation required - target selection pending' : null
      }
    }
  };
}

async function createCase(req, res) {
  try {
    const result = await caseService.createCase(req.body || {});
    return res.status(201).json(caseResponse(result.case, result.patient, result.selectedFacility));
  } catch (error) {
    return sendError(res, error, 'Unable to create case');
  }
}

async function getActiveCases(req, res) {
  try {
    return res.status(200).json({ success: true, data: await caseService.getActiveCases({ authorizedHealthCenterId: req.user?.healthCenterId }) });
  } catch (error) {
    return sendError(res, error, 'Unable to retrieve active cases');
  }
}

async function acknowledgeCase(req, res) {
  try {
    const payload = {
      healthCenterId: req.user?.healthCenterId,
      healthWorkerId: req.user?.username
    };
    return res.status(200).json(caseResponse(await caseService.acknowledgeCase(req.params.caseId, payload)));
  } catch (error) {
    return sendError(res, error, 'Unable to acknowledge case');
  }
}

async function resolveCase(req, res) {
  try {
    return res.status(200).json(caseResponse(await caseService.resolveCase(req.params.caseId, { authorizedHealthCenterId: req.user?.healthCenterId })));
  } catch (error) {
    return sendError(res, error, 'Unable to resolve case');
  }
}

async function escalateCase(req, res) {
  try {
    return res.status(200).json(caseResponse(await caseService.escalateNormalCase(req.params.caseId, new Date(), { authorizedHealthCenterId: req.user?.healthCenterId })));
  } catch (error) {
    return sendError(res, error, 'Unable to escalate case');
  }
}

module.exports = { createCase, getActiveCases, acknowledgeCase, resolveCase, escalateCase };
