const axios = require('axios');
const config = require('./config');
const logger = require('./logger');
const statsTracker = require('./statsTracker');

// Check if we should use mock mode
if (config.ROBOSATS_USE_MOCK) {
  logger.warn('⚠️  MOCK MODE ENABLED - Using fake data for testing');
  logger.warn('⚠️  Set ROBOSATS_USE_MOCK=false in .env for production');
  module.exports = require('./robosatsClientMock');
} else {
  module.exports = new (class RobosatsClient {
  constructor() {
    // Log initial configuration
    this.logConfig();
  }
  
  // Get current API URL (reads from config each time for hot-reload support)
  get apiUrl() {
    return config.ROBOSATS_API_URL;
  }
  
  // Get current coordinators (reads from config each time for hot-reload support)
  get coordinators() {
    if (config.ROBOSATS_COORDINATORS === 'all') {
      return config.AVAILABLE_COORDINATORS;
    }
    return config.ROBOSATS_COORDINATORS.split(',').map(c => c.trim()).filter(c => c);
  }
  
  // Create axios instance with current config
  getAxiosInstance() {
    // Parse the API URL to get the port
    let port = '12596';
    try {
      const url = new URL(this.apiUrl);
      port = url.port || '12596';
    } catch (e) {
      // Keep default
    }
    
    // Always use umbrel.local as Host header - Django requires this
    // even when connecting via internal Docker hostnames
    const hostHeader = `umbrel.local:${port}`;
    
    return axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: { 
        'User-Agent': 'RobosatsBot/1.0',
        'Accept': 'application/json',
        'Host': hostHeader
      }
    });
  }
  
  logConfig() {
    const currencyCodes = config.TARGET_CURRENCIES.map(c => c.code).join(', ');
    logger.info(`RoboSats API URL: ${this.apiUrl}`);
    logger.info(`Monitoring ${this.coordinators.length} coordinator(s): ${this.coordinators.join(', ')}`);
    logger.info(`Target currencies: ${currencyCodes}`);
  }

  async getOrderBookFromCoordinator(coordinator, currency = null, type = null) {
    const apiBasePath = `/mainnet/${coordinator}/api`;
    const params = {};
    if (currency) params.currency = currency;
    if (type !== null) params.type = type;
    
    const axiosInstance = this.getAxiosInstance();
    const response = await axiosInstance.get(`${apiBasePath}/book/`, { params });
    
    // Ensure we always return an array
    if (!Array.isArray(response.data)) {
      // Log the actual response for debugging
      const dataPreview = typeof response.data === 'object' 
        ? JSON.stringify(response.data).substring(0, 200)
        : String(response.data).substring(0, 200);
      logger.warn(`${coordinator}: Invalid response format. Got: ${dataPreview}`);
      
      const error = new Error('Invalid response format');
      error.code = 'INVALID_RESPONSE';
      throw error;
    }
    
    return response.data;
  }

  async getOrderBook(currency = null, type = null) {
    const coordinators = this.coordinators;
    const startTime = Date.now();
    
    logger.info(`Fetching from ${coordinators.length} coordinator(s) in parallel...`);
    
    // Fetch from all coordinators in parallel
    const results = await Promise.allSettled(
      coordinators.map(async (coordinator) => {
        const coordStartTime = Date.now();
        try {
          const offers = await this.getOrderBookFromCoordinator(coordinator, currency, type);
          const duration = Date.now() - coordStartTime;
          return { coordinator, offers, duration, success: true };
        } catch (error) {
          const duration = Date.now() - coordStartTime;
          const errorMsg = error.response 
            ? `HTTP ${error.response.status}`
            : error.code || error.message || 'Unknown error';
          return { coordinator, error: errorMsg, duration, success: false };
        }
      })
    );
    
    // Process results and build summary
    const allOffers = [];
    const reachableCoordinators = new Set();
    const summary = [];
    
    for (const result of results) {
      // Promise.allSettled always fulfills, but check just in case
      if (result.status === 'rejected') {
        summary.push(`  unknown: ERROR - ${result.reason}`);
        continue;
      }
      
      const { coordinator, offers, duration, success, error } = result.value;
      
      // Record coordinator call in stats tracker
      statsTracker.recordCoordinatorCall(coordinator, success);
      
      if (!success) {
        summary.push(`  ${coordinator}: ERROR - ${error} (${duration}ms)`);
        continue;
      }
      
      // Validate that offers is an array
      if (!Array.isArray(offers)) {
        summary.push(`  ${coordinator}: ERROR - invalid response (${duration}ms)`);
        continue;
      }
      
      // Mark this coordinator as successfully reached
      reachableCoordinators.add(coordinator);
      
      // Record each offer in stats tracker with currency code and coordinator
      offers.forEach(offer => {
        const currency = config.TARGET_CURRENCIES.find(c => c.id === offer.currency);
        if (currency) {
          statsTracker.recordOffer(offer, currency.code, coordinator);
        }
      });
      
      // Add coordinator info to each offer
      const offersWithCoordinator = offers.map(offer => ({
        ...offer,
        coordinator: coordinator
      }));
      allOffers.push(...offersWithCoordinator);
      summary.push(`  ${coordinator}: ${offers.length} offers (${duration}ms)`);
    }
    
    // Log summary
    const totalDuration = Date.now() - startTime;
    summary.forEach(line => logger.info(line));
    logger.info(`Total: ${allOffers.length} offers from ${reachableCoordinators.size}/${coordinators.length} coordinator(s) in ${totalDuration}ms`);
    
    return { offers: allOffers, reachableCoordinators };
  }

  async getOffers() {
    const { offers: orderBook, reachableCoordinators } = await this.getOrderBook();
    
    // Get target currency IDs
    const targetCurrencyIds = config.TARGET_CURRENCIES.map(c => c.id);
    
    // Filter by target currency IDs
    // All orders in the book are public (status 1), so we filter by currency
    const offers = orderBook.filter(offer => {
      return targetCurrencyIds.includes(offer.currency);
    });

    // Add currency code to each offer for easier formatting
    offers.forEach(offer => {
      const currency = config.TARGET_CURRENCIES.find(c => c.id === offer.currency);
      if (currency) {
        offer.currencyCode = currency.code;
      }
    });

    const currencyCodes = config.TARGET_CURRENCIES.map(c => c.code).join(', ');
    logger.info(`Filtered to ${offers.length} offers matching target currencies (${currencyCodes})`);
    
    return { offers, reachableCoordinators };
  }

  async getInfo() {
    // Get info from first available coordinator
    const axiosInstance = this.getAxiosInstance();
    for (const coordinator of this.coordinators) {
      try {
        const apiBasePath = `/mainnet/${coordinator}/api`;
        const response = await axiosInstance.get(`${apiBasePath}/info/`);
        return response.data;
      } catch (error) {
        logger.warn(`Failed to get info from ${coordinator}, trying next...`);
        continue;
      }
    }
    throw new Error('Failed to get info from all coordinators');
  }
  })();
}
