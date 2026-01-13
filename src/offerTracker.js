const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class OfferTracker {
  constructor() {
    this.dataFile = path.join(config.DATA_DIR, 'seen_offers.json');
    this.seenOffers = new Map(); // Map of offerId -> expiration timestamp
    this.defaultMaxAge = 24 * 60 * 60 * 1000; // 24 hours fallback
  }

  async initialize() {
    try {
      await fs.mkdir(config.DATA_DIR, { recursive: true });
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Handle both old format (array) and new format (object)
      if (Array.isArray(parsed)) {
        // Migrate from old format: assign expiration timestamp (now + 24h fallback)
        logger.info('Migrating offer tracking format from array to expiration-based map');
        const expirationTime = Date.now() + this.defaultMaxAge;
        parsed.forEach(offerId => this.seenOffers.set(offerId, expirationTime));
        await this.save(); // Save in new format
      } else {
        // New format: object with expiration timestamps
        Object.entries(parsed).forEach(([offerId, expiresAt]) => {
          this.seenOffers.set(parseInt(offerId), expiresAt);
        });
      }
      
      logger.info(`Loaded ${this.seenOffers.size} previously seen offers`);
      
      // Clean up expired offers on startup
      await this.cleanupExpiredOffers();
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No previous offer data found, starting fresh');
        this.seenOffers = new Map();
      } else {
        throw error;
      }
    }
  }

  async save() {
    // Convert Map to plain object for JSON serialization
    const obj = {};
    this.seenOffers.forEach((expiresAt, offerId) => {
      obj[offerId] = expiresAt;
    });
    const data = JSON.stringify(obj, null, 2);
    await fs.writeFile(this.dataFile, data, 'utf-8');
  }

  async cleanupExpiredOffers() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [offerId, expiresAt] of this.seenOffers.entries()) {
      if (expiresAt <= now) {
        this.seenOffers.delete(offerId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.info(`Cleaned up ${removedCount} expired offer(s)`);
      await this.save();
    }
  }

  isNew(offerId) {
    return !this.seenOffers.has(offerId);
  }

  markAsSeen(offer) {
    // Store the offer's expiration time, or use a default if not available
    let expiresAt;
    if (offer.expires_at) {
      try {
        expiresAt = new Date(offer.expires_at).getTime();
      } catch (e) {
        // If date parsing fails, use default
        expiresAt = Date.now() + this.defaultMaxAge;
      }
    } else {
      // If no expires_at field, use default (24 hours from now)
      expiresAt = Date.now() + this.defaultMaxAge;
    }
    
    this.seenOffers.set(offer.id, expiresAt);
  }

  getNewOffers(offers) {
    return offers.filter(offer => this.isNew(offer.id));
  }

  async addOffers(offers) {
    offers.forEach(offer => this.markAsSeen(offer));
    await this.save();
  }
  
  async clearAll() {
    logger.info('Clearing all tracked offers');
    this.seenOffers.clear();
    await this.save();
    logger.info('Offer history cleared successfully');
  }
}

module.exports = new OfferTracker();
