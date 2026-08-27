const ivrService = require('../services/ivr.service');

function sendTwiml(res, twiml) {
  return res.type('text/xml').status(200).send(twiml);
}

function createIvrController(service = ivrService) {
  async function incoming(req, res) {
    try {
      await service.createSession(req);
      return sendTwiml(res, service.twimlForLanguage());
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
    name: handler('handleName'),
    age: handler('handleAge'),
    gender: handler('handleGender'),
    location: handler('handleLocation'),
    symptoms: handler('handleSymptoms'),
    confirm: handler('handleConfirm')
  };
}

module.exports = { createIvrController };