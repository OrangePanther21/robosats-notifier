const whatsappClient = require('./whatsappClient');
const robosatsClient = require('./robosatsClient');
const offerTracker = require('./offerTracker');
const { formatOffer } = require('./messageFormatter');
const config = require('./config');
const logger = require('./logger');
const WebServer = require('./web/server');

// Store the interval timer and next check time
let checkInterval = null;
let nextCheckTime = null;
let isCheckInProgress = false; // Prevent overlapping checks
let shouldAbortCheck = false; // Signal to abort ongoing check

// Export function to get next check time for UI
function getNextCheckTime() {
  return nextCheckTime;
}

// Export function to check if a check is in progress
function isCheckRunning() {
  return isCheckInProgress;
}

async function checkForNewOffers() {
  // Prevent overlapping checks
  if (isCheckInProgress) {
    logger.warn('Previous check still in progress, skipping this cycle');
    return;
  }
  
  isCheckInProgress = true;
  shouldAbortCheck = false;
  
  try {
    await checkForNewOffersInternal();
  } finally {
    isCheckInProgress = false;
  }
}

async function checkForNewOffersInternal() {
  try {
    // Check for abort signal
    if (shouldAbortCheck) {
      logger.info('Check aborted by user');
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
    
    // Check for abort signal
    if (shouldAbortCheck) {
      logger.info('Check aborted by user');
      return;
    }
    
    const currencyCodes = config.TARGET_CURRENCIES.map(c => c.code).join(', ');
    logger.info(`Checking for new offers (${currencyCodes})...`);
    
    const allOffers = await robosatsClient.getOffers();
    
    // Check for abort signal after fetching (longest operation)
    if (shouldAbortCheck) {
      logger.info('Check aborted by user');
      return;
    }
    
    const newOffers = offerTracker.getNewOffers(allOffers);
    
    if (newOffers.length > 0) {
      logger.info(`Found ${newOffers.length} new offer(s)`);
      
      // Send one message per offer
      for (const offer of newOffers) {
        // Check for abort before each notification
        if (shouldAbortCheck) {
          logger.info('Check aborted by user - notifications cancelled');
          return;
        }
        
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
  
  // Set next check time to NOW + interval (first check happens after interval)
  nextCheckTime = Date.now() + config.CHECK_INTERVAL_MS;
  
  // Schedule periodic checks with current interval
  checkInterval = setInterval(async () => {
    // Set next check time BEFORE running check
    nextCheckTime = Date.now() + config.CHECK_INTERVAL_MS;
    await checkForNewOffers();
  }, config.CHECK_INTERVAL_MS);
  
  logger.info(`Check interval started - checking every ${config.CHECK_INTERVAL_MS / 60000} minutes`);
}

// Stop the check interval
function stopCheckInterval() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    nextCheckTime = null;
    
    // Signal any in-progress check to abort gracefully
    if (isCheckInProgress) {
      logger.info('Check interval stopped - aborting in-progress check...');
      shouldAbortCheck = true;
    } else {
      logger.info('Check interval stopped');
    }
  }
}

async function start() {
  try {
    logger.info('Starting RoboSats Notifier...');
    
    // Start web server first, pass the status functions
    const webServer = new WebServer(whatsappClient, getNextCheckTime, isCheckRunning);
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
    
    logger.info('All systems ready.');
    
    // Only start checking if bot is enabled
    if (config.BOT_ENABLED) {
      logger.info('Bot is enabled - starting periodic checks...');
      // Run first check immediately
      await checkForNewOffers();
      // Start the check interval
      startCheckInterval();
    } else {
      logger.info('Bot is paused - waiting for activation from UI...');
    }
    
    // Listen for config changes
    config.configEmitter.on('configChanged', async () => {
      logger.info('Configuration changed');
      
      // Check if BOT_ENABLED changed
      if (config.BOT_ENABLED && !checkInterval) {
        // Bot was enabled - start checking
        logger.info('Bot enabled - starting periodic checks...');
        await checkForNewOffers();
        startCheckInterval();
      } else if (!config.BOT_ENABLED && checkInterval) {
        // Bot was disabled - stop checking
        logger.info('Bot paused - stopping checks');
        stopCheckInterval();
      } else if (config.BOT_ENABLED && checkInterval) {
        // Bot still enabled, but interval changed - restart
        logger.info('Settings changed - restarting check interval...');
        await checkForNewOffers();
        startCheckInterval();
      }
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
