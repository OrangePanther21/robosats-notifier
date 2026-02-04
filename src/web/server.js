const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const offerTracker = require('../offerTracker');
const statsTracker = require('../statsTracker');
const yadioClient = require('../yadioClient');
const { formatDailySummary } = require('../summaryMessageFormatter');

class WebServer {
  constructor(whatsappClient, getNextCheckTimeFn, isCheckRunningFn) {
    this.app = express();
    this.whatsappClient = whatsappClient;
    this.getNextCheckTime = getNextCheckTimeFn;
    this.isCheckRunning = isCheckRunningFn;
    this.clients = []; // SSE clients for QR code updates
    this.port = process.env.WEB_PORT || 3000;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSSE();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // Serve main page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Get current configuration
    this.app.get('/api/settings', (req, res) => {
      try {
        const settings = config.getConfig();
        res.json(settings);
      } catch (error) {
        logger.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
      }
    });

    // Save configuration and reload
    this.app.post('/api/settings', (req, res) => {
      try {
        const newSettings = req.body;
        
        // Get existing config to merge with
        const existingConfig = config.getConfig();
        
        // Merge new settings with existing config
        const mergedConfig = { ...existingConfig, ...newSettings };
        
        // Keep all notification fields - let NOTIFICATION_TYPE determine which is used
        // This preserves user settings when switching between group/contact modes
        
        config.saveConfig(mergedConfig);
        
        // Reload configuration immediately
        config.reloadConfig();
        
        res.json({ 
          success: true, 
          message: 'Settings saved and applied successfully!' 
        });
        
        logger.info('Settings updated and reloaded via web UI');
      } catch (error) {
        logger.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
      }
    });

    // Get bot status
    this.app.get('/api/status', (req, res) => {
      try {
        const status = this.whatsappClient.getStatus();
        // Add next check time info
        if (this.getNextCheckTime) {
          const nextCheckTime = this.getNextCheckTime();
          if (nextCheckTime) {
            status.nextCheckTime = nextCheckTime;
            status.checkIntervalMinutes = config.CHECK_INTERVAL_MS / 60000;
          }
        }
        // Add check-in-progress status
        if (this.isCheckRunning) {
          status.isCheckInProgress = this.isCheckRunning();
        }
        res.json(status);
      } catch (error) {
        logger.error('Error getting status:', error);
        res.status(500).json({ error: 'Failed to get status' });
      }
    });

    // Delete offer history
    this.app.post('/api/delete-history', async (req, res) => {
      try {
        await offerTracker.clearAll();
        res.json({ 
          success: true,
          message: 'Offer history deleted successfully!' 
        });
      } catch (error) {
        logger.error('Error deleting offer history:', error);
        res.status(500).json({ error: 'Failed to delete offer history' });
      }
    });

    // Send test daily summary
    this.app.post('/api/test-summary', async (req, res) => {
      try {
        if (!this.whatsappClient.isReady) {
          return res.status(503).json({ 
            error: 'WhatsApp is not connected yet. Please wait for authentication.' 
          });
        }

        logger.info('Sending test daily summary...');
        
        // Get 24h stats
        const stats = statsTracker.get24hStats();
        
        // Get BTC price
        const currency = config.DAILY_SUMMARY_CURRENCY || 'USD';
        let priceData = null;
        try {
          priceData = await yadioClient.getPriceData(currency);
        } catch (priceError) {
          logger.warn('Failed to fetch BTC price for test summary:', priceError.message);
        }
        
        // Format message
        const message = formatDailySummary(stats, priceData);
        
        // Send message
        const sentMessage = await this.whatsappClient.sendNotification(message);
        
        if (sentMessage && sentMessage.id) {
          // Try to pin the message for 24 hours
          try {
            const messageId = sentMessage.id._serialized;
            await this.whatsappClient.pinMessage(messageId, 86400); // 24 hours
            logger.info('Test daily summary sent and pinned successfully');
            res.json({ 
              success: true, 
              message: 'Test summary sent and pinned successfully!' 
            });
          } catch (pinError) {
            logger.warn('Failed to pin test summary message:', pinError.message);
            res.json({ 
              success: true, 
              message: 'Test summary sent successfully (pinning not available)' 
            });
          }
        } else {
          res.json({ 
            success: true, 
            message: 'Test summary sent successfully!' 
          });
        }
        
        logger.info('Test daily summary sent via web UI');
      } catch (error) {
        logger.error('Error sending test summary:', error);
        res.status(500).json({ 
          error: 'Failed to send test summary: ' + error.message 
        });
      }
    });

    // Server-Sent Events endpoint for QR code updates
    this.app.get('/api/qr-events', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send current QR code if available
      const status = this.whatsappClient.getStatus();
      if (status.qrData) {
        res.write(`data: ${JSON.stringify({ qrData: status.qrData })}\n\n`);
      }

      // Add client to list
      this.clients.push(res);

      // Remove client on disconnect
      req.on('close', () => {
        this.clients = this.clients.filter(client => client !== res);
      });
    });

