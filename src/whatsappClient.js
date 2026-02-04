const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    // Determine auth path: use env var, or detect Docker vs local dev
    let authPath = process.env.WHATSAPP_AUTH_PATH;
    if (!authPath) {
      // Check if we're in Docker by checking for /data directory (mounted volume)
      // In Docker, auth is mounted to /app/.wwebjs_auth
      // In local dev, use ./.wwebjs_auth
      if (fs.existsSync('/data')) {
        authPath = '/app/.wwebjs_auth';
      } else {
        // Local development - use relative path
        authPath = path.join(process.cwd(), '.wwebjs_auth');
      }
    }
    
    logger.info(`Using WhatsApp auth path: ${authPath}`);
    
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      }
    });

    this.isReady = false;
    this.isAuthenticated = false;
    this.qrData = null;
    this.setupHandlers();
  }

  setupHandlers() {
    this.client.on('qr', async (qr) => {
      logger.info('QR Code received. Please scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
      
      // Generate QR code as data URL for web UI
      try {
        this.qrData = await QRCode.toDataURL(qr);
        this.emit('qr', this.qrData);
      } catch (err) {
        logger.error('Error generating QR code:', err);
      }
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
      this.isReady = true;
      this.qrData = null;
      this.emit('ready');
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated successfully');
      this.isAuthenticated = true;
      this.qrData = null;
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('WhatsApp authentication failed:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.isAuthenticated = false;
      this.emit('disconnected', reason);
    });
  }

  getStatus() {
    return {
      isReady: this.isReady,
      isAuthenticated: this.isAuthenticated,
      qrData: this.qrData
    };
  }

  async initialize() {
    // Add loading screen listener for visibility
    this.client.on('loading_screen', (percent, message) => {
      logger.info(`WhatsApp loading: ${percent}% - ${message}`);
    });
    
    await this.client.initialize();
  }

  async sendToGroup(message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    const chats = await this.client.getChats();
    const group = chats.find(chat => 
      chat.isGroup && chat.name === config.WHATSAPP_GROUP_NAME
    );

    if (!group) {
      throw new Error(`Group "${config.WHATSAPP_GROUP_NAME}" not found`);
    }

    const sentMessage = await this.client.sendMessage(group.id._serialized, message, { linkPreview: false });
    
    // Verify message was sent successfully
    if (!sentMessage || !sentMessage.id || !sentMessage.id._serialized) {
      throw new Error('Message send returned without valid message ID');
    }
    
    // Verify message exists by fetching it
    const messageId = sentMessage.id._serialized;
    const verifyMessage = await this.client.getMessageById(messageId);
    if (!verifyMessage) {
      logger.warn(`Message ${messageId} could not be verified after send`);
      throw new Error('Message could not be verified after send');
    }
    
    logger.info('Message sent to WhatsApp group');
    return sentMessage;
  }

  async sendToContact(countryCode, phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    // Format: countryCode (without +) + phoneNumber + @c.us
    // Example: 1234567890@c.us
    const cleanCountryCode = countryCode.replace('+', '');
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, ''); // Remove non-digits
    const chatId = `${cleanCountryCode}${cleanPhoneNumber}@c.us`;

    try {
      const sentMessage = await this.client.sendMessage(chatId, message, { linkPreview: false });
      
      // Verify message was sent successfully
      if (!sentMessage || !sentMessage.id || !sentMessage.id._serialized) {
        throw new Error('Message send returned without valid message ID');
      }
      
      // Verify message exists by fetching it
      const messageId = sentMessage.id._serialized;
      const verifyMessage = await this.client.getMessageById(messageId);
      if (!verifyMessage) {
        logger.warn(`Message ${messageId} could not be verified after send`);
        throw new Error('Message could not be verified after send');
      }
      
      logger.info(`Message sent to WhatsApp contact: ${chatId}`);
      return sentMessage;
    } catch (error) {
      logger.error(`Failed to send message to contact ${chatId}:`, error);
      throw new Error(`Failed to send message to contact +${cleanCountryCode} ${cleanPhoneNumber}: ${error.message}`);
    }
  }

  async sendNotification(message) {
    const notificationType = config.NOTIFICATION_TYPE || 'group';

    if (notificationType === 'contact') {
      const countryCode = config.CONTACT_COUNTRY_CODE;
      const phoneNumber = config.CONTACT_PHONE_NUMBER;

      if (!countryCode || !phoneNumber) {
        throw new Error('Contact notification type selected but country code or phone number not configured');
      }

      return await this.sendToContact(countryCode, phoneNumber, message);
    } else {
      // Default to group
      return await this.sendToGroup(message);
    }
  }

  async deleteMessage(messageId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    try {
      const message = await this.client.getMessageById(messageId);
      if (message) {
        // Log message state before deletion for debugging
        logger.debug(`Attempting to delete message ${messageId} (type: ${message.type}, fromMe: ${message.fromMe})`);
        
        await message.delete(true); // true = delete for everyone
        
        // Verify deletion was successful
        // Wait for the deletion to propagate through WhatsApp
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Try to fetch the message again to verify deletion
        const verifyMessage = await this.client.getMessageById(messageId);
        
        if (!verifyMessage) {
          // Message no longer exists - successfully deleted
          logger.info(`Deleted message ${messageId}`);
          return true;
        }
        
        // Check if message body indicates deletion
        // WhatsApp marks deleted messages with empty body or specific type
        const body = verifyMessage.body || '';
        const msgType = verifyMessage.type;
        
        // Messages deleted for everyone typically become type 'revoked' or have empty body
        if (msgType === 'revoked' || body === '') {
          logger.info(`Deleted message ${messageId} (verified as revoked)`);
          return true;
        }
        
        // Message still exists with content - deletion may have failed
        // Possible causes: rate limiting, network issues, cached data, or WhatsApp Web session state
        logger.warn(`Message ${messageId} deletion verification failed - message still exists (type: ${msgType}, bodyLength: ${body.length})`);
        return false;
      }
      logger.warn(`Message ${messageId} not found for deletion`);
      return false;
    } catch (error) {
      logger.warn(`Failed to delete message ${messageId}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Pin a message in the chat
   * @param {string} messageId - Message ID to pin
   * @param {number} durationSeconds - Duration in seconds (default: 86400 = 24 hours)
   * @returns {Promise<boolean>} True if pinned successfully
   */
  async pinMessage(messageId, durationSeconds = 86400) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp client not ready');
      }
      
      const message = await this.client.getMessageById(messageId);
      if (message) {
        const result = await message.pin(durationSeconds);
        logger.info(`Pinned message ${messageId} for ${durationSeconds} seconds`);
        return result;
      }
      logger.warn(`Message ${messageId} not found for pinning`);
      return false;
    } catch (error) {
      logger.error(`Failed to pin message ${messageId}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WhatsAppClient();
