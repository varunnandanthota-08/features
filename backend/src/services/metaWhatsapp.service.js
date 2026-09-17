const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v20.0';

async function sendMessage(phone, text) {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    console.error('[Meta WhatsApp] Missing required environment variables for sending message.');
    return false;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone.replace('+', ''), // Meta requires phone without '+'
        type: 'text',
        text: {
          body: text
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Safe error logging - do not log the full request or token
      console.error(`[Meta WhatsApp] Failed to send message. Status: ${response.status}. Error:`, errorData?.error?.message || 'Unknown error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Meta WhatsApp] Network or parsing error while sending message:', error.message);
    return false;
  }
}
async function getMediaUrl(mediaId) {
  if (!META_ACCESS_TOKEN) {
    console.error('[Meta WhatsApp] Missing META_ACCESS_TOKEN for getMediaUrl.');
    return null;
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }
    });
    if (!response.ok) {
      console.error('[Meta WhatsApp] Failed to get media URL:', response.status);
      return null;
    }
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('[Meta WhatsApp] Error getting media URL:', error.message);
    return null;
  }
}

async function downloadMedia(url) {
  if (!META_ACCESS_TOKEN) {
    console.error('[Meta WhatsApp] Missing META_ACCESS_TOKEN for downloadMedia.');
    return null;
  }
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }
    });
    if (!response.ok) {
      console.error('[Meta WhatsApp] Failed to download media:', response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[Meta WhatsApp] Error downloading media:', error.message);
    return null;
  }
}

module.exports = {
  sendMessage,
  getMediaUrl,
  downloadMedia
};
