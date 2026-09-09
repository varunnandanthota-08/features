const { normalizePhoneNumber } = require('../config/twilio');
const Conversation = require('../models/Conversation');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const enMessages = require('../messages/en');
const hiMessages = require('../messages/hi');
const teMessages = require('../messages/te');
const { createOrUpdatePatient } = require('./patient.service');

const messagesByLanguage = { en: enMessages, hi: hiMessages, te: teMessages };
const channel = 'WHATSAPP';
const smsChannel = 'SMS';

function normalizePhone(phone) {
  return normalizePhoneNumber(phone);
}

function getMessages(language) {
  return messagesByLanguage[language] || enMessages;
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
      const selectedLanguages = { '1': 'te', '2': 'hi', '3': 'en' };
      const language = selectedLanguages[normalizedMessage];

      if (!language) {
        return saveResponse(conversation, messageId, enMessages.invalidLanguage);
      }

      conversation.language = language;
      conversation.state = CONVERSATION_STATES.COLLECT_NAME;
      return saveResponse(conversation, messageId, getMessages(language).askName);
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
