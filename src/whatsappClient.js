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
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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

    await group.sendMessage(message, { linkPreview: false });
    logger.info('Message sent to WhatsApp group');
  }
}

module.exports = new WhatsAppClient();
