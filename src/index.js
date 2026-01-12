const whatsappClient = require('./whatsappClient');
const robosatsClient = require('./robosatsClient');
const offerTracker = require('./offerTracker');
const { formatOffer } = require('./messageFormatter');
const config = require('./config');
const logger = require('./logger');
const WebServer = require('./web/server');

async function checkForNewOffers() {
  try {
    // Clean up expired offers
    await offerTracker.cleanupExpiredOffers();
    
    const currencyCodes = config.TARGET_CURRENCIES.map(c => c.code).join(', ');
    logger.info(`Checking for new offers (${currencyCodes})...`);
    
    const allOffers = await robosatsClient.getOffers();
    const newOffers = offerTracker.getNewOffers(allOffers);
    
    if (newOffers.length > 0) {
      logger.info(`Found ${newOffers.length} new offer(s)`);
      
      // Send one message per offer
      for (const offer of newOffers) {
        const message = formatOffer(offer);
        await whatsappClient.sendToGroup(message);
        // Small delay between messages to avoid rate limiting
        if (newOffers.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      await offerTracker.addOffers(newOffers);
      
      logger.info(`Successfully sent ${newOffers.length} offer notification(s) to group`);
    } else {
      logger.info('No new offers found');
    }
  } catch (error) {
    logger.error('Error in check cycle:', error.message);
  }
}

async function start() {
  try {
    logger.info('Starting Robosats WhatsApp Notifier...');
    
    // Start web server first
    const webServer = new WebServer(whatsappClient);
    await webServer.start();
    
    // Initialize components
    await offerTracker.initialize();
    await whatsappClient.initialize();
    
    // Wait for WhatsApp to be ready
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (whatsappClient.isReady) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
    
    logger.info('All systems ready. Starting periodic checks...');
    
    // Run first check immediately
    await checkForNewOffers();
    
    // Schedule periodic checks
    setInterval(checkForNewOffers, config.CHECK_INTERVAL_MS);
    
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

start();
