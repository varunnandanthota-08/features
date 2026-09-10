const twilio = require('twilio');
const Conversation = require('../models/Conversation');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const { normalizeWhatsAppNumber } = require('../config/twilio');
const { createOrUpdatePatient } = require('./patient.service');
const { createEmergencyCase, getPatientLocation } = require('./emergency.service');
const { geocodeLocation } = require('./geocoding.service');

const VoiceResponse = twilio.twiml.VoiceResponse;
const channel = 'IVR';
const testCallPrefix = 'TEST-IVR-';

const voiceConfig = {
  en: { language: 'en-US', voice: 'alice' },
  hi: { language: 'hi-IN', voice: 'Google.hi-IN-Standard-A' },
  te: { language: 'te-IN', voice: 'Google.te-IN-Standard-A' }
};

const prompts = {
  en: {
    language: 'Welcome to Rural Health Support.\nPress 1 for Telugu. Press 2 for Hindi. Press 3 for English. Press 4 to call a nearby health worker. Press 5 for emergency assistance.',
    name: 'Please say your full name after the tone.',
    age: 'Please enter your age using the keypad, followed by the pound key.',
    gender: 'Press 1 for Male. Press 2 for Female. Press 3 for Other.',
    location: 'Please say your village or location after the tone.',
    symptoms: 'Please describe the health problem you are experiencing after the tone.',
    confirm: data => `You said your name is ${data.name}, age ${data.age}, gender ${data.gender}, village ${data.village}, and health problem ${data.symptomsDescription}. Press 1 to confirm or press 2 to start again.`,
    complete: 'Your registration is complete. Thank you. Goodbye.',
    emergency: 'Your emergency request has been registered. A nearby health worker has been alerted. Goodbye.',
    emergencyPending: 'Your emergency request has been recorded. We could not automatically resolve your location. A health worker will review the alert. Goodbye.',
    emergencyLocationConfirm: displayName => `I understood your location as ${displayName}. Press 1 to confirm or press 2 to say your location again.`,
    invalid: 'That input was not valid. Please try again.',
    failed: 'We could not complete your registration right now. Please try again later. Goodbye.'
  },
  hi: {
    name: 'कृपया संकेत के बाद अपना पूरा नाम बताएं।',
    age: 'कृपया कुंजीपटल का उपयोग करके अपनी उम्र दर्ज करें और उसके बाद पाउंड कुंजी दबाएं।',
    gender: 'पुरुष के लिए 1, महिला के लिए 2, अन्य के लिए 3 दबाएं।',
    location: 'कृपया संकेत के बाद अपने गांव या स्थान का नाम बताएं।',
    symptoms: 'कृपया संकेत के बाद अपनी स्वास्थ्य समस्या बताएं।',
    confirm: data => `आपने अपना नाम ${data.name}, उम्र ${data.age}, लिंग ${data.gender}, गांव ${data.village}, और स्वास्थ्य समस्या ${data.symptomsDescription} बताई है। पुष्टि करने के लिए 1 दबाएं या फिर से शुरू करने के लिए 2 दबाएं।`,
    complete: 'आपका पंजीकरण पूरा हो गया है। धन्यवाद। अलविदा।',
    invalid: 'यह इनपुट मान्य नहीं था। कृपया फिर प्रयास करें।',
    failed: 'हम अभी आपका पंजीकरण पूरा नहीं कर सके। कृपया बाद में फिर प्रयास करें। अलविदा।'
  },
  te: {
    name: 'దయచేసి టోన్ తర్వాత మీ పూర్తి పేరు చెప్పండి.',
    age: 'దయచేసి కీప్యాడ్ ఉపయోగించి మీ వయస్సును నమోదు చేసి, ఆపై పౌండ్ కీని నొక్కండి.',
    gender: 'పురుషుడి కోసం 1, స్త్రీ కోసం 2, ఇతరుల కోసం 3 నొక్కండి.',
    location: 'దయచేసి టోన్ తర్వాత మీ గ్రామం లేదా ప్రాంతం పేరు చెప్పండి.',
    symptoms: 'దయచేసి టోన్ తర్వాత మీ ఆరోగ్య సమస్యను వివరించండి.',
    confirm: data => `మీరు మీ పేరు ${data.name}, వయస్సు ${data.age}, లింగం ${data.gender}, గ్రామం ${data.village}, మరియు ఆరోగ్య సమస్య ${data.symptomsDescription} అని చెప్పారు. నిర్ధారించడానికి 1 లేదా మళ్లీ ప్రారంభించడానికి 2 నొక్కండి.`,
    complete: 'మీ నమోదు పూర్తయింది. ధన్యవాదాలు. వీడ్కోలు.',
    invalid: 'ఈ ఇన్‌పుట్ చెల్లదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
    failed: 'మేము ప్రస్తుతం మీ నమోదును పూర్తి చేయలేకపోయాము. దయచేసి తర్వాత మళ్లీ ప్రయత్నించండి. వీడ్కోలు.'
  }
};

