const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../logger');

class WebServer {
  constructor(whatsappClient) {
    this.app = express();
    this.whatsappClient = whatsappClient;
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
        
        // Clean up opposite notification type's fields based on notification type
        const notificationType = mergedConfig.NOTIFICATION_TYPE || 'group';
        if (notificationType === 'contact') {
          // Delete group name when switching to contact
          delete mergedConfig.WHATSAPP_GROUP_NAME;
        } else {
          // Delete contact fields when switching to group
          delete mergedConfig.CONTACT_COUNTRY_CODE;
          delete mergedConfig.CONTACT_PHONE_NUMBER;
        }
        
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
        res.json(status);
      } catch (error) {
        logger.error('Error getting status:', error);
        res.status(500).json({ error: 'Failed to get status' });
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

          await group.sendMessage(testMessage, { linkPreview: false });
          
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
