const { normalizePhoneNumber } = require('../config/twilio');
const Conversation = require('../models/Conversation');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const enMessages = require('../messages/en');
const hiMessages = require('../messages/hi');
const teMessages = require('../messages/te');
const { createOrUpdatePatient, ensureEmergencyPatient } = require('./patient.service');
const { createEmergencyCase, getPatientLocation } = require('./emergency.service');
const { geocodeLocation } = require('./geocoding.service');
const { createCase } = require('./case.service');
const { finalizeRegistrationAndCase, checkExistingPatient, getActiveCasesForPhone } = require('./registration.service');
const { CHANNEL_MENU_OPTIONS, languageForMenuOption, isMenuOption } = require('../constants/channelMenu');

const messagesByLanguage = { en: enMessages, hi: hiMessages, te: teMessages };
const channel = 'WHATSAPP';
const smsChannel = 'SMS';

function normalizePhone(phone) {
  return normalizePhoneNumber(phone);
}

function getMessages(language) {
  return messagesByLanguage[language] || enMessages;
}

function emergencyResponseMessage(language, result) {
  const facility = result?.selectedFacility;
  if (facility?.healthCenterId && facility?.name) {
    return `${getMessages(language).emergencyRegistered} Assigned Health Centre: ${facility.healthCenterId} - ${facility.name}.`;
  }
  return getMessages(language).emergencyRegistered;
}

async function createNormalCaseFromConversation(conversation, patient) {
  if (!patient?._id || !conversation.data.symptomsDescription) return;
  await createCase({
    patientId: patient._id,
    source: conversation.channel === smsChannel ? 'SMS' : 'WHATSAPP',
    complaint: conversation.data.symptomsDescription,
    location: patient.location
  });
}

async function createChannelEmergency(conversation) {
  await ensureEmergencyPatient(conversation.phone, conversation.channel);
  return createEmergencyCase({
    phone: conversation.phone,
    source: conversation.channel,
    reason: `Emergency request via ${conversation.channel}`,
    location: {
      latitude: conversation.data.emergencyLatitude,
      longitude: conversation.data.emergencyLongitude
    },
    locationLabel: conversation.data.emergencyLocationLabel,
    status: 'ALERTED'
  });
}

async function startChannelEmergency(conversation, messageId) {
  if (conversation.channel === smsChannel) {
    await ensureEmergencyPatient(conversation.phone, smsChannel);
  }
  const storedLocation = await getPatientLocation({ phone: conversation.phone });
  const hasCoordinates = Number.isFinite(storedLocation?.latitude)
    && Number.isFinite(storedLocation?.longitude);
  if (hasCoordinates) {
    const result = await createEmergencyCase({
      phone: conversation.phone,
      source: conversation.channel,
      reason: `Emergency request via ${conversation.channel}`,
      location: storedLocation,
      status: 'ALERTED'
    });
    conversation.state = CONVERSATION_STATES.COMPLETED;
    conversation.data.emergencyCaseId = result.emergency.caseId;
    return saveResponse(conversation, messageId, emergencyResponseMessage(conversation.language || 'en', result));
  }
  conversation.state = CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION;
  return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').emergencyLocation);
}

function markMessageProcessed(conversation, messageId) {
  if (messageId && !conversation.processedMessageIds.includes(messageId)) {
    conversation.processedMessageIds.push(messageId);
  }
}

async function saveResponse(conversation, messageId, response) {
  markMessageProcessed(conversation, messageId);
  await conversation.save();
  return { conversation, response };
}