function normalizePhone(phone) {
  return normalizeWhatsAppNumber(phone).replace(/^whatsapp:/, '');
}

function getPrompt(language) {
  return prompts[language] || prompts.en;
}

function getVoiceConfig(language) {
  return voiceConfig[language] || voiceConfig.en;
}

function getPublicBaseUrl() {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL is not configured');
  }

  return publicBaseUrl.replace(/\/$/, '');
}

function getIvrCallbackUrl(path) {
  return `${getPublicBaseUrl()}${path}`;
}

function getPromptForState(state, language = 'en', data = {}) {
  const prompt = getPrompt(language);
  return {
    [CONVERSATION_STATES.IVR_LANGUAGE_SELECTION]: prompts.en.language,
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: prompt.name,
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: prompt.age,
    [CONVERSATION_STATES.IVR_COLLECT_GENDER]: prompt.gender,
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: prompt.location,
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: prompt.symptoms,
    [CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM]: prompt.emergencyLocationConfirm(data.emergencyLocationLabel || 'the selected location'),
    [CONVERSATION_STATES.IVR_CONFIRM]: prompt.confirm(data),
    [CONVERSATION_STATES.IVR_COMPLETED]: prompt.complete
  }[state] || '';
}

function parseLocationCoordinates(value) {
  const match = String(value || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude } : null;
}

function say(response, text, language = 'en') {
  response.say(getVoiceConfig(language), text);
}

function gather(response, action, text, language = 'en', options = {}) {
  const gatherOptions = {
    input: options.input || 'speech',
    action,
    method: 'POST',
    speechTimeout: 'auto',
    ...options
  };
  const inputGather = response.gather(gatherOptions);
  say(inputGather, text, language);
  say(response, getPrompt(language).invalid, language);
  response.redirect({ method: 'POST' }, action);
}

function twimlForLanguage() {
  const response = new VoiceResponse();
  gather(response, getIvrCallbackUrl('/api/ivr/language'), prompts.en.language, 'en', { input: 'dtmf', numDigits: 1 });
  return response.toString();
}

function twimlForState(state, language = 'en', data = {}) {
  const response = new VoiceResponse();
  const prompt = getPrompt(language);
  const actions = {
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: getIvrCallbackUrl('/api/ivr/name'),
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: getIvrCallbackUrl('/api/ivr/age'),
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: getIvrCallbackUrl('/api/ivr/location'),
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: getIvrCallbackUrl('/api/ivr/symptoms')
  };

  if (state === CONVERSATION_STATES.IVR_EMERGENCY_LOCATION) {
    gather(response, getIvrCallbackUrl('/api/ivr/emergency-location'), prompt.location, language);
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM) {
    gather(response, getIvrCallbackUrl('/api/ivr/emergency-location-confirm'), prompt.emergencyLocationConfirm(data.emergencyLocationLabel || 'the selected location'), language, {
      input: 'dtmf',
      numDigits: 1
    });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_COLLECT_GENDER) {
    gather(response, getIvrCallbackUrl('/api/ivr/gender'), prompt.gender, language, { input: 'dtmf', numDigits: 1 });
  } else if (state === CONVERSATION_STATES.IVR_CONFIRM) {
    gather(response, getIvrCallbackUrl('/api/ivr/confirm'), prompt.confirm(data), language, { input: 'dtmf', numDigits: 1 });
  } else if (state === CONVERSATION_STATES.IVR_COMPLETED) {
    say(response, prompt.complete, language);
    response.hangup();
  } else if (actions[state]) {
    gather(response, actions[state], prompt[fieldForState(state)], language, {
      input: state === CONVERSATION_STATES.IVR_COLLECT_AGE ? 'dtmf' : 'speech',
      ...(state === CONVERSATION_STATES.IVR_COLLECT_AGE ? { finishOnKey: '#' } : {})
    });
  }
  return response.toString();
}

