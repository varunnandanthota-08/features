const request = require('supertest');

jest.mock('../src/services/conversation.service', () => ({
  processMessage: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/services/metaWhatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  getMediaUrl: jest.fn().mockResolvedValue('https://mocked.url/media'),
  downloadMedia: jest.fn().mockResolvedValue(Buffer.from('mocked-media-buffer'))
}));

const { app } = require('../src/app');

describe('Meta WhatsApp Webhook Verification', () => {
  const originalEnv = process.env;

  const processMessageMock = require('../src/services/conversation.service').processMessage;
  const sendMessageMock = require('../src/services/metaWhatsapp.service').sendMessage;

  beforeEach(() => {
    processMessageMock.mockClear();
    sendMessageMock.mockClear();
    process.env = { ...originalEnv };
    process.env.META_VERIFY_TOKEN = 'test-token-123';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should verify webhook with valid token', async () => {
    const response = await request(app)
      .get('/api/channels/meta-whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-token-123',
        'hub.challenge': '1158201444'
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe('1158201444');
  });

  it('should reject webhook with invalid token', async () => {
    const response = await request(app)
      .get('/api/channels/meta-whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': '1158201444'
      });

    expect(response.status).toBe(403);
  });

  it('should accept valid Meta POST payload and call Conversation Service with normalized message', async () => {    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messages: [{
                from: '14155552671',
                id: 'wamid.HBgLMTQxNTU1NTI2NzEVAgASGBQzRTA5RjhBNUUwMkE2OUM5OEIyMQA=',
                type: 'text',
                text: { body: 'Hello' }
              }]
            }
          }]
        }]
      });
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
    
    // Wait for the async processMessage to be called since response is sent first
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(processMessageMock).toHaveBeenCalledWith({
      channel: 'WHATSAPP',
      phone: '+14155552671', // from normalizeWhatsAppNumber
      message: 'Hello',
      messageId: 'wamid.HBgLMTQxNTU1NTI2NzEVAgASGBQzRTA5RjhBNUUwMkE2OUM5OEIyMQA=',
      attachments: []
    });
  });

  it('should accept valid Meta POST payload, call Conversation Service, and NOT call sendMessage if no reply', async () => {    
    processMessageMock.mockResolvedValueOnce({
      conversation: {},
      response: null
    });
    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ id: '123', changes: [{ value: { messages: [{ from: '14155552671', id: 'wamid.123', type: 'text', text: { body: 'Hello' } }] } }] }]
      });
    
    expect(response.status).toBe(200);
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should call sendMessage if Conversation Service returns a reply', async () => {    
    processMessageMock.mockResolvedValueOnce({
      conversation: {},
      response: 'Welcome to the clinic'
    });
    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ id: '123', changes: [{ value: { messages: [{ from: '14155552671', id: 'wamid.123', type: 'text', text: { body: 'Hello' } }] } }] }]
      });
    
    expect(response.status).toBe(200);
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith('+14155552671', 'Welcome to the clinic');
  });

  it('should safely ignore unsupported webhook payloads without throwing', async () => {
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              statuses: [{
                id: 'wamid.123',
                status: 'delivered'
              }]
            }
          }]
        }]
      });
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
    expect(processMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should not crash if Meta API send fails', async () => {    
    processMessageMock.mockResolvedValueOnce({
      conversation: {},
      response: 'Welcome to the clinic'
    });
    sendMessageMock.mockRejectedValueOnce(new Error('Network failure'));
    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ id: '123', changes: [{ value: { messages: [{ from: '14155552671', id: 'wamid.123', type: 'text', text: { body: 'Hello' } }] } }] }]
      });
    
    expect(response.status).toBe(200);
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it('should accept image message, download media, and call Conversation Service with attachment', async () => {    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messages: [{
                from: '14155552671',
                id: 'wamid.img123',
                type: 'image',
                image: { id: 'media-123', mime_type: 'image/jpeg', caption: 'Here is my report' }
              }]
            }
          }]
        }]
      });
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
    
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(processMessageMock).toHaveBeenCalledWith({
      channel: 'WHATSAPP',
      phone: '+14155552671',
      message: 'Here is my report',
      messageId: 'wamid.img123',
      attachments: [{
        url: 'https://mocked.url/media',
        contentType: 'image/jpeg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('mocked-media-buffer'),
        originalname: 'image-media-123',
        size: Buffer.from('mocked-media-buffer').length
      }]
    });
  });

  it('should accept document message, download media, and call Conversation Service with attachment', async () => {    
    const response = await request(app)
      .post('/api/channels/meta-whatsapp/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messages: [{
                from: '14155552671',
                id: 'wamid.doc123',
                type: 'document',
                document: { id: 'media-456', mime_type: 'application/pdf', filename: 'report.pdf' }
              }]
            }
          }]
        }]
      });
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
    
    await new Promise(r => setTimeout(r, 50));
    
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(processMessageMock).toHaveBeenCalledWith({
      channel: 'WHATSAPP',
      phone: '+14155552671',
      message: '', // No caption provided
      messageId: 'wamid.doc123',
      attachments: [{
        url: 'https://mocked.url/media',
        contentType: 'application/pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('mocked-media-buffer'),
        originalname: 'report.pdf',
        size: Buffer.from('mocked-media-buffer').length
      }]
    });
  });
});
