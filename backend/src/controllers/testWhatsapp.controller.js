const crypto = require('crypto');
const Conversation = require('../models/Conversation');
const Document = require('../models/Document');
const { processMessage: defaultProcessMessage, normalizePhone } = require('../services/conversation.service');
const { extractDocumentData } = require('../services/gemini.service');
const { CONVERSATION_STATES } = require('../constants/conversationStates');
const enMessages = require('../messages/en');
const hiMessages = require('../messages/hi');
const teMessages = require('../messages/te');

const messagesByLanguage = { en: enMessages, hi: hiMessages, te: teMessages };
function getMessages(language) {
  return messagesByLanguage[language] || enMessages;
}

function createTestWhatsappController({ processMessage = defaultProcessMessage } = {}) {
  async function handleMessage(req, res) {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const messageId = typeof req.body?.messageId === 'string' && req.body.messageId.trim()
      ? req.body.messageId.trim()
      : `SM-test-${crypto.randomUUID()}`;
    const isVoice = Boolean(req.body?.isVoice);

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message are required' });
    }

    try {
      const result = await processMessage({
        channel: 'WHATSAPP',
        phone,
        message,
        messageId
      });

      return res.status(200).json({
        success: true,
        reply: result.response,
        state: result.conversation.state,
        duplicate: Boolean(result.duplicate),
        isVoice
      });
    } catch (error) {
      console.error('[Test WhatsApp] Message processing failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to process test WhatsApp message' });
    }
  }

  async function handleUpload(req, res) {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const normalizedPhone = normalizePhone(phone);
    let conversation = await Conversation.findOne({
      phone: normalizedPhone,
      channel: 'WHATSAPP'
    });

    if (!conversation) {
      conversation = new Conversation({
        phone: normalizedPhone,
        channel: 'WHATSAPP',
        state: CONVERSATION_STATES.OPTIONAL_DOCUMENT
      });
    }

    let extraction = null;
    let ocrFailed = false;

    try {
      if (typeof extractDocumentData === 'function') {
        extraction = await extractDocumentData(req.file, 'MEDICAL_REPORT');
      }
    } catch (error) {
      console.warn('[Test WhatsApp] Document extraction failed non-critically:', error.message);
      ocrFailed = true;
    }

    const docName = req.file.originalname || 'document.png';
    conversation.data.documentUrl = docName;
    if (extraction && extraction.findings) {
      conversation.data.documentFindings = extraction.findings;
    }

    try {
      const createdDoc = await Document.create({
        patientId: conversation.data.patientId || null,
        documentType: 'MEDICAL_REPORT',
        originalFileName: docName,
        mimeType: req.file.mimetype || 'image/png',
        fileSize: req.file.size || 0,
        extractionStatus: ocrFailed ? 'FAILED' : (extraction ? 'EXTRACTED' : 'DRAFT'),
        extractedData: extraction?.extractedData || extraction || {},
        confidence: extraction?.confidence || {},
        uploadedBy: 'PATIENT_WHATSAPP'
      });
      if (createdDoc?._id) {
        conversation.data.documentId = createdDoc._id;
      }
    } catch (e) {
      // Non-blocking document record creation
    }

    // Advance to confirmation without blocking
    conversation.state = CONVERSATION_STATES.CONFIRM;
    await conversation.save();

    const lang = conversation.language || 'en';
    const msgs = getMessages(lang);
    let uploadNotice = ocrFailed
      ? `Document "${docName}" could not be automatically read, but is attached to your consultation.\n\n`
      : `📎 Document "${docName}" uploaded and processed.\n\n`;

    const summaryText = msgs.confirmationSummary(conversation.data);

    return res.status(200).json({
      success: true,
      reply: `${uploadNotice}${summaryText}`,
      state: conversation.state,
      fileName: docName,
      ocrFailed
    });
  }

  async function resetConversation(req, res) {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    try {
      await Conversation.deleteOne({ phone: normalizePhone(phone), channel: 'WHATSAPP' });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Test WhatsApp] Reset failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to reset test WhatsApp conversation' });
    }
  }

  return { handleMessage, handleUpload, resetConversation };
}

module.exports = { createTestWhatsappController };