function getCallDetails(req) {
  const body = req.body || {};
  const callSid = typeof body.CallSid === 'string' ? body.CallSid.trim() : '';
  const phone = typeof body.From === 'string' ? body.From.trim() : '';
  const to = typeof body.To === 'string' ? body.To.trim() : '';
  if (!callSid || !phone) throw new Error('CallSid and From are required');
  return { callSid, phone: normalizePhone(phone), to };
}

function getInput(req) {
  const body = req.body || {};
  return {
    digits: typeof body.Digits === 'string' ? body.Digits.trim() : '',
    speech: typeof body.SpeechResult === 'string' ? body.SpeechResult.trim() : ''
  };
}

function getEventId(req, callSid, route) {
  const supplied = req.get('X-IVR-Event-Id');
  const input = getInput(req);
  return supplied || `${callSid}:${route}:${input.digits}:${input.speech}`;
}

async function findSession(callSid) {
  return Conversation.findOne({ callSid, channel });
}

async function findTestSession({ phone, callSid }) {
  if (callSid) return findSession(callSid);
  return Conversation.findOne({ phone: normalizePhone(phone), channel });
}

async function startTestSession(phone) {
  const normalizedPhone = normalizePhone(phone);
  const callSid = `${testCallPrefix}${require('crypto').randomUUID()}`;
  const session = await createSession({ body: { CallSid: callSid, From: normalizedPhone } });
  return { session, callSid };
}

async function resetTestSession(phone) {
  await Conversation.deleteMany({ phone: normalizePhone(phone), channel });
}

async function processTestInput({ phone, callSid, value, eventId }) {
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const session = await findTestSession({ phone, callSid });
  if (!session || (normalizedPhone && session.phone !== normalizedPhone)) {
    throw new Error('IVR test session not found');
  }

  const req = {
    body: {
      CallSid: session.callSid,
      From: session.phone,
      Digits: value,
      SpeechResult: value
    },
    get: header => header === 'X-IVR-Event-Id' ? eventId : undefined
  };
  const handlers = {
    [CONVERSATION_STATES.IVR_LANGUAGE_SELECTION]: handleLanguage,
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: handleName,
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: handleAge,
    [CONVERSATION_STATES.IVR_COLLECT_GENDER]: handleGender,
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: handleLocation,
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: handleSymptoms,
    [CONVERSATION_STATES.IVR_EMERGENCY_LOCATION]: handleEmergencyLocation,
    [CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM]: handleEmergencyLocationConfirm,
    [CONVERSATION_STATES.IVR_CONFIRM]: handleConfirm,
    [CONVERSATION_STATES.IVR_COMPLETED]: handleCompleted
  };
  const handler = handlers[session.state];
  if (!handler) throw new Error(`Unknown IVR state: ${session.state}`);
  const result = await handler(req);
  return {
    session: result.session,
    state: result.session.state,
    prompt: getPromptForState(result.session.state, result.session.language, result.session.data),
    duplicate: Boolean(result.duplicate)
  };
}

async function createSession(req) {
  const { callSid, phone } = getCallDetails(req);
  let session = await findSession(callSid);
  if (!session) {
    session = new Conversation({
      callSid,
      phone,
      channel,
      state: CONVERSATION_STATES.IVR_LANGUAGE_SELECTION,
      processedMessageIds: [`${callSid}:incoming`]
    });
    await session.save();
  }
  return session;
}

