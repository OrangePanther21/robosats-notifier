const logger = require('./logger');

/**
 * Mock Robosats Client for Testing WhatsApp Integration
 * Use this while waiting for access to a working Robosats coordinator
 */
class RobosatsClientMock {
  constructor() {
    logger.info('Using MOCK Robosats client (for testing only)');
  }

  async getInfo() {
    logger.info('[MOCK] Fetching exchange info');
    
    return {
      num_public_buy_orders: 2,
      num_public_sell_orders: 2,
      book_liquidity: 0.5,
      active_robots_today: 42,
      last_day_nonkyc_btc_premium: 3.5,
      last_day_volume: 1.25,
      lifetime_volume: 150.5,
      network: 'mainnet',
      node_alias: 'MockRoboSats',
      min_order_size: 20000,
      max_order_size: 5000000
    };
  }

  // Generate random expiration time between 30 minutes and 23h 59m
  getRandomExpiration() {
    const minMs = 30 * 60 * 1000; // 30 minutes
    const maxMs = 23 * 60 * 60 * 1000 + 59 * 60 * 1000; // 23h 59m
    const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Date(Date.now() + randomMs).toISOString();
  }

  async getOrderBook(currency = null, type = null) {
    logger.info('[MOCK] Fetching order book');
    
    const config = require('./config');
    
    // Generate mock offers for each target currency
    const mockOffers = [];
    config.TARGET_CURRENCIES.forEach((currency, idx) => {
      mockOffers.push(
        {
          id: 1001 + (idx * 3),
          status: 1, // Public
          type: 0, // BUY
          currency: currency.id,
          amount: '500000',
          has_range: false,
          payment_method: 'Bank Transfer',
          premium: '2.5',
          price: 51250,
          satoshis: 100000,
          satoshis_now: 100000,
          maker_nick: 'SatoshiTrader',
          created_at: new Date().toISOString(),
          expires_at: this.getRandomExpiration()
        },
        {
          id: 1002 + (idx * 3),
          status: 1,
          type: 1, // SELL
          currency: currency.id,
          amount: '750000',
          has_range: false,
          payment_method: 'Cash',
          premium: '3.0',
          price: 51500,
          satoshis: 150000,
          satoshis_now: 150000,
          maker_nick: 'BitcoinSeller',
          created_at: new Date().toISOString(),
          expires_at: this.getRandomExpiration()
        },
        {
          id: 1003 + (idx * 3),
          status: 1,
          type: 0, // BUY
          currency: currency.id,
          has_range: true,
          min_amount: '200000',
          max_amount: '1000000',
          payment_method: 'Zelle',
          premium: '1.5',
          price: 51000,
          satoshis: 200000,
          satoshis_now: 200000,
          maker_nick: 'RangeTrader',
          created_at: new Date().toISOString(),
          expires_at: this.getRandomExpiration()
        }
      );
    });
    
    return mockOffers;
  }

  async getOffers() {
    const orderBook = await this.getOrderBook();
    const config = require('./config');
    
    // Get target currency IDs
    const targetCurrencyIds = config.TARGET_CURRENCIES.map(c => c.id);
    
    // In mock mode, filter by target currencies
    const offers = orderBook.filter(offer => offer.status === 1 && targetCurrencyIds.includes(offer.currency));
    
    // Add currency code and coordinator to each offer (for consistency with real client)
    offers.forEach(offer => {
      const currency = config.TARGET_CURRENCIES.find(c => c.id === offer.currency);
      if (currency) {
        offer.currencyCode = currency.code;
      }
      // Add mock coordinator
      offer.coordinator = 'mock';
    });
    
    const currencyCodes = config.TARGET_CURRENCIES.map(c => c.code).join(', ');
    logger.info(`[MOCK] Found ${offers.length} public offers (${currencyCodes})`);
    
    // Return same format as real client: { offers, reachableCoordinators }
    const reachableCoordinators = new Set(['mock']);
    return { offers, reachableCoordinators };
  }

  // Method to simulate new offers appearing
  async getOffersWithNew() {
    const { offers: baseOffers, reachableCoordinators } = await this.getOffers();
    
    // Occasionally add a "new" offer for testing notifications
    if (Math.random() > 0.7) {
      const config = require('./config');
      // Pick a random target currency
      const randomCurrency = config.TARGET_CURRENCIES[Math.floor(Math.random() * config.TARGET_CURRENCIES.length)];
      
      const newOffer = {
        id: Date.now(),
        status: 1,
        type: Math.random() > 0.5 ? 0 : 1,
        currency: randomCurrency.id,
        currencyCode: randomCurrency.code,
        coordinator: 'mock',
        amount: '600000',
        payment_method: 'Bank Transfer',
        premium: '2.0',
        price: 51000,
        satoshis: 120000,
        maker_nick: 'NewRobot' + Math.floor(Math.random() * 100),
        created_at: new Date().toISOString(),
        expires_at: this.getRandomExpiration()
      };
      
      logger.info('[MOCK] Simulating new offer appearing');
      return { offers: [...baseOffers, newOffer], reachableCoordinators };
    }
    
    return { offers: baseOffers, reachableCoordinators };
  }
}

module.exports = new RobosatsClientMock();
