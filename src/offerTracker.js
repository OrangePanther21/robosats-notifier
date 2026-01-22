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
      
      // Handle multiple format versions
      if (Array.isArray(parsed)) {
        // Migrate from old format (array): assign expiration timestamp (now + 24h fallback)
        logger.info('Migrating offer tracking format from array to expiration-based map');
        const expirationTime = Date.now() + this.defaultMaxAge;
        parsed.forEach(offerId => {
          this.seenOffers.set(offerId, {
            expiresAt: expirationTime,
            messageId: null,
            sentAt: null,
            coordinator: null
          });
        });
        await this.save(); // Save in new format
      } else {
        // Object format - check if old (just timestamp) or new (with messageId)
        Object.entries(parsed).forEach(([offerId, value]) => {
          if (typeof value === 'number') {
            // Old format: just expiration timestamp
            this.seenOffers.set(parseInt(offerId), {
              expiresAt: value,
              messageId: null,
              sentAt: null,
              coordinator: null
            });
          } else if (typeof value === 'object' && value !== null) {
            // New format: object with expiresAt, messageId, sentAt, coordinator
            this.seenOffers.set(parseInt(offerId), {
              expiresAt: value.expiresAt,
              messageId: value.messageId || null,
              sentAt: value.sentAt || null,
              coordinator: value.coordinator || null
            });
          }
        });
        
        // Save if we migrated from old format
        const needsMigration = Object.values(parsed).some(v => typeof v === 'number');
        if (needsMigration) {
          logger.info('Migrating offer tracking format to include message IDs');
          await this.save();
        }
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
    this.seenOffers.forEach((value, offerId) => {
      obj[offerId] = value;
    });
    const data = JSON.stringify(obj, null, 2);
    await fs.writeFile(this.dataFile, data, 'utf-8');
  }

  async cleanupExpiredOffers() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [offerId, value] of this.seenOffers.entries()) {
      if (value.expiresAt <= now) {
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

  markAsSeen(offer, messageId = null) {
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
    
    this.seenOffers.set(offer.id, {
      expiresAt: expiresAt,
      messageId: messageId,
      sentAt: Date.now(),
      coordinator: offer.coordinator || null
    });
  }

  getNewOffers(offers) {
    return offers.filter(offer => this.isNew(offer.id));
  }

  async addOffer(offer, messageId = null) {
    this.markAsSeen(offer, messageId);
    await this.save();
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

  getTrackedOfferIds() {
    return new Set(this.seenOffers.keys());
  }

  getMessageId(offerId) {
    const value = this.seenOffers.get(offerId);
    if (!value) return null;
    return value.messageId;
  }

  getOfferInfo(offerId) {
    const value = this.seenOffers.get(offerId);
    if (!value) return null;
    return {
      expiresAt: value.expiresAt,
      messageId: value.messageId,
      sentAt: value.sentAt,
      coordinator: value.coordinator
    };
  }

  isExpired(offerId) {
    const info = this.getOfferInfo(offerId);
    if (!info) return false;
    return info.expiresAt <= Date.now();
  }

  async removeOffer(offerId) {
    this.seenOffers.delete(offerId);
    await this.save();
  }
}

module.exports = new OfferTracker();