async function processInput(req, route, transition) {
  const { callSid } = getCallDetails(req);
  const session = await findSession(callSid);
  if (!session) throw new Error('IVR session not found');

  const eventId = getEventId(req, callSid, route);
  const input = getInput(req);
  if (process.env.NODE_ENV !== 'production' && input.digits) {
    console.log('[IVR] DTMF input:', {
      callSid,
      currentState: session.state,
      digits: input.digits,
      targetEndpoint: getIvrCallbackUrl(`/api/ivr/${route}`)
    });
  }

  if (session.processedMessageIds.includes(eventId)) {
    return {
      session,
      duplicate: true,
      twiml: session.state === CONVERSATION_STATES.IVR_LANGUAGE_SELECTION
        ? twimlForLanguage()
        : twimlForState(session.state, session.language, session.data)
    };
  }

  const result = await transition(session, input);
  session.processedMessageIds.push(eventId);
  await session.save();
  return { session, ...result };
}

async function handleLanguage(req) {
  return processInput(req, 'language', async (session, input) => {
    if (input.digits === '5') {
      const storedLocation = await getPatientLocation({ phone: session.phone });
      const hasCoordinates = Number.isFinite(storedLocation?.latitude)
        && Number.isFinite(storedLocation?.longitude);
      if (!hasCoordinates) {
        session.state = CONVERSATION_STATES.IVR_EMERGENCY_LOCATION;
        return { twiml: twimlForState(session.state, 'en', session.data) };
      }
      const result = await createEmergencyCase({
        phone: session.phone,
        source: 'PHONE_IVR',
        reason: 'Emergency request via IVR',
        location: storedLocation,
        status: 'ALERTED'
      });
      session.data.emergencyCaseId = result.emergency.caseId;
      session.state = CONVERSATION_STATES.IVR_COMPLETED;
      const response = new VoiceResponse();
      say(response, prompts.en.emergency, 'en');
      response.hangup();
      return { twiml: response.toString() };
    }
    const language = { '1': 'te', '2': 'hi', '3': 'en' }[input.digits];
    if (!language) return { twiml: twimlForLanguage() };
    session.language = language;
    session.state = CONVERSATION_STATES.IVR_COLLECT_NAME;
    return { twiml: twimlForState(session.state, language, session.data) };
  });
}

async function handleEmergencyLocation(req) {
  return processInput(req, 'emergency-location', async (session, input) => {
    const value = input.speech || input.digits;
    if (!value || value.length > 200) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_EMERGENCY_LOCATION, 'en', session.data) };
    }
    const location = parseLocationCoordinates(value);
    const resolvedLocation = location || await geocodeLocation(value);
    if (!resolvedLocation) {
      const response = new VoiceResponse();
      say(response, 'I could not resolve that location. Please say your village or location again.', 'en');
      response.redirect({ method: 'POST' }, getIvrCallbackUrl('/api/ivr/emergency-location'));
      return { twiml: response.toString() };
    }
    session.data.emergencyLatitude = resolvedLocation.latitude;
    session.data.emergencyLongitude = resolvedLocation.longitude;
    session.data.emergencyLocationLabel = resolvedLocation.displayName || value;
    session.state = CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM;
    return { twiml: twimlForState(session.state, 'en', session.data) };
  });
}

async function handleEmergencyLocationConfirm(req) {
  return processInput(req, 'emergency-location-confirm', async (session, input) => {
    if (input.digits === '2') {
      session.data.emergencyLatitude = null;
      session.data.emergencyLongitude = null;
      session.data.emergencyLocationLabel = null;
      session.state = CONVERSATION_STATES.IVR_EMERGENCY_LOCATION;
      return { twiml: twimlForState(session.state, 'en', session.data) };
    }
    if (input.digits !== '1') {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM, 'en', session.data) };
    }
    const result = await createEmergencyCase({
      phone: session.phone,
      source: 'PHONE_IVR',
      reason: 'Emergency request via IVR',
      location: {
        latitude: session.data.emergencyLatitude,
        longitude: session.data.emergencyLongitude
      },
      locationLabel: session.data.emergencyLocationLabel,
      status: 'ALERTED'
    });
    session.data.emergencyCaseId = result.emergency.caseId;
    session.state = CONVERSATION_STATES.IVR_COMPLETED;
    const response = new VoiceResponse();
    say(response, prompts.en.emergency, 'en');
    response.hangup();
    return { twiml: response.toString() };
  });
}

