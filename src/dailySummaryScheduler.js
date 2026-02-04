const logger = require('./logger');
const config = require('./config');
const statsTracker = require('./statsTracker');
const yadioClient = require('./yadioClient');
const { formatDailySummary } = require('./summaryMessageFormatter');

class DailySummaryScheduler {
  constructor(whatsappClient) {
    this.whatsappClient = whatsappClient;
    this.scheduledTimeout = null;
    this.nextRunTime = null;
  }
  
  /**
   * Calculate milliseconds until next scheduled time
   * @param {string} timeStr - Time in HH:MM format (e.g., "09:00")
   * @param {string} timezone - IANA timezone (e.g., "America/New_York", "UTC")
   * @returns {number} Milliseconds until next occurrence
   */
  calculateDelayUntilTime(timeStr, timezone) {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`Invalid time format: ${timeStr}`);
      }
      
      // Get current time in the target timezone
      const now = new Date();
      
      // Create a date string in the target timezone for today
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
      
      // Construct target datetime in the timezone
      const targetStr = `${todayStr}T${timeStr.padStart(5, '0')}:00`;
      const targetDate = new Date(targetStr + this.getTimezoneOffset(timezone));
      
      let delay = targetDate.getTime() - now.getTime();
      
      // If the time has already passed today, schedule for tomorrow
      if (delay < 0) {
        const tomorrowDate = new Date(targetDate);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        delay = tomorrowDate.getTime() - now.getTime();
      }
      
      return delay;
    } catch (error) {
      logger.error('Error calculating delay:', error.message);
      // Default to 24 hours if calculation fails
      return 24 * 60 * 60 * 1000;
    }
  }
  
  /**
   * Get timezone offset string for Date constructor
   * @param {string} timezone - IANA timezone
   * @returns {string} Offset string (e.g., "+00:00", "-05:00")
   */
  getTimezoneOffset(timezone) {
    try {
      const date = new Date();
      const tzString = date.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'longOffset' });
      const match = tzString.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, '0');
        const minutes = match[3] || '00';
        return `${sign}${hours}:${minutes}`;
      }
      
      return '+00:00'; // Default to UTC
    } catch (error) {
      logger.warn(`Failed to get timezone offset for ${timezone}, defaulting to UTC`);
      return '+00:00';
    }
  }
  
  /**
   * Send the daily summary
   */
  async sendDailySummary() {
    try {
      logger.info('Sending daily summary...');
      
      // Get 24h stats
      const stats = statsTracker.get24hStats();
      
      // Get BTC prices for all target currencies
      const targetCurrencies = config.TARGET_CURRENCIES.map(c => c.code);
      const includePriceMovement = config.DAILY_SUMMARY_SECTIONS?.priceMovement !== false;
      
      logger.debug(`Fetching prices for currencies: ${targetCurrencies.join(', ')} (movement: ${includePriceMovement})`);
      const priceDataArray = await yadioClient.getPriceDataMultiple(targetCurrencies, includePriceMovement);
      
      // Format message
      const message = formatDailySummary(stats, priceDataArray);
      
      // Send message
      const sentMessage = await this.whatsappClient.sendNotification(message);
      
      if (sentMessage && sentMessage.id) {
        // Try to pin the message for 24 hours
        try {
          const messageId = sentMessage.id._serialized;
          await this.whatsappClient.pinMessage(messageId, 86400); // 24 hours
          logger.info('Daily summary sent and pinned successfully');
        } catch (pinError) {
          logger.warn('Failed to pin daily summary message:', pinError.message);
          logger.info('Daily summary sent successfully (but not pinned)');
        }
      } else {
        logger.info('Daily summary sent successfully');
      }
    } catch (error) {
      logger.error('Failed to send daily summary:', error.message);
    }
  }
  
  /**
   * Schedule the next daily summary
   */
  scheduleNext() {
    // Clear existing timeout if any
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    
    // Check if daily summary is enabled
    if (!config.DAILY_SUMMARY_ENABLED) {
      logger.debug('Daily summary is disabled, not scheduling');
      this.nextRunTime = null;
      return;
    }
    
    const time = config.DAILY_SUMMARY_TIME || '09:00';
    const timezone = config.DAILY_SUMMARY_TIMEZONE || 'UTC';
    
    // Calculate delay until next run
    const delay = this.calculateDelayUntilTime(time, timezone);
    this.nextRunTime = Date.now() + delay;
    
    // Log next run time
    const nextRunDate = new Date(this.nextRunTime);
    const nextRunStr = nextRunDate.toLocaleString('en-US', { timeZone: timezone });
    logger.info(`Daily summary scheduled for ${nextRunStr} (${timezone})`);
    
    // Schedule the summary
    this.scheduledTimeout = setTimeout(async () => {
      await this.sendDailySummary();
      // Schedule next occurrence
      this.scheduleNext();
    }, delay);
  }
  
  /**
   * Get the next scheduled run time
   * @returns {number|null} Timestamp of next run, or null if not scheduled
   */
  getNextRunTime() {
    return this.nextRunTime;
  }
  
  /**
   * Stop the scheduler
   */
  stop() {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
      this.nextRunTime = null;
      logger.info('Daily summary scheduler stopped');
    }
  }
  
  /**
   * Start/restart the scheduler
   */
  start() {
    logger.info('Starting daily summary scheduler...');
    this.scheduleNext();
  }
}

module.exports = DailySummaryScheduler;
