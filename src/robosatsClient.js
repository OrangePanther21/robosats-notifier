const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

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
    try {
      const apiBasePath = `/mainnet/${coordinator}/api`;
      const params = {};
      if (currency) params.currency = currency;
      if (type !== null) params.type = type;
      
      const axiosInstance = this.getAxiosInstance();
      const response = await axiosInstance.get(`${apiBasePath}/book/`, { params });
      
      // Ensure we always return an array
      if (!Array.isArray(response.data)) {
        const responseType = typeof response.data;
        const responsePreview = responseType === 'string' 
          ? response.data.substring(0, 100) 
          : JSON.stringify(response.data).substring(0, 100);
        logger.warn(`Coordinator ${coordinator} returned non-array response (${responseType}): ${responsePreview}${responsePreview.length >= 100 ? '...' : ''}`);
        return [];
      }
      
      return response.data;
    } catch (error) {
      // Log detailed error information
      if (error.response) {
        // HTTP error response - include response body for debugging
        const responseBody = typeof error.response.data === 'string' 
          ? error.response.data.substring(0, 200)
          : JSON.stringify(error.response.data).substring(0, 200);
        logger.error(`Error fetching order book from ${coordinator}: HTTP ${error.response.status} ${error.response.statusText}`);
        logger.error(`Response body: ${responseBody}`);
        logger.error(`Request URL: ${this.apiUrl}/mainnet/${coordinator}/api/book/`);
      } else if (error.request) {
        // Request made but no response received
        logger.error(`Error fetching order book from ${coordinator}: No response received (timeout or network error)`);
      } else {
        // Something else happened
        logger.error(`Error fetching order book from ${coordinator}: ${error.message}`);
      }
      return []; // Return empty array on error so other coordinators can still be checked
    }
  }

  async getOrderBook(currency = null, type = null) {
    // Check all coordinators and aggregate results
    const allOffers = [];
    const reachableCoordinators = new Set();
    
    for (const coordinator of this.coordinators) {
      try {
        const offers = await this.getOrderBookFromCoordinator(coordinator, currency, type);
        
        // Validate that offers is an array
        if (!Array.isArray(offers)) {
          logger.warn(`Skipping ${coordinator} coordinator: API returned non-array response (${typeof offers})`);
          continue;
        }
        
        // Mark this coordinator as successfully reached
        reachableCoordinators.add(coordinator);
        
        // Add coordinator info to each offer for tracking
        const offersWithCoordinator = offers.map(offer => ({
          ...offer,
          coordinator: coordinator
        }));
        allOffers.push(...offersWithCoordinator);
        logger.info(`Found ${offers.length} offers from ${coordinator} coordinator`);
      } catch (error) {
        // Error already logged in getOrderBookFromCoordinator, just warn here
        const errorMsg = error.response 
          ? `HTTP ${error.response.status}: ${error.response.statusText}`
          : error.message || 'Unknown error';
        logger.warn(`Skipping ${coordinator} coordinator: ${errorMsg}`);
      }
    }
    
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
    const reachableCount = reachableCoordinators.size;
    const totalCoordinators = this.coordinators.length;
    logger.info(`Found ${offers.length} offers (${currencyCodes}) from ${reachableCount}/${totalCoordinators} reachable coordinator(s) out of ${orderBook.length} total offers`);
    
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