async function handleText(req, route, state, nextState, field) {
  return processInput(req, route, async (session, input) => {
    const value = input.speech || input.digits;
    const valid = value && value.length <= (field === 'symptomsDescription' ? 2000 : field === 'village' ? 200 : 100);
    if (!valid) return { twiml: twimlForState(state, session.language, session.data) };
      session.data[field] = field === 'age' ? Number(value) : value;
    session.state = nextState;
    return { twiml: twimlForState(nextState, session.language, session.data) };
  });
}

  function fieldForState(state) {
    return {
      [CONVERSATION_STATES.IVR_COLLECT_NAME]: 'name',
      [CONVERSATION_STATES.IVR_COLLECT_AGE]: 'age',
      [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: 'location',
      [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: 'symptoms'
    }[state];
  }

async function handleAge(req) {
  return processInput(req, 'age', async (session, input) => {
    const value = input.digits;
    const age = Number(value);
    if (!/^\d+$/.test(value) || age < 1 || age > 120) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_COLLECT_AGE, session.language, session.data) };
    }
    session.data.age = age;
    session.state = CONVERSATION_STATES.IVR_COLLECT_GENDER;
    return { twiml: twimlForState(session.state, session.language, session.data) };
  });
}

function handleName(req) {
  return handleText(
    req,
    'name',
    CONVERSATION_STATES.IVR_COLLECT_NAME,
    CONVERSATION_STATES.IVR_COLLECT_AGE,
    'name'
  );
}

function handleLocation(req) {
  return handleText(
    req,
    'location',
    CONVERSATION_STATES.IVR_COLLECT_LOCATION,
    CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS,
    'village'
  );
}

function handleSymptoms(req) {
  return handleText(
    req,
    'symptoms',
    CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS,
    CONVERSATION_STATES.IVR_CONFIRM,
    'symptomsDescription'
  );
}

async function handleGender(req) {
  return processInput(req, 'gender', async (session, input) => {
    const gender = { '1': 'male', '2': 'female', '3': 'other' }[input.digits];
    if (!gender) return { twiml: twimlForState(CONVERSATION_STATES.IVR_COLLECT_GENDER, session.language, session.data) };
    session.data.gender = gender;
    session.state = CONVERSATION_STATES.IVR_COLLECT_LOCATION;
    return { twiml: twimlForState(session.state, session.language, session.data) };
  });
}

async function handleConfirm(req) {
  return processInput(req, 'confirm', async (session, input) => {
    if (session.state === CONVERSATION_STATES.IVR_COMPLETED) {
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }

    if (input.digits !== '1') return { twiml: twimlForState(CONVERSATION_STATES.IVR_CONFIRM, session.language, session.data) };
    const required = ['name', 'age', 'gender', 'village', 'symptomsDescription'];
    if (!session.language || required.some(field => !session.data[field])) {
      return { twiml: getFailureTwiml() };
    }
    await createOrUpdatePatient({
      phone: session.phone,
      name: session.data.name,
      age: session.data.age,
      gender: session.data.gender,
      village: session.data.village,
      language: session.language,
      symptomsDescription: session.data.symptomsDescription,
      source: 'IVR'
    });
    session.state = CONVERSATION_STATES.IVR_COMPLETED;
    const response = new VoiceResponse();
    say(response, prompts[session.language].complete, session.language);
    response.hangup();
    return { twiml: response.toString() };
  });
}

async function handleCompleted(req) {
  return processInput(req, 'completed', async session => ({
    twiml: twimlForState(CONVERSATION_STATES.IVR_COMPLETED, session.language, session.data)
  }));
}

function getFailureTwiml(language = 'en') {
  const response = new VoiceResponse();
  say(response, getPrompt(language).failed, language);
  response.hangup();
  return response.toString();
}

module.exports = {
  createSession,
  startTestSession,
  resetTestSession,
  processTestInput,
  getPromptForState,
  getPublicBaseUrl,
  normalizePhone,
  handleLanguage,
  handleName,
  handleText,
  handleAge,
  handleGender,
  handleLocation,
  handleSymptoms,
  handleEmergencyLocation,
  handleEmergencyLocationConfirm,
  parseLocationCoordinates,
  handleConfirm,
  handleCompleted,
  twimlForLanguage,
  twimlForState,
  getFailureTwiml,
  getCallDetails
};