    // Get available currencies (sorted alphabetically)
    this.app.get('/api/currencies', (req, res) => {
      const currencies = Object.keys(config.CURRENCY_MAP).sort();
      res.json(currencies);
    });

    // Get available coordinators with display names (sorted alphabetically by name)
    this.app.get('/api/coordinators', (req, res) => {
      const coordinatorsWithNames = config.AVAILABLE_COORDINATORS.map(id => ({
        id: id,
        name: config.COORDINATOR_MAP[id] || id
      }));
      // Sort by name alphabetically
      coordinatorsWithNames.sort((a, b) => a.name.localeCompare(b.name));
      res.json(coordinatorsWithNames);
    });

    // Get available country codes
    this.app.get('/api/countries', (req, res) => {
      res.json(config.COUNTRY_CODES);
    });

    // Get available timezones
    this.app.get('/api/timezones', (req, res) => {
      // Common timezones list
      const timezones = [
        { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
        { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
        { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
        { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
        { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
        { value: 'America/Anchorage', label: 'Alaska Time' },
        { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
        { value: 'America/Phoenix', label: 'Arizona Time' },
        { value: 'America/Toronto', label: 'Eastern Time (Canada)' },
        { value: 'America/Vancouver', label: 'Pacific Time (Canada)' },
        { value: 'America/Mexico_City', label: 'Mexico City Time' },
        { value: 'America/Sao_Paulo', label: 'Brasilia Time' },
        { value: 'America/Buenos_Aires', label: 'Argentina Time' },
        { value: 'America/Santiago', label: 'Chile Time' },
        { value: 'America/Lima', label: 'Peru Time' },
        { value: 'America/Bogota', label: 'Colombia Time' },
        { value: 'Europe/London', label: 'London Time (GMT)' },
        { value: 'Europe/Paris', label: 'Central European Time' },
        { value: 'Europe/Berlin', label: 'Central European Time (Germany)' },
        { value: 'Europe/Madrid', label: 'Central European Time (Spain)' },
        { value: 'Europe/Rome', label: 'Central European Time (Italy)' },
        { value: 'Europe/Amsterdam', label: 'Central European Time (Netherlands)' },
        { value: 'Europe/Brussels', label: 'Central European Time (Belgium)' },
        { value: 'Europe/Vienna', label: 'Central European Time (Austria)' },
        { value: 'Europe/Warsaw', label: 'Central European Time (Poland)' },
        { value: 'Europe/Prague', label: 'Central European Time (Czech Republic)' },
        { value: 'Europe/Athens', label: 'Eastern European Time (Greece)' },
        { value: 'Europe/Helsinki', label: 'Eastern European Time (Finland)' },
        { value: 'Europe/Moscow', label: 'Moscow Time' },
        { value: 'Europe/Istanbul', label: 'Turkey Time' },
        { value: 'Asia/Dubai', label: 'Gulf Standard Time' },
        { value: 'Asia/Kolkata', label: 'India Standard Time' },
        { value: 'Asia/Shanghai', label: 'China Standard Time' },
        { value: 'Asia/Hong_Kong', label: 'Hong Kong Time' },
        { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
        { value: 'Asia/Seoul', label: 'Korea Standard Time' },
        { value: 'Asia/Singapore', label: 'Singapore Time' },
        { value: 'Asia/Bangkok', label: 'Indochina Time' },
        { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
        { value: 'Australia/Melbourne', label: 'Australian Eastern Time (Victoria)' },
        { value: 'Australia/Brisbane', label: 'Australian Eastern Standard Time' },
        { value: 'Australia/Perth', label: 'Australian Western Time' },
        { value: 'Pacific/Auckland', label: 'New Zealand Time' },
        { value: 'Africa/Johannesburg', label: 'South Africa Time' },
        { value: 'Africa/Cairo', label: 'Egypt Time' },
        { value: 'Africa/Lagos', label: 'West Africa Time' }
      ];
      res.json(timezones);
    });

    // Send test message to WhatsApp group or contact
    this.app.post('/api/test-message', async (req, res) => {
      try {
        if (!this.whatsappClient.isReady) {
          return res.status(503).json({ 
            error: 'WhatsApp is not connected yet. Please wait for authentication.' 
          });
        }

        const notificationType = req.body.notificationType || 'group';
        const testMessage = '🤖 *Test Message from RoboSats Notifier*\n\nIf you can see this message, the bot is working correctly!';

        if (notificationType === 'contact') {
          // Test contact message
          const countryCode = req.body.countryCode;
          const phoneNumber = req.body.phoneNumber;

          if (!countryCode || !phoneNumber) {
            return res.status(400).json({
              error: 'Please enter country code and phone number'
            });
          }

          // Validate phone number format (digits only, 6-15 characters)
          const cleanPhone = phoneNumber.replace(/\D/g, '');
          if (cleanPhone.length < 6 || cleanPhone.length > 15) {
            return res.status(400).json({
              error: 'Phone number must be 6-15 digits'
            });
          }

          await this.whatsappClient.sendToContact(countryCode, phoneNumber, testMessage);
          
          res.json({ 
            success: true, 
            message: `Test message sent successfully to ${countryCode} ${phoneNumber}!` 
          });
          
          logger.info(`Test message sent to contact ${countryCode} ${phoneNumber} via web UI`);
        } else {
          // Test group message
          const groupName = req.body.groupName || config.WHATSAPP_GROUP_NAME;
          
          if (!groupName) {
            return res.status(400).json({
              error: 'Please enter a group name'
            });
          }

          const chats = await this.whatsappClient.client.getChats();
          const group = chats.find(chat => 
            chat.isGroup && chat.name === groupName
          );

          if (!group) {
            return res.status(404).json({ 
              error: `Group "${groupName}" not found. Please check the group name is correct.` 
            });
          }

          await this.whatsappClient.client.sendMessage(group.id._serialized, testMessage, { linkPreview: false });
          
          res.json({ 
            success: true, 
            message: `Test message sent successfully to "${groupName}"!` 
          });
          
          logger.info(`Test message sent to group "${groupName}" via web UI`);
        }
      } catch (error) {
        logger.error('Error sending test message:', error);
        res.status(500).json({ 
          error: 'Failed to send test message: ' + error.message 
        });
      }
    });
  }

  setupSSE() {
    // Listen for QR code events from WhatsApp client
    this.whatsappClient.on('qr', (qrData) => {
      const message = JSON.stringify({ qrData });
      this.clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
      });
    });

    // Listen for authentication events
    this.whatsappClient.on('authenticated', () => {
      const message = JSON.stringify({ authenticated: true });
      this.clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
      });
    });

    // Listen for ready events
    this.whatsappClient.on('ready', () => {
      const message = JSON.stringify({ ready: true });
      this.clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
      });
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Web UI running on port ${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Web server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = WebServer;
