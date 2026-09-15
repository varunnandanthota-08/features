const ivrService = require('../services/ivr.service');

function sendTwiml(res, twiml) {
  return res.type('text/xml').status(200).send(twiml);
}

function createIvrController(service = ivrService) {
  async function incoming(req, res) {
    try {
      await service.createSession(req);
      const isCallback = req.query?.isCallback === 'true' || req.body?.isCallback === 'true';
      return sendTwiml(res, service.twimlForLanguage(isCallback));
    } catch (error) {
      console.error('[IVR] Incoming call failed:', error.message);
      return sendTwiml(res, service.getFailureTwiml());
    }
  }

  function handler(method) {
    return async (req, res) => {
      try {
        const result = await service[method](req);
        return sendTwiml(res, result.twiml || service.getFailureTwiml());
      } catch (error) {
        console.error(`[IVR] ${method} failed:`, error.message);
        return sendTwiml(res, service.getFailureTwiml());
      }
    };
  }

  return {
    incoming,
    language: handler('handleLanguage'),
    menu: handler('handleMenu'),
    name: handler('handleName'),
    age: handler('handleAge'),
    gender: handler('handleGender'),
    location: handler('handleLocation'),
    symptoms: handler('handleSymptoms'),
    duration: handler('handleDuration'),
    severity: handler('handleSeverity'),
    emergencyScreen: handler('handleEmergencyScreen'),
    confirm: handler('handleConfirm'),
    editSelection: handler('handleEditSelection'),
    editValue: handler('handleEditValue'),
    emergencyLocation: handler('handleEmergencyLocation'),
    emergencyLocationConfirm: handler('handleEmergencyLocationConfirm'),
    statusCallback: async (req, res) => {
      try {
        const result = await service.handleStatusCallback(req);
        return res.status(200).json(result);
      } catch (error) {
        console.error('[IVR] statusCallback failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  };
}

module.exports = { createIvrController };