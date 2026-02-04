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
   * Get 24h price change percentage
   * Note: Yadio doesn't directly provide 24h change, so we'll fetch current price
   * and compare with a cached previous price if available
   * @param {string} currency - Currency code
   * @returns {Promise<number|null>} 24h change percentage, or null if unavailable
   */
  async get24hChange(currency) {
    // For now, return null as Yadio doesn't provide historical data
    // This could be enhanced by caching prices and calculating the difference
    return null;
  }
  
  /**
   * Get price data with 24h change (uses cached data if available)
   * @param {string} currency - Currency code
   * @returns {Promise<object>} Object with { price, change24h }
   */
  async getPriceData(currency) {
    const price = await this.getBtcPrice(currency);
    const change24h = await this.get24hChange(currency);
    
    return {
      price,
      change24h,
      currency
    };
  }
}

// Export singleton instance
module.exports = new YadioClient();
