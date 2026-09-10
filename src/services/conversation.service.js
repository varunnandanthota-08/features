const { normalizePhoneNumber } = require('../config/twilio');
const Conversation = require('../models/Conversation');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const enMessages = require('../messages/en');
const hiMessages = require('../messages/hi');
const teMessages = require('../messages/te');
const { createOrUpdatePatient, ensureEmergencyPatient } = require('./patient.service');
const { createEmergencyCase, getPatientLocation } = require('./emergency.service');
const { geocodeLocation } = require('./geocoding.service');
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

async function createChannelEmergency(conversation) {
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

  if (!conversation) {
    conversation = new Conversation({
      phone: normalizedPhone,
      channel: messageChannel,
      state: CONVERSATION_STATES.SELECT_LANGUAGE,
      processedMessageIds: messageId ? [messageId] : []
    });
    await conversation.save();

    return {
      conversation,
      response: `${enMessages.welcome}\n\n${enMessages.languageSelection}`
    };
  }

  if (messageId && conversation.processedMessageIds.includes(messageId)) {
    return { conversation, response: null, duplicate: true };
  }

  switch (conversation.state) {
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
      const gender = genders[normalizedMessage];

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
      if (messageChannel === smsChannel) {
        conversation.state = CONVERSATION_STATES.CONFIRM;
        return saveResponse(conversation, messageId, getMessages(conversation.language).askConfirmation);
      }

      try {
        await createOrUpdatePatient({
          phone: conversation.phone,
          name: conversation.data.name,
          age: conversation.data.age,
          gender: conversation.data.gender,
          village: conversation.data.village,
          language: conversation.language,
          symptomsDescription: conversation.data.symptomsDescription
        });
      } catch (error) {
        await conversation.save();
        console.error('[WhatsApp] Patient persistence failed:', error.message);
        return {
          conversation,
          response: getMessages(conversation.language).registrationFailed,
          persistenceFailed: true
        };
      }

      conversation.state = CONVERSATION_STATES.COMPLETED;
      return saveResponse(conversation, messageId, getMessages(conversation.language).completed);

    case CONVERSATION_STATES.CONFIRM: {
      if (messageChannel !== smsChannel) {
        throw new Error(`Unknown conversation state: ${conversation.state}`);
      }
      if (normalizedMessage === '2' || normalizedMessage.toLowerCase() === 'no') {
        conversation.state = CONVERSATION_STATES.SELECT_LANGUAGE;
        conversation.language = null;
        conversation.data = {};
        return saveResponse(conversation, messageId, `${enMessages.welcome}\n\n${enMessages.languageSelection}`);
      }
      if (normalizedMessage !== '1' && normalizedMessage.toLowerCase() !== 'yes') {
        return saveResponse(conversation, messageId, getMessages(conversation.language).invalidConfirmation);
      }

      try {
        await createOrUpdatePatient({
          phone: conversation.phone,
          name: conversation.data.name,
          age: conversation.data.age,
          gender: conversation.data.gender,
          village: conversation.data.village,
          language: conversation.language,
          symptomsDescription: conversation.data.symptomsDescription,
          source: smsChannel
        });
      } catch (error) {
        await conversation.save();
        console.error('[SMS] Patient persistence failed:', error.message);
        return {
          conversation,
          response: getMessages(conversation.language).registrationFailed,
          persistenceFailed: true
        };
      }

      conversation.state = CONVERSATION_STATES.COMPLETED;
      return saveResponse(conversation, messageId, getMessages(conversation.language).completed);
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
