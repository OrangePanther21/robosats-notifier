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

    // Save configuration and restart bot
    this.app.post('/api/settings', (req, res) => {
      try {
        const newSettings = req.body;
        config.saveConfig(newSettings);
        
        res.json({ 
          success: true, 
          message: 'Settings saved. Please restart the application for changes to take effect.' 
        });
        
        logger.info('Settings updated via web UI');
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

    // Get available currencies
    this.app.get('/api/currencies', (req, res) => {
      res.json(Object.keys(config.CURRENCY_MAP));
    });

    // Get available coordinators
    this.app.get('/api/coordinators', (req, res) => {
      res.json(config.AVAILABLE_COORDINATORS);
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
