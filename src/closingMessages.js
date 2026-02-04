const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

class ClosingMessages {
  constructor() {
    this.messagesPath = path.join(__dirname, '../data/closing-messages.json');
    this.fileMessages = [];
  }
  
  /**
   * Load messages from JSON file (fallback)
   */
  loadMessagesFromFile() {
    try {
      if (fs.existsSync(this.messagesPath)) {
        const data = fs.readFileSync(this.messagesPath, 'utf8');
        const parsed = JSON.parse(data);
        
        if (parsed.messages && Array.isArray(parsed.messages)) {
          this.fileMessages = parsed.messages;
          logger.debug(`Loaded ${this.fileMessages.length} closing messages from file`);
        } else {
          logger.warn('Invalid format in closing-messages.json, expected { messages: [] }');
          this.fileMessages = [];
        }
      } else {
        logger.debug('No closing messages file found');
        this.fileMessages = [];
      }
    } catch (error) {
      logger.error('Failed to load closing messages from file:', error.message);
      this.fileMessages = [];
    }
  }
  
  /**
   * Get the messages array - first from config, fallback to file
   * @returns {string[]} Array of messages
   */
  getMessages() {
    // First check config (user-provided via UI)
    if (config.DAILY_SUMMARY_RANDOM_MESSAGES && config.DAILY_SUMMARY_RANDOM_MESSAGES.length > 0) {
      return config.DAILY_SUMMARY_RANDOM_MESSAGES;
    }
    
    // Fallback to file-based messages
    if (this.fileMessages.length === 0) {
      this.loadMessagesFromFile();
    }
    
    return this.fileMessages;
  }
  
  /**
   * Get a random message from the available messages
   * @returns {string} Random message, or empty string if no messages available
   */
  getRandomMessage() {
    const messages = this.getMessages();
    
    if (messages.length === 0) {
      logger.warn('No closing messages available for random selection');
      return '';
    }
    
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }
  
  /**
   * Get the closing message based on config mode
   * @returns {string} Closing message or empty string
   */
  getClosingMessage() {
    const mode = config.DAILY_SUMMARY_CLOSING_MODE || 'none';
    
    switch (mode) {
      case 'custom':
        return config.DAILY_SUMMARY_CLOSING_MESSAGE || '';
      
      case 'random':
        return this.getRandomMessage();
      
      case 'none':
      default:
        return '';
    }
  }
}

// Export singleton instance
module.exports = new ClosingMessages();
