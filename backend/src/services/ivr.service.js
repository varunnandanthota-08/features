const twilio = require('twilio');
const Conversation = require('../models/Conversation');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const { normalizeWhatsAppNumber } = require('../config/twilio');
const { createOrUpdatePatient } = require('./patient.service');
const { createEmergencyCase, getPatientLocation } = require('./emergency.service');
const { geocodeLocation } = require('./geocoding.service');
const caseService = require('./case.service');
const { finalizeRegistrationAndCase, checkExistingPatient } = require('./registration.service');
const { languageForMenuOption } = require('../constants/channelMenu');

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
    mainMenu: 'Main Menu. Press 1 or say register to report a health problem. Press 2 or say status to check case status. Press 3 to speak with a health worker. Press 5 for emergency assistance.',
    name: 'Please say your full name after the tone.',
    age: 'Please enter your age using the keypad, followed by the pound key.',
    gender: 'Press 1 for Male. Press 2 for Female. Press 3 for Other.',
    location: 'Please say your village or location after the tone.',
    symptoms: 'Please describe the health problem you are experiencing after the tone.',
    duration: 'How long have you had this problem? Press 1 for less than 1 day. Press 2 for 1 to 3 days. Press 3 for 4 to 7 days. Press 4 for more than 1 week. Press 5 for more than 1 month. Or speak your answer.',
    severity: 'How severe is your problem? Press 1 or say mild. Press 2 or say moderate. Press 3 or say severe.',
    emergencyScreen: 'Do you have any emergency symptoms? Press 1 for severe chest pain. Press 2 for severe breathing difficulty. Press 3 for heavy bleeding. Press 4 for unconsciousness or fainting. Press 5 for none of these.',
    confirmSummary: data => `Please confirm your information. Name: ${data.name || 'Not provided'}, Age: ${data.age || 'Not provided'}, Gender: ${data.gender || 'Not provided'}, Village: ${data.village || 'Not provided'}, Health problem: ${data.symptomsDescription || 'Not provided'}, Duration: ${data.duration || 'Not specified'}, Severity: ${data.severity || 'Not specified'}. Press 1 or say yes to confirm. Press 2 or say no to edit.`,
    confirm: data => `You said your name is ${data.name}, age ${data.age}, gender ${data.gender}, village ${data.village}, and health problem ${data.symptomsDescription}. Press 1 to confirm or press 2 to start again.`,
    editMenu: 'Press 1 to change your name. 2 for age. 3 for gender. 4 for location. 5 for health problem. 6 for duration. 7 for severity. 8 for emergency screening. 9 to return to confirmation.',
    welcomeBack: name => `Welcome back, ${name || 'Patient'}. Please describe the health problem you are experiencing after the tone.`,
    caseStatus: cases => cases && cases.length ? `Your active case reference is ${cases[0].caseId}, status is ${cases[0].status}.` : 'You have no active cases registered.',
    workerContact: 'Please contact your nearest Primary Health Centre or local health worker for assistance.',
    callbackGreeting: 'Welcome to CareOS. We are returning your call.',
    complete: 'Your registration is complete. Thank you. Goodbye.',
    emergency: 'Your emergency request has been registered. A nearby health worker has been alerted. Goodbye.',
    emergencyPending: 'Your emergency request has been recorded. We could not automatically resolve your location. A health worker will review the alert. Goodbye.',
    emergencyLocationConfirm: displayName => `I understood your location as ${displayName}. Press 1 to confirm or press 2 to say your location again.`,
    invalid: 'That input was not valid. Please try again.',
    failed: 'We could not complete your registration right now. Please try again later. Goodbye.'
  },
  hi: {
    language: 'ग्रामीण स्वास्थ्य सहायता में आपका स्वागत है।\nतेलुगु के लिए 1 दबाएं। हिंदी के लिए 2 दबाएं। अंग्रेजी के लिए 3 दबाएं। स्वास्थ्य कार्यकर्ता के लिए 4 दबाएं। आपातकालीन सहायता के लिए 5 दबाएं।',
    mainMenu: 'मुख्य मेनू। स्वास्थ्य समस्या दर्ज करने के लिए 1 दबाएं या रजिस्टर कहें। केस की स्थिति देखने के लिए 2 दबाएं या स्टेटस कहें। स्वास्थ्य कार्यकर्ता से बात करने के लिए 3 दबाएं। आपातकालीन सहायता के लिए 5 दबाएं।',
    name: 'कृपया संकेत के बाद अपना पूरा नाम बताएं।',
    age: 'कृपया कुंजीपटल का उपयोग करके अपनी उम्र दर्ज करें और उसके बाद पाउंड कुंजी दबाएं।',
    gender: 'पुरुष के लिए 1, महिला के लिए 2, अन्य के लिए 3 दबाएं।',
    location: 'कृपया संकेत के बाद अपने गांव या स्थान का नाम बताएं।',
    symptoms: 'कृपया संकेत के बाद अपनी स्वास्थ्य समस्या बताएं।',
    duration: 'आपको यह समस्या कितने समय से है? 1 दिन से कम के लिए 1 दबाएं। 1 से 3 दिनों के लिए 2 दबाएं। 4 से 7 दिनों के लिए 3 दबाएं। 1 सप्ताह से अधिक के लिए 4 दबाएं। 1 महीने से अधिक के लिए 5 दबाएं। या बोलकर बताएं।',
    severity: 'आपकी समस्या कितनी गंभीर है? हल्की के लिए 1 दबाएं या माइल्ड कहें। मध्यम के लिए 2 दबाएं या मॉडरेट कहें। गंभीर के लिए 3 दबाएं या सीवियर कहें।',
    emergencyScreen: 'क्या आपको कोई आपातकालीन लक्षण हैं? सीने में गंभीर दर्द के लिए 1 दबाएं। सांस लेने में गंभीर कठिनाई के लिए 2 दबाएं। भारी रक्तस्राव के लिए 3 दबाएं। बेहोशी के लिए 4 दबाएं। इनमें से कोई नहीं के लिए 5 दबाएं।',
    confirmSummary: data => `कृपया अपनी जानकारी की पुष्टि करें। नाम: ${data.name || 'निर्दिष्ट नहीं'}, उम्र: ${data.age || 'निर्दिष्ट नहीं'}, लिंग: ${data.gender || 'निर्दिष्ट नहीं'}, गांव: ${data.village || 'निर्दिष्ट नहीं'}, समस्या: ${data.symptomsDescription || 'निर्दिष्ट नहीं'}, अवधि: ${data.duration || 'निर्दिष्ट नहीं'}, गंभीरता: ${data.severity || 'निर्दिष्ट नहीं'}। पुष्टि के लिए 1 दबाएं या हाँ कहें। बदलने के लिए 2 दबाएं या नहीं कहें।`,
    confirm: data => `आपने अपना नाम ${data.name}, उम्र ${data.age}, लिंग ${data.gender}, गांव ${data.village}, और स्वास्थ्य समस्या ${data.symptomsDescription} बताई है। पुष्टि करने के लिए 1 दबाएं या फिर से शुरू करने के लिए 2 दबाएं।`,
    editMenu: 'नाम बदलने के लिए 1 दबाएं। उम्र के लिए 2। लिंग के लिए 3। स्थान के लिए 4। समस्या के लिए 5। अवधि के लिए 6। गंभीरता के लिए 7। आपातकालीन लक्षणों के लिए 8। पुष्टि पर वापस जाने के लिए 9 दबाएं।',
    welcomeBack: name => `वापसी पर स्वागत है, ${name || 'मरीज'}। कृपया संकेत के बाद अपनी स्वास्थ्य समस्या बताएं।`,
    caseStatus: cases => cases && cases.length ? `आपका सक्रिय केस संदर्भ ${cases[0].caseId} है, स्थिति ${cases[0].status} है।` : 'आपका कोई सक्रिय केस पंजीकृत नहीं है।',
    workerContact: 'प्रत्यक्ष सहायता के लिए कृपया अपने नजदीकी स्वास्थ्य कार्यकर्ता से संपर्क करें।',
    callbackGreeting: 'केयर-ओएस में आपका स्वागत है। हम आपकी मिस्ड कॉल का उत्तर दे रहे हैं।',
    complete: 'आपका पंजीकरण पूरा हो गया है। धन्यवाद। अलविदा।',
    emergency: 'आपका आपातकालीन अनुरोध दर्ज कर लिया गया है। स्वास्थ्य कार्यकर्ता को सतर्क कर दिया गया है। अलविदा।',
    emergencyPending: 'आपातकालीन अनुरोध दर्ज कर लिया गया है। स्थान की समीक्षा की जाएगी। अलविदा।',
    emergencyLocationConfirm: displayName => `मैंने आपका स्थान ${displayName} समझा। पुष्टि करने के लिए 1 दबाएं या फिर से बोलने के लिए 2 दबाएं।`,
    invalid: 'यह इनपुट मान्य नहीं था। कृपया फिर प्रयास करें।',
    failed: 'हम अभी आपका पंजीकरण पूरा नहीं कर सके। कृपया बाद में फिर प्रयास करें। अलविदा।'
  },
  te: {
    language: 'గ్రామీణ ఆరోగ్య సహాయానికి స్వాగతం.\nతెలుగు కోసం 1 నొక్కండి. హిందీ కోసం 2 నొక్కండి. ఇంగ్లీష్ కోసం 3 నొక్కండి. ఆరోగ్య కార్యకర్త కోసం 4 నొక్కండి. అత్యవసర సహాయం కోసం 5 నొక్కండి.',
    mainMenu: 'ప్రధాన మెను. ఆరోగ్య సమస్యను నమోదు చేయడానికి 1 నొక్కండి లేదా రిజిస్టర్ అనండి. కేసు స్థితిని తనిఖీ చేయడానికి 2 నొక్కండి లేదా స్టేటస్ అనండి. ఆరోగ్య కార్యకర్తతో మాట్లాడటానికి 3 నొక్కండి. అత్యవసర సహాయం కోసం 5 నొక్కండి.',
    name: 'దయచేసి టోన్ తర్వాత మీ పూర్తి పేరు చెప్పండి.',
    age: 'దయచేసి కీప్యాడ్ ఉపయోగించి మీ వయస్సును నమోదు చేసి, ఆపై పౌండ్ కీని నొక్కండి.',
    gender: 'పురుషుడి కోసం 1, స్త్రీ కోసం 2, ఇతరుల కోసం 3 నొక్కండి.',
    location: 'దయచేసి టోన్ తర్వాత మీ గ్రామం లేదా ప్రాంతం పేరు చెప్పండి.',
    symptoms: 'దయచేసి టోన్ తర్వాత మీ ఆరోగ్య సమస్యను వివరించండి.',
    duration: 'ఈ సమస్య మీకు ఎంతకాలంగా ఉంది? 1 రోజు కంటే తక్కువ అయితే 1 నొక్కండి. 1 నుండి 3 రోజులు అయితే 2 నొక్కండి. 4 నుండి 7 రోజులు అయితే 3 నొక్కండి. 1 వారం కంటే ఎక్కువ అయితే 4 నొక్కండి. 1 నెల కంటే ఎక్కువ అయితే 5 నొక్కండి. లేదా మాట్లాడి చెప్పండి.',
    severity: 'మీ సమస్య ఎంత తీవ్రమైనది? స్వల్పమైతే 1 నొక్కండి లేదా మైల్డ్ అనండి. మధ్యస్థమైతే 2 నొక్కండి లేదా మోడరేట్ అనండి. తీవ్రమైతే 3 నొక్కండి లేదా సివియర్ అనండి.',
    emergencyScreen: 'మీకు ఏవైనా అత్యవసర లక్షణాలు ఉన్నాయా? తీవ్రమైన ఛాతీ నొప్పి కోసం 1 నొక్కండి. తీవ్రమైన శ్వాస ఇబ్బంది కోసం 2 నొక్కండి. అధిక రక్తస్రావం కోసం 3 నొక్కండి. స్పృహ తప్పడం కోసం 4 నొక్కండి. ఇవేవీ కాకపోతే 5 నొక్కండి.',
    confirmSummary: data => `దయచేసి మీ సమాచారాన్ని నిర్ధారించండి. పేరు: ${data.name || 'పేర్కొనలేదు'}, వయస్సు: ${data.age || 'పేర్కొనలేదు'}, లింగం: ${data.gender || 'పేర్కొనలేదు'}, గ్రామం: ${data.village || 'పేర్కొనలేదు'}, సమస్య: ${data.symptomsDescription || 'పేర్కొనలేదు'}, వ్యవధి: ${data.duration || 'పేర్కొనలేదు'}, తీవ్రత: ${data.severity || 'పేర్కొనలేదు'}. నిర్ధారించడానికి 1 నొక్కండి లేదా అవును అనండి. మార్చడానికి 2 నొక్కండి లేదా కాదు అనండి.`,
    confirm: data => `మీరు మీ పేరు ${data.name}, వయస్సు ${data.age}, లింగం ${data.gender}, గ్రామం ${data.village}, మరియు ఆరోగ్య సమస్య ${data.symptomsDescription} అని చెప్పారు. నిర్ధారించడానికి 1 లేదా మళ్లీ ప్రారంభించడానికి 2 నొక్కండి.`,
    editMenu: 'మీ పేరు మార్చడానికి 1 నొక్కండి. వయస్సు కోసం 2. లింగం కోసం 3. ప్రాంతం కోసం 4. సమస్య కోసం 5. వ్యవధి కోసం 6. తీవ్రత కోసం 7. అత్యవసర లక్షణాల కోసం 8. నిర్ధారణకు తిరిగి వెళ్లడానికి 9 నొక్కండి.',
    welcomeBack: name => `తిరిగి స్వాగతం, ${name || 'రోగి'}. దయచేసి టోన్ తర్వాత మీ ఆరోగ్య సమస్యను వివరించండి.`,
    caseStatus: cases => cases && cases.length ? `మీ యాక్టివ్ కేసు సూచన ${cases[0].caseId}, స్థితి ${cases[0].status}.` : 'మీకు నమోదైన యాక్టివ్ కేసులు ఏవీ లేవు.',
    workerContact: 'సహాయం కోసం దయచేసి మీ సమీప ఆరోగ్య కార్యకర్తను సంప్రదించండి.',
    callbackGreeting: 'కేర్‌ఓఎస్‌కు స్వాగతం. మేము మీ కాల్‌కు తిరిగి కాల్ చేస్తున్నాము.',
    complete: 'మీ నమోదు పూర్తయింది. ధన్యవాదాలు. వీడ్కోలు.',
    emergency: 'మీ అత్యవసర అభ్యర్థన నమోదు చేయబడింది. సమీప ఆరోగ్య కార్యకర్తను హెచ్చరించారు. వీడ్కోలు.',
    emergencyPending: 'అత్యవసర అభ్యర్థన రికార్డ్ చేయబడింది. స్థానం సమీక్షించబడుతుంది. వీడ్కోలు.',
    emergencyLocationConfirm: displayName => `నేను మీ స్థానాన్ని ${displayName}గా అర్థం చేసుకున్నాను. నిర్ధారించడానికి 1 నొక్కండి లేదా మళ్లీ చెప్పడానికి 2 నొక్కండి.`,
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

function fieldForState(state) {
  return {
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: 'name',
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: 'age',
    [CONVERSATION_STATES.IVR_COLLECT_GENDER]: 'gender',
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: 'location',
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: 'symptoms',
    [CONVERSATION_STATES.IVR_COLLECT_DURATION]: 'duration',
    [CONVERSATION_STATES.IVR_COLLECT_SEVERITY]: 'severity',
    [CONVERSATION_STATES.IVR_EMERGENCY_SCREEN]: 'emergencyScreen'
  }[state] || state;
}

function getPromptForState(state, language = 'en', data = {}) {
  const prompt = getPrompt(language);
  return {
    [CONVERSATION_STATES.IVR_LANGUAGE_SELECTION]: prompts.en.language,
    [CONVERSATION_STATES.IVR_MAIN_MENU]: prompt.mainMenu,
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: prompt.name,
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: prompt.age,
    [CONVERSATION_STATES.IVR_COLLECT_GENDER]: prompt.gender,
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: prompt.location,
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: prompt.symptoms,
    [CONVERSATION_STATES.IVR_COLLECT_DURATION]: prompt.duration,
    [CONVERSATION_STATES.IVR_COLLECT_SEVERITY]: prompt.severity,
    [CONVERSATION_STATES.IVR_EMERGENCY_SCREEN]: prompt.emergencyScreen,
    [CONVERSATION_STATES.IVR_EDIT_SELECTION]: prompt.editMenu,
    [CONVERSATION_STATES.IVR_EDIT_VALUE]: prompt[fieldForState(data.pendingField)] || prompt.invalid,
    [CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM]: typeof prompt.emergencyLocationConfirm === 'function'
      ? prompt.emergencyLocationConfirm(data.emergencyLocationLabel || 'the selected location')
      : prompts.en.emergencyLocationConfirm(data.emergencyLocationLabel || 'the selected location'),
    [CONVERSATION_STATES.IVR_CONFIRM]: prompt.confirmSummary ? prompt.confirmSummary(data) : prompt.confirm(data),
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
    input: options.input || 'dtmf speech',
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

function twimlForLanguage(isCallback = false) {
  const response = new VoiceResponse();
  const text = isCallback
    ? `${prompts.en.callbackGreeting}\n${prompts.en.language}`
    : prompts.en.language;
  gather(response, getIvrCallbackUrl('/api/ivr/language'), text, 'en', { input: 'dtmf speech', numDigits: 1 });
  return response.toString();
}

function twimlForEditValue(field, language, data) {
  const response = new VoiceResponse();
  const prompt = getPrompt(language);
  const action = getIvrCallbackUrl('/api/ivr/edit-value');

  if (field === 'emergencyScreen') {
    gather(response, action, prompt.emergencyScreen, language, { input: 'dtmf speech', numDigits: 1 });
  } else if (field === 'duration') {
    gather(response, action, prompt.duration, language, { input: 'dtmf speech' });
  } else if (field === 'severity') {
    gather(response, action, prompt.severity, language, { input: 'dtmf speech', numDigits: 1 });
  } else if (field === 'gender') {
    gather(response, action, prompt.gender, language, { input: 'dtmf speech', numDigits: 1 });
  } else if (field === 'age') {
    gather(response, action, prompt.age, language, { input: 'dtmf speech', finishOnKey: '#' });
  } else {
    gather(response, action, prompt[fieldForState(field)] || prompt.name || prompt.invalid, language, { input: 'speech' });
  }
  return response.toString();
}

function twimlForState(state, language = 'en', data = {}) {
  const response = new VoiceResponse();
  const prompt = getPrompt(language);
  const actions = {
    [CONVERSATION_STATES.IVR_MAIN_MENU]: getIvrCallbackUrl('/api/ivr/menu'),
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: getIvrCallbackUrl('/api/ivr/name'),
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: getIvrCallbackUrl('/api/ivr/age'),
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: getIvrCallbackUrl('/api/ivr/location'),
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: getIvrCallbackUrl('/api/ivr/symptoms'),
    [CONVERSATION_STATES.IVR_COLLECT_DURATION]: getIvrCallbackUrl('/api/ivr/duration'),
    [CONVERSATION_STATES.IVR_COLLECT_SEVERITY]: getIvrCallbackUrl('/api/ivr/severity'),
    [CONVERSATION_STATES.IVR_EMERGENCY_SCREEN]: getIvrCallbackUrl('/api/ivr/emergency-screen'),
    [CONVERSATION_STATES.IVR_EDIT_SELECTION]: getIvrCallbackUrl('/api/ivr/edit-selection'),
    [CONVERSATION_STATES.IVR_CONFIRM]: getIvrCallbackUrl('/api/ivr/confirm')
  };

  if (state === CONVERSATION_STATES.IVR_MAIN_MENU) {
    gather(response, actions[state], prompt.mainMenu, language, { input: 'dtmf speech', numDigits: 1 });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_COLLECT_DURATION) {
    gather(response, actions[state], prompt.duration, language, { input: 'dtmf speech' });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_COLLECT_SEVERITY) {
    gather(response, actions[state], prompt.severity, language, { input: 'dtmf speech', numDigits: 1 });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_EMERGENCY_SCREEN) {
    gather(response, actions[state], prompt.emergencyScreen, language, { input: 'dtmf speech', numDigits: 1 });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_EDIT_SELECTION) {
    gather(response, actions[state], prompt.editMenu, language, { input: 'dtmf speech', numDigits: 1 });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_EDIT_VALUE) {
    return twimlForEditValue(data.pendingField, language, data);
  }

  if (state === CONVERSATION_STATES.IVR_EMERGENCY_LOCATION) {
    gather(response, getIvrCallbackUrl('/api/ivr/emergency-location'), prompt.location, language, { input: 'speech' });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_EMERGENCY_LOCATION_CONFIRM) {
    gather(response, getIvrCallbackUrl('/api/ivr/emergency-location-confirm'), prompt.emergencyLocationConfirm(data.emergencyLocationLabel || 'the selected location'), language, {
      input: 'dtmf speech',
      numDigits: 1
    });
    return response.toString();
  }

  if (state === CONVERSATION_STATES.IVR_COLLECT_GENDER) {
    gather(response, getIvrCallbackUrl('/api/ivr/gender'), prompt.gender, language, { input: 'dtmf speech', numDigits: 1 });
  } else if (state === CONVERSATION_STATES.IVR_CONFIRM) {
    gather(response, getIvrCallbackUrl('/api/ivr/confirm'), prompt.confirmSummary ? prompt.confirmSummary(data) : prompt.confirm(data), language, { input: 'dtmf speech' });
  } else if (state === CONVERSATION_STATES.IVR_COMPLETED) {
    say(response, prompt.complete, language);
    response.hangup();
  } else if (actions[state]) {
    gather(response, actions[state], prompt[fieldForState(state)], language, {
      input: state === CONVERSATION_STATES.IVR_COLLECT_AGE ? 'dtmf speech' : 'speech',
      ...(state === CONVERSATION_STATES.IVR_COLLECT_AGE ? { finishOnKey: '#' } : {})
    });
  }
  return response.toString();
}

function getCallDetails(req) {
  const body = req.body || {};
  const query = req.query || {};
  const callSid = typeof body.CallSid === 'string' ? body.CallSid.trim() : (typeof query.CallSid === 'string' ? query.CallSid.trim() : '');
  const phone = typeof body.From === 'string' ? body.From.trim() : (typeof query.From === 'string' ? query.From.trim() : '');
  const to = typeof body.To === 'string' ? body.To.trim() : (typeof query.To === 'string' ? query.To.trim() : '');
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
    [CONVERSATION_STATES.IVR_MAIN_MENU]: handleMenu,
    [CONVERSATION_STATES.IVR_COLLECT_NAME]: handleName,
    [CONVERSATION_STATES.IVR_COLLECT_AGE]: handleAge,
    [CONVERSATION_STATES.IVR_COLLECT_GENDER]: handleGender,
    [CONVERSATION_STATES.IVR_COLLECT_LOCATION]: handleLocation,
    [CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS]: handleSymptoms,
    [CONVERSATION_STATES.IVR_COLLECT_DURATION]: handleDuration,
    [CONVERSATION_STATES.IVR_COLLECT_SEVERITY]: handleSeverity,
    [CONVERSATION_STATES.IVR_EMERGENCY_SCREEN]: handleEmergencyScreen,
    [CONVERSATION_STATES.IVR_EDIT_SELECTION]: handleEditSelection,
    [CONVERSATION_STATES.IVR_EDIT_VALUE]: handleEditValue,
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

// Helpers for input normalization
function isAffirmative(digits, speech) {
  if (digits === '1') return true;
  const s = String(speech || '').trim().toLowerCase();
  if (/^(yes|confirm|correct|right|yeah|yep|sure|agree|ok|okay|ha|haan|avunu|sari|one|1)$/i.test(s)) return true;
  return /\b(yes|confirm|correct|agree|ha|haan|avunu|sari)\b/i.test(s);
}

function isNegative(digits, speech) {
  if (digits === '2') return true;
  const s = String(speech || '').trim().toLowerCase();
  if (/^(no|change|edit|repeat|wrong|nah|nope|incorrect|nahi|nahin|vaddu|kaadu|two|2)$/i.test(s)) return true;
  return /\b(no|change|edit|wrong|incorrect|nahi|nahin|vaddu|kaadu)\b/i.test(s);
}

function parseDuration(digits, speech) {
  const durationMap = {
    '1': 'Less than 1 day',
    '2': '1 to 3 days',
    '3': '4 to 7 days',
    '4': 'More than 1 week',
    '5': 'More than 1 month'
  };
  if (digits && durationMap[digits]) return durationMap[digits];
  const s = String(speech || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('less than') || lower.includes('1 day') || lower.includes('one day') || lower.includes('today')) return 'Less than 1 day';
  if (lower.includes('1 to 3') || lower.includes('one to three') || lower.includes('2 days') || lower.includes('3 days') || lower.includes('two days') || lower.includes('three days')) return '1 to 3 days';
  if (lower.includes('4 to 7') || lower.includes('four to seven') || (lower.includes('week') && !lower.includes('more than'))) return '4 to 7 days';
  if (lower.includes('more than 1 week') || lower.includes('over a week') || lower.includes('two weeks')) return 'More than 1 week';
  if (lower.includes('month') || lower.includes('more than 1 month')) return 'More than 1 month';
  return s.slice(0, 200);
}

function parseSeverity(digits, speech) {
  const severityMap = {
    '1': 'Mild',
    '2': 'Moderate',
    '3': 'Severe'
  };
  if (digits && severityMap[digits]) return severityMap[digits];
  const s = String(speech || '').trim().toLowerCase();
  if (s.includes('mild') || s === 'one' || s === '1') return 'Mild';
  if (s.includes('moderate') || s.includes('medium') || s === 'two' || s === '2') return 'Moderate';
  if (s.includes('severe') || s.includes('high') || s.includes('bad') || s === 'three' || s === '3') return 'Severe';
  return null;
}

function isEmergencySelection(digits, speech) {
  if (['1', '2', '3', '4'].includes(digits)) return true;
  const s = String(speech || '').trim().toLowerCase();
  return /(chest pain|breathing|bleeding|unconscious|faint|heart attack|choking|emergency|one|two|three|four)/i.test(s)
    && !/(none|no|not|neither)/i.test(s);
}

function isNonEmergencySelection(digits, speech) {
  if (digits === '5') return true;
  const s = String(speech || '').trim().toLowerCase();
  return /^(5|none|no|none of these|five|nothing|nah)$/i.test(s);
}

function parseMainMenuOption(digits, speech) {
  if (digits && ['1', '2', '3', '5'].includes(digits)) return digits;
  const s = String(speech || '').trim().toLowerCase();
  if (s.includes('register') || s.includes('new') || s.includes('complaint') || s === 'one' || s === '1') return '1';
  if (s.includes('status') || s.includes('check') || s.includes('case') || s === 'two' || s === '2') return '2';
  if (s.includes('worker') || s.includes('talk') || s.includes('speak') || s.includes('help') || s === 'three' || s === '3') return '3';
  if (s.includes('emergency') || s.includes('sos') || s.includes('urgent') || s === 'five' || s === '5') return '5';
  return null;
}

async function startIvrEmergency(session) {
  const storedLocation = await getPatientLocation({ phone: session.phone });
  const hasCoordinates = Number.isFinite(storedLocation?.latitude)
    && Number.isFinite(storedLocation?.longitude);
  if (!hasCoordinates) {
    session.state = CONVERSATION_STATES.IVR_EMERGENCY_LOCATION;
    return { twiml: twimlForState(session.state, session.language || 'en', session.data) };
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
  say(response, getPrompt(session.language || 'en').emergency, session.language || 'en');
  response.hangup();
  return { twiml: response.toString() };
}

async function handleLanguage(req) {
  return processInput(req, 'language', async (session, input) => {
    const rawVal = input.digits || input.speech;
    const s = String(rawVal || '').toLowerCase().trim();

    if (input.digits === '5' || s.includes('emergency') || s === 'five') {
      return startIvrEmergency(session);
    }

    let language = languageForMenuOption(input.digits);
    if (!language) {
      if (s.includes('telugu') || s === 'one' || s === '1') language = 'te';
      else if (s.includes('hindi') || s === 'two' || s === '2') language = 'hi';
      else if (s.includes('english') || s === 'three' || s === '3') language = 'en';
    }

    if (!language) return { twiml: twimlForLanguage() };
    session.language = language;

    // Advance to Main Menu
    session.state = CONVERSATION_STATES.IVR_MAIN_MENU;
    return { twiml: twimlForState(session.state, language, session.data) };
  });
}

async function handleMenu(req) {
  return processInput(req, 'menu', async (session, input) => {
    const option = parseMainMenuOption(input.digits, input.speech);

    if (option === '1') {
      // 1 - Register health complaint
      const existingPatient = await checkExistingPatient(session.phone);
      if (existingPatient && existingPatient.name && existingPatient.location?.village) {
        session.data.name = existingPatient.name;
        session.data.age = existingPatient.age;
        session.data.gender = existingPatient.gender;
        session.data.village = existingPatient.location.village;
        session.data.isExistingPatient = true;
        session.data.patientId = existingPatient._id;
        session.state = CONVERSATION_STATES.IVR_COLLECT_SYMPTOMS;
        const response = new VoiceResponse();
        const welcomeBackMsg = getPrompt(session.language).welcomeBack(existingPatient.name);
        gather(response, getIvrCallbackUrl('/api/ivr/symptoms'), welcomeBackMsg, session.language, { input: 'speech' });
        return { twiml: response.toString() };
      }

      session.state = CONVERSATION_STATES.IVR_COLLECT_NAME;
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }

    if (option === '2') {
      // 2 - Check case status
      const cases = await caseService.getPatientCases(session.phone);
      const statusText = getPrompt(session.language).caseStatus(cases);
      const response = new VoiceResponse();
      say(response, statusText, session.language);
      response.redirect({ method: 'POST' }, getIvrCallbackUrl('/api/ivr/menu'));
      return { twiml: response.toString() };
    }

    if (option === '3') {
      // 3 - Talk to health worker
      const response = new VoiceResponse();
      say(response, getPrompt(session.language).workerContact, session.language);
      response.redirect({ method: 'POST' }, getIvrCallbackUrl('/api/ivr/menu'));
      return { twiml: response.toString() };
    }

    if (option === '5') {
      // 5 - Emergency
      return startIvrEmergency(session);
    }

    return { twiml: twimlForState(CONVERSATION_STATES.IVR_MAIN_MENU, session.language, session.data) };
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
    if (isNegative(input.digits, input.speech)) {
      session.data.emergencyLatitude = null;
      session.data.emergencyLongitude = null;
      session.data.emergencyLocationLabel = null;
      session.state = CONVERSATION_STATES.IVR_EMERGENCY_LOCATION;
      return { twiml: twimlForState(session.state, 'en', session.data) };
    }
    if (!isAffirmative(input.digits, input.speech)) {
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

async function handleAge(req) {
  return processInput(req, 'age', async (session, input) => {
    const value = input.digits || input.speech;
    const age = Number(value);
    if (!/^\d+$/.test(String(value || '').trim()) || age < 1 || age > 120) {
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
    CONVERSATION_STATES.IVR_COLLECT_DURATION,
    'symptomsDescription'
  );
}

async function handleDuration(req) {
  return processInput(req, 'duration', async (session, input) => {
    const duration = parseDuration(input.digits, input.speech);
    if (!duration) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_COLLECT_DURATION, session.language, session.data) };
    }
    session.data.duration = duration;
    session.state = CONVERSATION_STATES.IVR_COLLECT_SEVERITY;
    return { twiml: twimlForState(session.state, session.language, session.data) };
  });
}

async function handleSeverity(req) {
  return processInput(req, 'severity', async (session, input) => {
    const severity = parseSeverity(input.digits, input.speech);
    if (!severity) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_COLLECT_SEVERITY, session.language, session.data) };
    }
    session.data.severity = severity;
    session.state = CONVERSATION_STATES.IVR_EMERGENCY_SCREEN;
    return { twiml: twimlForState(session.state, session.language, session.data) };
  });
}

async function handleEmergencyScreen(req) {
  return processInput(req, 'emergency-screen', async (session, input) => {
    if (isEmergencySelection(input.digits, input.speech)) {
      session.data.isEmergency = true;
      return startIvrEmergency(session);
    }
    if (isNonEmergencySelection(input.digits, input.speech)) {
      session.data.isEmergency = false;
      session.state = CONVERSATION_STATES.IVR_CONFIRM;
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }
    return { twiml: twimlForState(CONVERSATION_STATES.IVR_EMERGENCY_SCREEN, session.language, session.data) };
  });
}

async function handleGender(req) {
  return processInput(req, 'gender', async (session, input) => {
    const rawVal = input.digits || input.speech;
    const s = String(rawVal || '').trim().toLowerCase();
    const gender = { '1': 'male', '2': 'female', '3': 'other' }[input.digits]
      || (s.includes('female') || s === 'two' ? 'female' : (s.includes('male') || s === 'one' ? 'male' : (s.includes('other') || s === 'three' ? 'other' : null)));
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

    if (isNegative(input.digits, input.speech)) {
      session.state = CONVERSATION_STATES.IVR_EDIT_SELECTION;
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }

    if (!isAffirmative(input.digits, input.speech)) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_CONFIRM, session.language, session.data) };
    }

    const required = ['name', 'age', 'gender', 'village', 'symptomsDescription'];
    if (!session.language || required.some(field => !session.data[field])) {
      return { twiml: getFailureTwiml(session.language) };
    }

    await finalizeRegistrationAndCase({
      phone: session.phone,
      channel: 'PHONE_IVR',
      language: session.language,
      data: session.data
    });
    session.state = CONVERSATION_STATES.IVR_COMPLETED;
    const response = new VoiceResponse();
    say(response, getPrompt(session.language).complete, session.language);
    response.hangup();
    return { twiml: response.toString() };
  });
}

async function handleEditSelection(req) {
  return processInput(req, 'edit-selection', async (session, input) => {
    const rawVal = input.digits || input.speech;
    const s = String(rawVal || '').toLowerCase().trim();

    if (input.digits === '9' || s.includes('back') || s.includes('confirm') || s === 'nine') {
      session.state = CONVERSATION_STATES.IVR_CONFIRM;
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }

    const fieldMap = {
      '1': 'name',
      '2': 'age',
      '3': 'gender',
      '4': 'village',
      '5': 'symptomsDescription',
      '6': 'duration',
      '7': 'severity',
      '8': 'emergencyScreen'
    };

    let selectedKey = input.digits;
    if (!selectedKey) {
      if (s.includes('name') || s === 'one') selectedKey = '1';
      else if (s.includes('age') || s === 'two') selectedKey = '2';
      else if (s.includes('gender') || s === 'three') selectedKey = '3';
      else if (s.includes('location') || s.includes('village') || s === 'four') selectedKey = '4';
      else if (s.includes('problem') || s.includes('symptom') || s === 'five') selectedKey = '5';
      else if (s.includes('duration') || s === 'six') selectedKey = '6';
      else if (s.includes('severity') || s === 'seven') selectedKey = '7';
      else if (s.includes('emergency') || s === 'eight') selectedKey = '8';
    }

    const targetField = fieldMap[selectedKey];
    if (!targetField) {
      return { twiml: twimlForState(CONVERSATION_STATES.IVR_EDIT_SELECTION, session.language, session.data) };
    }

    session.data.pendingField = targetField;
    session.state = CONVERSATION_STATES.IVR_EDIT_VALUE;
    return { twiml: twimlForEditValue(targetField, session.language, session.data) };
  });
}

async function handleEditValue(req) {
  return processInput(req, 'edit-value', async (session, input) => {
    const field = session.data.pendingField;
    if (!field) {
      session.state = CONVERSATION_STATES.IVR_CONFIRM;
      return { twiml: twimlForState(session.state, session.language, session.data) };
    }

    if (field === 'emergencyScreen') {
      if (isEmergencySelection(input.digits, input.speech)) {
        session.data.isEmergency = true;
        session.data.pendingField = null;
        return startIvrEmergency(session);
      }
      if (isNonEmergencySelection(input.digits, input.speech)) {
        session.data.isEmergency = false;
        session.data.pendingField = null;
        session.state = CONVERSATION_STATES.IVR_CONFIRM;
        return { twiml: twimlForState(session.state, session.language, session.data) };
      }
      return { twiml: twimlForEditValue(field, session.language, session.data) };
    }

    let parsed = null;
    if (field === 'name') {
      const val = input.speech || input.digits;
      if (val && val.length <= 100) parsed = val;
    } else if (field === 'age') {
      const val = input.digits || input.speech;
      const ageNum = Number(val);
      if (/^\d+$/.test(String(val || '').trim()) && ageNum >= 1 && ageNum <= 120) parsed = ageNum;
    } else if (field === 'gender') {
      const raw = input.digits || input.speech;
      const s = String(raw || '').toLowerCase();
      const gender = { '1': 'male', '2': 'female', '3': 'other' }[input.digits]
        || (s.includes('female') || s === 'two' ? 'female' : (s.includes('male') || s === 'one' ? 'male' : (s.includes('other') || s === 'three' ? 'other' : null)));
      if (gender) parsed = gender;
    } else if (field === 'village') {
      const val = input.speech || input.digits;
      if (val && val.length <= 200) parsed = val;
    } else if (field === 'symptomsDescription') {
      const val = input.speech || input.digits;
      if (val && val.length <= 2000) parsed = val;
    } else if (field === 'duration') {
      const val = parseDuration(input.digits, input.speech);
      if (val) parsed = val;
    } else if (field === 'severity') {
      const val = parseSeverity(input.digits, input.speech);
      if (val) parsed = val;
    }

    if (!parsed) {
      return { twiml: twimlForEditValue(field, session.language, session.data) };
    }

    session.data[field] = parsed;
    session.data.pendingField = null;
    session.state = CONVERSATION_STATES.IVR_CONFIRM;
    return { twiml: twimlForState(session.state, session.language, session.data) };
  });
}

async function handleCompleted(req) {
  return processInput(req, 'completed', async session => ({
    twiml: twimlForState(CONVERSATION_STATES.IVR_COMPLETED, session.language, session.data)
  }));
}

// Missed-call & Callback Logic
async function handleStatusCallback(req) {
  const body = req.body || {};
  const callSid = typeof body.CallSid === 'string' ? body.CallSid.trim() : '';
  const from = typeof body.From === 'string' ? body.From.trim() : '';
  const callStatus = typeof body.CallStatus === 'string' ? body.CallStatus.trim().toLowerCase() : '';

  if (!callSid || !from) {
    return { success: false, message: 'CallSid and From are required' };
  }

  const normalizedPhone = normalizePhone(from);
  const session = await findSession(callSid);

  // If call completed and reached IVR_COMPLETED, it was a successful consultation, not a missed call
  if (callStatus === 'completed' && session?.state === CONVERSATION_STATES.IVR_COMPLETED) {
    return { success: true, callbackCreated: false, reason: 'Call completed successfully' };
  }

  const eligibleMissedStatuses = ['no-answer', 'busy', 'failed', 'canceled', 'completed'];
  if (!eligibleMissedStatuses.includes(callStatus)) {
    return { success: true, callbackCreated: false, reason: `Status ${callStatus} not eligible` };
  }

  let callbackRecord;
  try {
    const IvrCallback = require('../models/IvrCallback');
    callbackRecord = await IvrCallback.create({
      callSid,
      callerPhone: normalizedPhone,
      callStatus,
      callbackRequested: true,
      callbackStatus: 'PENDING'
    });
  } catch (err) {
    if (err.code === 11000) {
      return { success: true, duplicate: true, message: 'Callback request already processed for this call' };
    }
    throw err;
  }

  const outboundResult = await initiateOutboundCallback({
    callerPhone: normalizedPhone,
    originalCallSid: callSid
  });

  if (callbackRecord && outboundResult?.callSid) {
    callbackRecord.callbackCallSid = outboundResult.callSid;
    callbackRecord.callbackStatus = 'CALLING';
    callbackRecord.lastAttemptAt = new Date();
    await callbackRecord.save();
  }

  return { success: true, callbackCreated: true, callback: callbackRecord };
}

async function initiateOutboundCallback({ callerPhone, originalCallSid }) {
  const { twilioClient, whatsappNumber } = require('../config/twilio');
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
    || process.env.TWILIO_CALLER_ID
    || (whatsappNumber ? whatsappNumber.replace(/^whatsapp:/, '') : null);

  const callbackUrl = getIvrCallbackUrl('/api/ivr/incoming?isCallback=true');

  if (twilioClient && typeof twilioClient.calls?.create === 'function' && fromNumber) {
    try {
      const call = await twilioClient.calls.create({
        to: callerPhone,
        from: fromNumber,
        url: callbackUrl
      });
      return { callSid: call.sid, status: 'initiated' };
    } catch (error) {
      console.warn('[IVR] Twilio outbound call creation failed:', error.message);
      return { error: error.message, status: 'failed' };
    }
  }

  return { callSid: `MOCK-CALLBACK-${require('crypto').randomUUID()}`, status: 'mock_initiated' };
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
  handleMenu,
  handleName,
  handleText,
  handleAge,
  handleGender,
  handleLocation,
  handleSymptoms,
  handleDuration,
  handleSeverity,
  handleEmergencyScreen,
  handleConfirm,
  handleEditSelection,
  handleEditValue,
  handleEmergencyLocation,
  handleEmergencyLocationConfirm,
  handleStatusCallback,
  initiateOutboundCallback,
  parseLocationCoordinates,
  handleCompleted,
  twimlForLanguage,
  twimlForState,
  twimlForEditValue,
  getFailureTwiml,
  getCallDetails,
  isAffirmative,
  isNegative,
  parseDuration,
  parseSeverity,
  isEmergencySelection,
  isNonEmergencySelection,
  parseMainMenuOption
};