const express = require('express');

const { normalizeWhatsAppNumber } = require('../config/twilio');
const { processMessage: defaultProcessMessage } = require('../services/conversation.service');
const { sendMessage: defaultSendMessage, getMediaUrl: defaultGetMediaUrl, downloadMedia: defaultDownloadMedia } = require('../services/metaWhatsapp.service');

function createMetaWhatsappRouter({
  processMessage = defaultProcessMessage,
  sendMessage = defaultSendMessage,
  getMediaUrl = defaultGetMediaUrl,
  downloadMedia = defaultDownloadMedia
} = {}) {
  const router = express.Router();

  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  router.post('/webhook', async (req, res) => {
    const body = req.body;
    
    if (body.object === 'whatsapp_business_account') {
      res.status(200).send('EVENT_RECEIVED'); // Ack immediately

      if (body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const messageObj = body.entry[0].changes[0].value.messages[0];
        
        if (messageObj.type === 'text' || messageObj.type === 'image' || messageObj.type === 'document') {
          const messageId = messageObj.id;
          const from = messageObj.from;
          const e164From = from.startsWith('+') ? from : `+${from}`;
          const normalizedPhone = normalizeWhatsAppNumber(e164From).replace(/^whatsapp:/, '');

          let text = '';
          const attachments = [];

          if (messageObj.type === 'text') {
            text = messageObj.text.body;
          } else {
            const mediaData = messageObj[messageObj.type];
            const mediaId = mediaData.id;
            const mimeType = mediaData.mime_type;
            const caption = mediaData.caption || '';
            const filename = mediaData.filename || `${messageObj.type}-${mediaId}`;
            
            text = caption; // Use caption as text if present

            if (typeof getMediaUrl === 'function' && typeof downloadMedia === 'function') {
              const url = await getMediaUrl(mediaId);
              if (url) {
                const buffer = await downloadMedia(url);
                if (buffer) {
                  attachments.push({
                    url,
                    contentType: mimeType,
                    mimetype: mimeType,
                    buffer,
                    originalname: filename,
                    size: buffer.length
                  });
                }
              }
            }
          }

          const incomingMessage = {
            channel: 'WHATSAPP',
            phone: normalizedPhone,
            message: text,
            messageId: messageId,
            attachments
          };

          try {
            const result = await processMessage(incomingMessage);
            if (result && !result.duplicate && result.response) {
              await sendMessage(incomingMessage.phone, result.response);
            }
          } catch (error) {
            console.error('[Meta WhatsApp] Error processing message:', error);
          }
        }
      }
      return;
    } else {
      return res.sendStatus(404);
    }
  });

  return router;
}

module.exports = createMetaWhatsappRouter();
module.exports.createMetaWhatsappRouter = createMetaWhatsappRouter;
