const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class StatsTracker {
  constructor() {
    this.dataPath = path.join(__dirname, '../data/stats.json');
    this.stats = {
      coordinatorStats: {},
      hourlyBuckets: []
    };
    
    // Initialize 24 hourly buckets
    for (let i = 0; i < 24; i++) {
      this.stats.hourlyBuckets.push({
        timestamp: Date.now() - ((23 - i) * 60 * 60 * 1000),
        coordinatorStats: {},
        offerStats: {
          byCurrency: {}  // Per-currency stats
        },
        seenOfferIds: new Set()  // Track seen offer IDs for deduplication
      });
    }
    
    this.persistInterval = null;
  }
  
  async initialize() {
    try {
      // Load existing stats from file if available
      await this.load();
      
      // Start periodic persistence (every 5 minutes)
      this.persistInterval = setInterval(() => {
        this.persist().catch(err => {
          logger.error('Failed to persist stats:', err.message);
        });
      }, 5 * 60 * 1000);
      
      logger.info('Stats tracker initialized');
    } catch (error) {
      logger.warn('Failed to load stats from file, starting fresh:', error.message);
    }
  }
  
  /**
   * Get the current hour bucket index (0-23)
   */
  getCurrentBucketIndex() {
    const now = new Date();
    return now.getHours();
  }
  
  /**
   * Rotate buckets - remove oldest, add new current bucket
   */
  rotateBuckets() {
    const currentHour = this.getCurrentBucketIndex();
    const lastBucket = this.stats.hourlyBuckets[this.stats.hourlyBuckets.length - 1];
    
    // Check if we need to rotate (more than 1 hour since last bucket)
    const hoursSinceLastBucket = Math.floor((Date.now() - lastBucket.timestamp) / (60 * 60 * 1000));
    
    if (hoursSinceLastBucket >= 1) {
      // Remove oldest bucket(s)
      this.stats.hourlyBuckets.shift();
      
      // Add new bucket
      this.stats.hourlyBuckets.push({
        timestamp: Date.now(),
        coordinatorStats: {},
        offerStats: {
          byCurrency: {}
        },
        seenOfferIds: new Set()
      });
    }
  }
  
  /**
   * Record a coordinator API call result
   * @param {string} coordinator - Coordinator ID
   * @param {boolean} success - Whether the call succeeded
   */
  recordCoordinatorCall(coordinator, success) {
    this.rotateBuckets();
    
    const currentBucket = this.stats.hourlyBuckets[this.stats.hourlyBuckets.length - 1];
    
    if (!currentBucket.coordinatorStats[coordinator]) {
      currentBucket.coordinatorStats[coordinator] = { attempts: 0, successes: 0 };
    }
    
    currentBucket.coordinatorStats[coordinator].attempts++;
    if (success) {
      currentBucket.coordinatorStats[coordinator].successes++;
    }
  }
  
  /**
   * Record an offer seen
   * @param {object} offer - Offer object from RoboSats API
   * @param {string} currencyCode - Currency code (e.g., 'USD', 'PYG')
   */
  recordOffer(offer, currencyCode) {
    const currentBucket = this.stats.hourlyBuckets[this.stats.hourlyBuckets.length - 1];
    
    // Deduplication: Skip if offer ID already seen in this bucket
    if (!offer.id || currentBucket.seenOfferIds.has(offer.id)) {
      return;
    }
    currentBucket.seenOfferIds.add(offer.id);
    
    // Initialize currency stats if not exists
    if (!currentBucket.offerStats.byCurrency[currencyCode]) {
      currentBucket.offerStats.byCurrency[currencyCode] = {
        buyCount: 0,
        sellCount: 0,
        totalVolumeSats: 0,
        premiums: { buy: [], sell: [] }
      };
    }
    
    const currencyStats = currentBucket.offerStats.byCurrency[currencyCode];
    
    // Count by type (0 = BUY, 1 = SELL)
    if (offer.type === 0) {
      currencyStats.buyCount++;
    } else {
      currencyStats.sellCount++;
    }
    
    // Calculate volume in sats
    let sats = 0;
    if (offer.has_range && offer.max_amount && offer.price) {
      // For range offers, use max_amount
      const price = offer.price_now !== undefined && offer.price_now !== null ? offer.price_now : offer.price;
      sats = Math.round((parseFloat(offer.max_amount) / price) * 100000000);
    } else if (offer.satoshis_now !== undefined && offer.satoshis_now !== null) {
      sats = offer.satoshis_now;
    } else if (offer.satoshis !== undefined && offer.satoshis !== null) {
      sats = offer.satoshis;
    }
    
    currencyStats.totalVolumeSats += sats;
    
    // Record premium if available
    if (offer.premium !== undefined && offer.premium !== null) {
      const premium = parseFloat(offer.premium);
      if (offer.type === 0) {
        currencyStats.premiums.buy.push(premium);
      } else {
        currencyStats.premiums.sell.push(premium);
      }
    }
  }
  
  /**
   * Get aggregated stats for the last 24 hours
   * @returns {object} Aggregated statistics
   */
  get24hStats() {
    const stats = {
      coordinators: {},
      offersByCurrency: {}
    };
    
    // Aggregate across all buckets
    for (const bucket of this.stats.hourlyBuckets) {
      // Aggregate coordinator stats
      for (const [coordinator, coordStats] of Object.entries(bucket.coordinatorStats)) {
        if (!stats.coordinators[coordinator]) {
          stats.coordinators[coordinator] = {
            attempts: 0,
            successes: 0,
            offerCount: 0,
            volumeSats: 0
          };
        }
        stats.coordinators[coordinator].attempts += coordStats.attempts;
        stats.coordinators[coordinator].successes += coordStats.successes;
      }
      
      // Aggregate offer stats per currency
      if (bucket.offerStats && bucket.offerStats.byCurrency) {
        for (const [currency, currencyStats] of Object.entries(bucket.offerStats.byCurrency)) {
          if (!stats.offersByCurrency[currency]) {
            stats.offersByCurrency[currency] = {
              buyCount: 0,
              sellCount: 0,
              totalVolumeSats: 0,
              premiums: {
                buy: [],
                sell: []
              }
            };
          }
          
          stats.offersByCurrency[currency].buyCount += currencyStats.buyCount;
          stats.offersByCurrency[currency].sellCount += currencyStats.sellCount;
          stats.offersByCurrency[currency].totalVolumeSats += currencyStats.totalVolumeSats;
          
          // Collect premiums
          if (currencyStats.premiums) {
            stats.offersByCurrency[currency].premiums.buy.push(...currencyStats.premiums.buy);
            stats.offersByCurrency[currency].premiums.sell.push(...currencyStats.premiums.sell);
          }
        }
      }
    }
    
    // Calculate premium statistics for each currency
    for (const [currency, currencyStats] of Object.entries(stats.offersByCurrency)) {
      const buyPremiums = currencyStats.premiums.buy;
      const sellPremiums = currencyStats.premiums.sell;
      
      currencyStats.premiums = {
        buy: { min: null, max: null, avg: null },
        sell: { min: null, max: null, avg: null }
      };
      
      if (buyPremiums.length > 0) {
        currencyStats.premiums.buy.min = Math.min(...buyPremiums);
        currencyStats.premiums.buy.max = Math.max(...buyPremiums);
        currencyStats.premiums.buy.avg = buyPremiums.reduce((a, b) => a + b, 0) / buyPremiums.length;
      }
      
      if (sellPremiums.length > 0) {
        currencyStats.premiums.sell.min = Math.min(...sellPremiums);
        currencyStats.premiums.sell.max = Math.max(...sellPremiums);
        currencyStats.premiums.sell.avg = sellPremiums.reduce((a, b) => a + b, 0) / sellPremiums.length;
      }
    }
    
    // Sort coordinators by health (success rate) and volume
    const coordinatorArray = Object.entries(stats.coordinators).map(([id, data]) => {
      const healthPercent = data.attempts > 0 ? (data.successes / data.attempts) * 100 : 0;
      return {
        id,
        healthPercent,
        ...data
      };
    }).sort((a, b) => {
      // Primary sort: health %
      if (Math.abs(a.healthPercent - b.healthPercent) > 1) {
        return b.healthPercent - a.healthPercent;
      }
      // Secondary sort: volume
      return b.volumeSats - a.volumeSats;
    });
    
    stats.coordinatorsSorted = coordinatorArray;
    
    return stats;
  }
  
  /**
   * Get health percentage for a specific coordinator
   * @param {string} coordinator - Coordinator ID
   * @returns {number|null} Health percentage (0-100) or null if no data
   */
  getCoordinatorHealth(coordinator) {
    let totalAttempts = 0;
    let totalSuccesses = 0;
    
    for (const bucket of this.stats.hourlyBuckets) {
      if (bucket.coordinatorStats[coordinator]) {
        totalAttempts += bucket.coordinatorStats[coordinator].attempts;
        totalSuccesses += bucket.coordinatorStats[coordinator].successes;
      }
    }
    
    if (totalAttempts === 0) {
      return null; // No data available
    }
    
    return Math.round((totalSuccesses / totalAttempts) * 100);
  }
  
  /**
   * Persist stats to file
   */
  async persist() {
    try {
      const dataDir = path.dirname(this.dataPath);
      
      // Create data directory if it doesn't exist
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Convert Sets to arrays for JSON serialization
      const statsToSave = JSON.parse(JSON.stringify(this.stats, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      }));
      
      // Write stats to file
      fs.writeFileSync(this.dataPath, JSON.stringify(statsToSave, null, 2), 'utf8');
      logger.debug('Stats persisted to file');
    } catch (error) {
      logger.error('Failed to persist stats:', error.message);
      throw error;
    }
  }
  
  /**
   * Load stats from file
   */
  async load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf8');
        const loadedStats = JSON.parse(data);
        
        // Migrate old format to new format if needed
        if (loadedStats.hourlyBuckets) {
          for (const bucket of loadedStats.hourlyBuckets) {
            // Convert seenOfferIds array to Set
            if (Array.isArray(bucket.seenOfferIds)) {
              bucket.seenOfferIds = new Set(bucket.seenOfferIds);
            } else if (!bucket.seenOfferIds) {
              bucket.seenOfferIds = new Set();
            }
            
            // Migrate old offerStats structure to new byCurrency structure
            if (bucket.offerStats && !bucket.offerStats.byCurrency) {
              bucket.offerStats = { byCurrency: {} };
            }
          }
        }
        
        this.stats = loadedStats;
        logger.info('Stats loaded from file');
        
        // Clean old buckets (older than 24 hours)
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
        this.stats.hourlyBuckets = this.stats.hourlyBuckets.filter(bucket => bucket.timestamp > cutoffTime);
        
        // Ensure we have at least one bucket
        if (this.stats.hourlyBuckets.length === 0) {
          this.stats.hourlyBuckets.push({
            timestamp: Date.now(),
            coordinatorStats: {},
            offerStats: {
              byCurrency: {}
            },
            seenOfferIds: new Set()
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to load stats from file:', error.message);
      throw error;
    }
  }
  
  /**
   * Shutdown - persist final stats and clear interval
   */
  async shutdown() {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
    }
    await this.persist();
    logger.info('Stats tracker shutdown');
  }
}

// Export singleton instance
module.exports = new StatsTracker();
