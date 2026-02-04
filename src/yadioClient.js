const axios = require('axios');
const logger = require('./logger');

class YadioClient {
  constructor() {
    this.baseUrl = 'https://api.yadio.io';
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'RobosatsBot/1.0',
        'Accept': 'application/json'
      }
    });
  }
  
  /**
   * Get current BTC price for a given currency
   * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
   * @returns {Promise<number|null>} BTC price in the given currency, or null if failed
   */
  async getBtcPrice(currency) {
    try {
      const response = await this.axiosInstance.get(`/exrates/${currency}`);
      
      // Yadio API returns BTC price directly as a number in response.data.BTC
      if (response.data && typeof response.data.BTC === 'number') {
        const price = response.data.BTC;
        logger.debug(`Fetched BTC price: ${price} ${currency}`);
        return price;
      }
      
      logger.warn(`Invalid response format from Yadio for ${currency}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch BTC price from Yadio:`, error.message);
      return null;
    }
  }
  
  /**
   * Get 24h price data from Yadio
   * @param {string} currency - Currency code
   * @returns {Promise<object|null>} Object with hourly data, or null if failed
   */
  async get24hData(currency) {
    try {
      const response = await this.axiosInstance.get(`/today/24/${currency}`);
      
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      }
      
      logger.warn(`Invalid 24h data format from Yadio for ${currency}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch 24h data from Yadio for ${currency}:`, error.message);
      return null;
    }
  }
  
  /**
   * Get historical comparison data from Yadio
   * @param {string} currency - Currency code
   * @param {number} days - Number of days to look back (1-365)
   * @returns {Promise<object|null>} Array of daily data, or null if failed
   */
  async getHistoricalData(currency, days) {
    try {
      const response = await this.axiosInstance.get(`/compare/${days}/${currency}`);
      
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      }
      
      logger.warn(`Invalid historical data format from Yadio for ${currency}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch historical data from Yadio for ${currency}:`, error.message);
      return null;
    }
  }
  
  /**
   * Get price with 24h movement statistics
   * @param {string} currency - Currency code
   * @returns {Promise<object>} Object with { price, currency, change24h }
   */
  async getPriceWithMovement(currency) {
    const result = {
      price: null,
      currency,
      change24h: null
    };
    
    // Get current price
    result.price = await this.getBtcPrice(currency);
    
    if (!result.price) {
      return result;
    }
    
    try {
      // Get 24h change using avg24 field (currency-specific average)
      const data24h = await this.get24hData(currency);
      if (data24h && data24h.length > 0) {
        // API returns data sorted newest first, so last entry is oldest (24h ago)
        // Use 'avg24' which is the 24h average in the requested currency
        const oldPrice = data24h[data24h.length - 1].avg24;
        if (oldPrice && oldPrice > 0) {
          result.change24h = ((result.price - oldPrice) / oldPrice) * 100;
        }
      }
    } catch (error) {
      logger.warn(`Failed to calculate 24h price movement for ${currency}:`, error.message);
    }
    
    return result;
  }
  
  /**
   * Get price data for multiple currencies
   * @param {Array<string>} currencies - Array of currency codes
   * @param {boolean} includeMovement - Whether to include movement statistics
   * @returns {Promise<Array<object>>} Array of price data objects
   */
  async getPriceDataMultiple(currencies, includeMovement = false) {
    if (!Array.isArray(currencies) || currencies.length === 0) {
      return [];
    }
    
    // Fetch prices in parallel
    const promises = currencies.map(currency => {
      if (includeMovement) {
        return this.getPriceWithMovement(currency);
      } else {
        return this.getBtcPrice(currency).then(price => ({
          price,
          currency,
          change24h: null,
          change30d: null,
          change365d: null
        }));
      }
    });
    
    const results = await Promise.all(promises);
    return results;
  }
  
  /**
   * Get price data with 24h change (legacy method for backward compatibility)
   * @param {string} currency - Currency code
   * @returns {Promise<object>} Object with { price, change24h }
   */
  async getPriceData(currency) {
    const price = await this.getBtcPrice(currency);
    
    return {
      price,
      change24h: null,
      currency
    };
  }
}

// Export singleton instance
module.exports = new YadioClient();