async function processMessage({ phone, message, messageId, channel: messageChannel = channel }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';

  if (![channel, smsChannel].includes(messageChannel)) {
    throw new Error('Unsupported conversation channel');
  }

  let conversation = await Conversation.findOne({
    phone: normalizedPhone,
    channel: messageChannel
  });

  const upperMessage = normalizedMessage.toUpperCase();

  if (!conversation) {
    conversation = new Conversation({
      phone: normalizedPhone,
      channel: messageChannel,
      state: CONVERSATION_STATES.SELECT_LANGUAGE,
      processedMessageIds: messageId ? [messageId] : []
    });

    if (upperMessage === 'EMERGENCY' || upperMessage === 'SOS') {
      await conversation.save();
      return startChannelEmergency(conversation, messageId);
    }
    if (upperMessage === 'HELP') {
      await conversation.save();
      return { conversation, response: getMessages('en').smsHelp };
    }
    if (upperMessage === 'STATUS' || upperMessage === 'FOLLOWUP') {
      await conversation.save();
      const activeCases = await getActiveCasesForPhone(normalizedPhone);
      return { conversation, response: getMessages('en').statusResponse(activeCases) };
    }

    await conversation.save();
    return {
      conversation,
      response: `${enMessages.welcome}\n\n${enMessages.languageSelection}`
    };
  }

  if (messageId && conversation.processedMessageIds.includes(messageId)) {
    return { conversation, response: null, duplicate: true };
  }

  if (upperMessage === 'CANCEL' || upperMessage === 'RESET' || upperMessage === 'START AGAIN') {
    conversation.state = CONVERSATION_STATES.SELECT_LANGUAGE;
    conversation.language = null;
    conversation.data = {};
    return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').cancelled);
  }

  if (upperMessage === 'HELP') {
    return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').smsHelp);
  }

  if (upperMessage === 'STATUS' || upperMessage === 'FOLLOWUP') {
    const activeCases = await getActiveCasesForPhone(normalizedPhone);
    return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').statusResponse(activeCases));
  }

  if (upperMessage === 'EMERGENCY' || upperMessage === 'SOS') {
    return startChannelEmergency(conversation, messageId);
  }

  if (upperMessage === 'MENU') {
    conversation.state = CONVERSATION_STATES.MAIN_MENU;
    return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').mainMenu);
  }

  switch (conversation.state) {
    case CONVERSATION_STATES.MAIN_MENU: {
      if (normalizedMessage === '1') {
        const existingPatient = await checkExistingPatient(normalizedPhone);
        if (existingPatient && existingPatient.name && existingPatient.location?.village) {
          conversation.data.name = existingPatient.name;
          conversation.data.age = existingPatient.age;
          conversation.data.gender = existingPatient.gender;
          conversation.data.village = existingPatient.location.village;
          conversation.data.isExistingPatient = true;
          conversation.data.patientId = existingPatient._id;
          conversation.state = CONVERSATION_STATES.COLLECT_SYMPTOMS;
          return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').welcomeBack(existingPatient.name));
        }
        conversation.state = CONVERSATION_STATES.COLLECT_NAME;
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').askName);
      }
      if (normalizedMessage === '2') {
        const activeCases = await getActiveCasesForPhone(normalizedPhone);
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').statusResponse(activeCases));
      }
      if (normalizedMessage === '3') {
        return startChannelEmergency(conversation, messageId);
      }
      if (normalizedMessage === '4') {
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').contactSupport);
      }
      return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').mainMenu);
    }

    case CONVERSATION_STATES.START:
      conversation.state = CONVERSATION_STATES.SELECT_LANGUAGE;
      return saveResponse(conversation, messageId, `${enMessages.welcome}\n\n${enMessages.languageSelection}`);

    case CONVERSATION_STATES.SELECT_LANGUAGE: {
      const language = languageForMenuOption(normalizedMessage);

      if (isMenuOption(normalizedMessage, CHANNEL_MENU_OPTIONS.SUPPORT)) {
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').contactSupport);
      }
      if (isMenuOption(normalizedMessage, CHANNEL_MENU_OPTIONS.EMERGENCY)) {
        return startChannelEmergency(conversation, messageId);
      }

      if (!language) {
        return saveResponse(conversation, messageId, enMessages.invalidLanguage);
      }

      conversation.language = language;

      const existingPatient = await checkExistingPatient(normalizedPhone);
      if (existingPatient && existingPatient.name && existingPatient.location?.village) {
        conversation.data.name = existingPatient.name;
        conversation.data.age = existingPatient.age;
        conversation.data.gender = existingPatient.gender;
        conversation.data.village = existingPatient.location.village;
        conversation.data.isExistingPatient = true;
        conversation.data.patientId = existingPatient._id;
        conversation.state = CONVERSATION_STATES.COLLECT_SYMPTOMS;
        return saveResponse(conversation, messageId, getMessages(language).welcomeBack(existingPatient.name));
      }

      conversation.state = CONVERSATION_STATES.COLLECT_NAME;
      return saveResponse(conversation, messageId, getMessages(language).askName);
    }

    case CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION: {
      if (!normalizedMessage || normalizedMessage.length > 200) {
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').emergencyLocation);
      }
      const resolvedLocation = await geocodeLocation(normalizedMessage);
      if (!resolvedLocation) {
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').emergencyLocationFailed);
      }
      conversation.data.emergencyLatitude = resolvedLocation.latitude;
      conversation.data.emergencyLongitude = resolvedLocation.longitude;
      conversation.data.emergencyLocationLabel = resolvedLocation.displayName || normalizedMessage;
      conversation.state = CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION_CONFIRM;
      return saveResponse(conversation, messageId, getMessages(conversation.language || 'en')
        .emergencyLocationConfirm(conversation.data.emergencyLocationLabel));
    }

    case CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION_CONFIRM:
      if (normalizedMessage === '2') {
        conversation.state = CONVERSATION_STATES.CHANNEL_EMERGENCY_LOCATION;
        conversation.data.emergencyLatitude = null;
        conversation.data.emergencyLongitude = null;
        conversation.data.emergencyLocationLabel = null;
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').emergencyLocation);
      }
      if (normalizedMessage !== '1') {
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en')
          .emergencyLocationConfirm(conversation.data.emergencyLocationLabel));
      }
      {
        const result = await createChannelEmergency(conversation);
        conversation.state = CONVERSATION_STATES.COMPLETED;
        conversation.data.emergencyCaseId = result.emergency.caseId;
        return saveResponse(conversation, messageId, emergencyResponseMessage(conversation.language || 'en', result));
      }

    case CONVERSATION_STATES.COLLECT_NAME:
      if (!normalizedMessage || normalizedMessage.length > 100) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askName);
      }
      conversation.data.name = normalizedMessage;
      conversation.state = CONVERSATION_STATES.COLLECT_AGE;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askAge);

    case CONVERSATION_STATES.COLLECT_AGE: {
      const age = Number(normalizedMessage);
      const validAge = /^\d+$/.test(normalizedMessage) && age >= 1 && age <= 120;

      if (!validAge) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).invalidAge);
      }

      conversation.data.age = age;
      conversation.state = CONVERSATION_STATES.COLLECT_GENDER;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askGender);
    }

    case CONVERSATION_STATES.COLLECT_GENDER: {
      const genders = { '1': 'male', '2': 'female', '3': 'other' };
      const gender = genders[normalizedMessage] || genders[normalizedMessage.toLowerCase()];

      if (!gender) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).invalidGender);
      }

      conversation.data.gender = gender;
      conversation.state = CONVERSATION_STATES.COLLECT_LOCATION;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askLocation);
    }

    case CONVERSATION_STATES.COLLECT_LOCATION:
      if (!normalizedMessage || normalizedMessage.length > 200) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askLocation);
      }
      conversation.data.village = normalizedMessage;
      conversation.state = CONVERSATION_STATES.COLLECT_SYMPTOMS;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askSymptoms);

    case CONVERSATION_STATES.COLLECT_SYMPTOMS:
      if (!normalizedMessage || normalizedMessage.length > 2000) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askSymptoms);
      }
      conversation.data.symptomsDescription = normalizedMessage;
      conversation.state = CONVERSATION_STATES.COLLECT_DURATION;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askDuration);

    case CONVERSATION_STATES.COLLECT_DURATION: {
      const durationMap = {
        '1': 'Less than 1 day',
        '2': '1 to 3 days',
        '3': '4 to 7 days',
        '4': 'More than 1 week',
        '5': 'More than 1 month'
      };
      const duration = durationMap[normalizedMessage] || normalizedMessage;
      if (!duration || duration.length > 200) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askDuration);
      }
      conversation.data.duration = duration;
      conversation.state = CONVERSATION_STATES.COLLECT_SEVERITY;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askSeverity);
    }

    case CONVERSATION_STATES.COLLECT_SEVERITY: {
      const severityMap = {
        '1': 'Mild',
        '2': 'Moderate',
        '3': 'Severe',
        'mild': 'Mild',
        'moderate': 'Moderate',
        'severe': 'Severe'
      };
      const severity = severityMap[normalizedMessage] || severityMap[normalizedMessage.toLowerCase()];
      if (!severity) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askSeverity);
      }
      conversation.data.severity = severity;
      conversation.state = CONVERSATION_STATES.EMERGENCY_SCREENING;
      return saveResponse(conversation, messageId, getMessages(conversation.language).askEmergencyScreen);
    }

    case CONVERSATION_STATES.EMERGENCY_SCREENING: {
      const lowerScreen = normalizedMessage.toLowerCase();
      if (['1', '2', '3', '4'].includes(normalizedMessage) ||
          /(chest pain|breathing|bleeding|unconscious|faint|heart attack|choking)/i.test(normalizedMessage)) {
        conversation.data.isEmergency = true;
        return startChannelEmergency(conversation, messageId);
      }

      if (normalizedMessage === '5' || ['none', 'no', 'none of these', '5 - none of these'].includes(lowerScreen)) {
        conversation.data.isEmergency = false;
        if (messageChannel === channel) {
          conversation.state = CONVERSATION_STATES.OPTIONAL_DOCUMENT;
          return saveResponse(conversation, messageId, getMessages(conversation.language).askOptionalDocument);
        }
        conversation.state = CONVERSATION_STATES.CONFIRM;
        return saveResponse(conversation, messageId, getMessages(conversation.language).confirmationSummary(conversation.data));
      }

      return saveResponse(conversation, messageId, getMessages(conversation.language).askEmergencyScreen);
    }

    case CONVERSATION_STATES.OPTIONAL_DOCUMENT: {
      const lowerDoc = normalizedMessage.toLowerCase();
      if (normalizedMessage === '2' || ['skip', 'no', 'none', 'later'].includes(lowerDoc)) {
        conversation.state = CONVERSATION_STATES.CONFIRM;
        return saveResponse(conversation, messageId, getMessages(conversation.language).confirmationSummary(conversation.data));
      }
      if (normalizedMessage === '1' || lowerDoc === 'upload') {
        return saveResponse(conversation, messageId, getMessages(conversation.language).documentUploadPrompt);
      }
      if (normalizedMessage.startsWith('[DOCUMENT]') || normalizedMessage.startsWith('[FILE]')) {
        conversation.data.documentUrl = normalizedMessage;
        conversation.state = CONVERSATION_STATES.CONFIRM;
        return saveResponse(conversation, messageId, getMessages(conversation.language).confirmationSummary(conversation.data));
      }
      conversation.state = CONVERSATION_STATES.CONFIRM;
      return saveResponse(conversation, messageId, getMessages(conversation.language).confirmationSummary(conversation.data));
    }

    case CONVERSATION_STATES.CONFIRM: {
      const lowerConfirm = normalizedMessage.toLowerCase();
      if (normalizedMessage === '1' || lowerConfirm === 'yes' || lowerConfirm === 'confirm') {
        try {
          const finalResult = await finalizeRegistrationAndCase({
            phone: conversation.phone,
            channel: messageChannel,
            language: conversation.language,
            data: conversation.data
          });
          conversation.state = CONVERSATION_STATES.COMPLETED;
          const caseRecord = finalResult?.case;
          const facility = finalResult?.selectedFacility;
          const responseText = getMessages(conversation.language).caseCreatedDetailed({
            caseId: caseRecord?.caseId || 'CASE-RECORDED',
            status: caseRecord?.status || 'ASSIGNED',
            facilityName: facility?.name || null
          });
          return saveResponse(conversation, messageId, responseText);
        } catch (error) {
          await conversation.save();
          console.error(`[${messageChannel}] Patient persistence failed:`, error.message);
          return {
            conversation,
            response: getMessages(conversation.language).registrationFailed,
            persistenceFailed: true
          };
        }
      }

      if (normalizedMessage === '2' || lowerConfirm === 'edit' || lowerConfirm === 'edit information') {
        conversation.state = CONVERSATION_STATES.EDIT_SELECTION;
        return saveResponse(conversation, messageId, getMessages(conversation.language).askEditField);
      }

      if (normalizedMessage === '3' || ['no', 'start again', 'restart', 'cancel', 'reset'].includes(lowerConfirm)) {
        conversation.state = CONVERSATION_STATES.SELECT_LANGUAGE;
        conversation.language = null;
        conversation.data = {};
        return saveResponse(conversation, messageId, getMessages(conversation.language || 'en').cancelled);
      }

      return saveResponse(conversation, messageId, getMessages(conversation.language).invalidConfirmation);
    }

    case CONVERSATION_STATES.EDIT_SELECTION: {
      if (normalizedMessage === '9' || normalizedMessage.toLowerCase() === 'back') {
        conversation.state = CONVERSATION_STATES.CONFIRM;
        return saveResponse(conversation, messageId, getMessages(conversation.language).confirmationSummary(conversation.data));
      }
      const editFieldMap = {
        '1': { field: 'name', prompt: 'askName' },
        '2': { field: 'age', prompt: 'askAge' },
        '3': { field: 'gender', prompt: 'askGender' },
        '4': { field: 'village', prompt: 'askLocation' },
        '5': { field: 'symptomsDescription', prompt: 'askSymptoms' },
        '6': { field: 'duration', prompt: 'askDuration' },
        '7': { field: 'severity', prompt: 'askSeverity' },
        '8': { field: 'emergencyScreen', prompt: 'askEmergencyScreen' }
      };
      const target = editFieldMap[normalizedMessage];
      if (!target) {
        return saveResponse(conversation, messageId, getMessages(conversation.language).askEditField);
      }
      conversation.data.pendingField = target.field;
      conversation.state = CONVERSATION_STATES.EDIT_VALUE;
      return saveResponse(conversation, messageId, getMessages(conversation.language)[target.prompt]);
    }

    case CONVERSATION_STATES.EDIT_VALUE: {
      const field = conversation.data.pendingField;

      if (field === 'emergencyScreen') {
        const lowerScreen = normalizedMessage.toLowerCase();
        if (['1', '2', '3', '4'].includes(normalizedMessage) ||
            /(chest pain|breathing|bleeding|unconscious|faint|heart attack|choking)/i.test(normalizedMessage)) {
          conversation.data.isEmergency = true;
          conversation.data.pendingField = null;
          return startChannelEmergency(conversation, messageId);
        }

        if (normalizedMessage === '5' || ['none', 'no', 'none of these', '5 - none of these'].includes(lowerScreen)) {
          conversation.data.isEmergency = false;
          conversation.data.pendingField = null;
          conversation.state = CONVERSATION_STATES.CONFIRM;
          const notice = getMessages(conversation.language).fieldUpdated('Emergency screening');
          const summary = getMessages(conversation.language).confirmationSummary(conversation.data);
          return saveResponse(conversation, messageId, `${notice}\n\n${summary}`);
        }

        return saveResponse(conversation, messageId, getMessages(conversation.language).askEmergencyScreen);
      }

      let valid = false;
      let parsedValue = normalizedMessage;
      let errorMessage = null;

      if (field === 'name') {
        valid = normalizedMessage.length > 0 && normalizedMessage.length <= 100;
        errorMessage = getMessages(conversation.language).askName;
      } else if (field === 'age') {
        const age = Number(normalizedMessage);
        valid = /^\d+$/.test(normalizedMessage) && age >= 1 && age <= 120;
        parsedValue = age;
        errorMessage = getMessages(conversation.language).invalidAge;
      } else if (field === 'gender') {
        const genderMap = { '1': 'male', '2': 'female', '3': 'other', 'male': 'male', 'female': 'female', 'other': 'other' };
        parsedValue = genderMap[normalizedMessage.toLowerCase()] || genderMap[normalizedMessage];
        valid = Boolean(parsedValue);
        errorMessage = getMessages(conversation.language).invalidGender;
      } else if (field === 'village') {
        valid = normalizedMessage.length > 0 && normalizedMessage.length <= 200;
        errorMessage = getMessages(conversation.language).askLocation;
      } else if (field === 'symptomsDescription') {
        valid = normalizedMessage.length > 0 && normalizedMessage.length <= 2000;
        errorMessage = getMessages(conversation.language).askSymptoms;
      } else if (field === 'duration') {
        const durationMap = {
          '1': 'Less than 1 day',
          '2': '1 to 3 days',
          '3': '4 to 7 days',
          '4': 'More than 1 week',
          '5': 'More than 1 month'
        };
        parsedValue = durationMap[normalizedMessage] || normalizedMessage;
        valid = Boolean(parsedValue && parsedValue.length <= 200);
        errorMessage = getMessages(conversation.language).askDuration;
      } else if (field === 'severity') {
        const severityMap = {
          '1': 'Mild',
          '2': 'Moderate',
          '3': 'Severe',
          'mild': 'Mild',
          'moderate': 'Moderate',
          'severe': 'Severe'
        };
        parsedValue = severityMap[normalizedMessage] || severityMap[normalizedMessage.toLowerCase()];
        valid = Boolean(parsedValue);
        errorMessage = getMessages(conversation.language).askSeverity;
      }

      if (!valid) {
        return saveResponse(conversation, messageId, errorMessage);
      }

      conversation.data[field] = parsedValue;
      conversation.data.pendingField = null;
      conversation.state = CONVERSATION_STATES.CONFIRM;

      const fieldLabels = {
        name: 'Name',
        age: 'Age',
        gender: 'Gender',
        village: 'Location',
        symptomsDescription: 'Health problem',
        duration: 'Duration',
        severity: 'Severity',
        emergencyScreen: 'Emergency screening'
      };
      const notice = getMessages(conversation.language).fieldUpdated(fieldLabels[field] || field);
      const summary = getMessages(conversation.language).confirmationSummary(conversation.data);
      return saveResponse(conversation, messageId, `${notice}\n\n${summary}`);
    }

    case CONVERSATION_STATES.COMPLETED:
      return saveResponse(conversation, messageId, getMessages(conversation.language).completed);

    default:
      throw new Error(`Unknown conversation state: ${conversation.state}`);
  }
}

module.exports = {
  processMessage,
  normalizePhone
};
