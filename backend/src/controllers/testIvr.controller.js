const ivrService = require('../services/ivr.service');

function createTestIvrController(service = ivrService) {
  async function start(req, res) {
    try {
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });

      const { session, callSid } = await service.startTestSession(phone);
      return res.status(200).json({
        success: true,
        sessionId: callSid,
        state: session.state,
        nextState: session.state,
        prompt: service.getPromptForState(session.state, session.language, session.data),
        data: session.data
      });
    } catch (error) {
      console.error('[Test IVR] Start failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to start test IVR session' });
    }
  }

  async function input(req, res) {
    try {
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
      if ((!phone && !sessionId) || !value) {
        return res.status(400).json({ success: false, message: 'Phone or sessionId and value are required' });
      }

      const result = await service.processTestInput({
        phone: phone || undefined,
        callSid: sessionId || undefined,
        value,
        eventId: typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : undefined
      });
      return res.status(200).json({
        success: true,
        state: result.state,
        nextState: result.state,
        prompt: result.prompt,
        data: result.session.data,
        duplicate: result.duplicate
      });
    } catch (error) {
      console.error('[Test IVR] Input failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to process test IVR input' });
    }
  }

  async function reset(req, res) {
    try {
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });
      await service.resetTestSession(phone);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Test IVR] Reset failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to reset test IVR session' });
    }
  }

  return { start, input, reset };
}

module.exports = { createTestIvrController };