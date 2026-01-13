const whatsappClient = require('./whatsappClient');
const robosatsClient = require('./robosatsClient');
const offerTracker = require('./offerTracker');
const { formatOffer } = require('./messageFormatter');
const config = require('./config');
const logger = require('./logger');
const WebServer = require('./web/server');

// Store the interval timer so we can restart it on config change
let checkInterval = null;

async function checkForNewOffers() {
  try {
    // Check if bot is enabled
    if (!config.BOT_ENABLED) {
      logger.info('Bot is disabled, skipping check');
      return;
    }
    
    // Validate notification configuration
    try {
      config.validateNotificationConfig();
    } catch (error) {
      logger.error('Notification configuration error:', error.message);
      return;
    }
    
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
        await whatsappClient.sendNotification(message);
        // Small delay between messages to avoid rate limiting
        if (newOffers.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      await offerTracker.addOffers(newOffers);
      
      logger.info(`Successfully sent ${newOffers.length} offer notification(s)`);
    } else {
      logger.info('No new offers found');
    }
  } catch (error) {
    logger.error('Error in check cycle:', error.message);
  }
}

// Start or restart the check interval
function startCheckInterval() {
  // Clear existing interval if any
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  // Schedule periodic checks with current interval
  checkInterval = setInterval(checkForNewOffers, config.CHECK_INTERVAL_MS);
  logger.info(`Check interval set to ${config.CHECK_INTERVAL_MS / 60000} minutes`);
}

async function start() {
  try {
    logger.info('Starting RoboSats Notifier...');
    
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
    
    // Start the check interval
    startCheckInterval();
    
    // Listen for config changes and restart interval
    config.configEmitter.on('configChanged', () => {
      logger.info('Configuration changed, restarting check interval...');
      startCheckInterval();
    });
    
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
