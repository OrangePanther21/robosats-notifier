const config = require('./config');
const closingMessages = require('./closingMessages');

// Language strings
const STRINGS = {
  EN: {
    dailySummary: 'Daily Summary',
    btcPrice: 'BTC Price',
    offers24h: 'Offers (Last 24h)',
    total: 'Total',
    buy: 'BUY',
    sell: 'SELL',
    avgPremium: 'Avg Premium',
    volume: 'Volume',
    coordinatorHealth: 'Coordinator Health',
    offers: 'offers',
    priceUnavailable: 'Price unavailable',
    noData: 'No data available'
  },
  ES: {
    dailySummary: 'Resumen Diario',
    btcPrice: 'Precio BTC',
    offers24h: 'Ofertas (Últimas 24h)',
    total: 'Total',
    buy: 'COMPRA',
    sell: 'VENTA',
    avgPremium: 'Prima Promedio',
    volume: 'Volumen',
    coordinatorHealth: 'Estado de Coordinadores',
    offers: 'ofertas',
    priceUnavailable: 'Precio no disponible',
    noData: 'No hay datos disponibles'
  }
};

/**
 * Get health indicator emoji based on percentage
 * @param {number} healthPercent - Health percentage (0-100)
 * @returns {string} Emoji indicator
 */
function getHealthIndicator(healthPercent) {
  if (healthPercent >= 95) return '✅';
  if (healthPercent >= 60) return '⚠️';
  if (healthPercent >= 20) return '❌';
  return '☠️';
}

/**
 * Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  return Math.round(num).toLocaleString();
}

/**
 * Format sats with K/M suffix
 * @param {number} sats - Satoshis amount
 * @returns {string} Formatted sats (e.g., "1.2M sats")
 */
function formatSats(sats) {
  if (sats >= 1000000) {
    return `${(sats / 1000000).toFixed(1)}M sats`;
  } else if (sats >= 1000) {
    return `${(sats / 1000).toFixed(1)}K sats`;
  }
  return `${Math.round(sats)} sats`;
}

/**
 * Format the daily summary message
 * @param {object} stats - 24h stats from statsTracker
 * @param {Array<object>|object} priceData - BTC price data (array for multiple currencies or single object)
 * @returns {string} Formatted message
 */
function formatDailySummary(stats, priceData) {
  const strings = STRINGS[config.LANGUAGE] || STRINGS.EN;
  const sections = config.DAILY_SUMMARY_SECTIONS || {
    btcPrice: true,
    offerStats: true,
    premiumAnalysis: true,
    coordinatorHealth: true
  };
  
  // Normalize priceData to always be an array
  const priceDataArray = Array.isArray(priceData) ? priceData : [priceData];
  
  // Get current date
  const now = new Date();
  const dateStr = now.toLocaleDateString(config.LANGUAGE === 'ES' ? 'es-ES' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  let message = '';
  
  // Header
  message += `📊 *${strings.dailySummary} - ${dateStr}*\n`;
  message += `━━━━━━━━━━━━━━━━━\n`;
  
  // BTC Price Section - Multi-currency
  if (sections.btcPrice) {
    message += `💰 *${strings.btcPrice}*\n`;
    
    let hasPrices = false;
    for (const data of priceDataArray) {
      if (data && data.price) {
        hasPrices = true;
        message += `*${data.currency}:* $${formatNumber(data.price)}`;
        
        // Add 24h price movement if enabled and available
        if (sections.priceMovement && data.change24h !== null && data.change24h !== undefined) {
          const sign = data.change24h >= 0 ? '+' : '';
          message += ` (${sign}${data.change24h.toFixed(1)}% 24h)`;
        }
        
        message += '\n';
      }
    }
    
    if (!hasPrices) {
      message += `${strings.priceUnavailable}\n`;
    }
    
    message += '\n';
  }
  
  // Offer Statistics Section - Per Currency
  if (sections.offerStats && stats.offersByCurrency) {
    // Get target currencies from config
    const targetCurrencies = config.TARGET_CURRENCIES.map(c => c.code);
    
    // Iterate over each configured currency
    for (const currencyCode of targetCurrencies) {
      const currencyStats = stats.offersByCurrency[currencyCode];
      
      // Skip if no data for this currency
      if (!currencyStats || (currencyStats.buyCount === 0 && currencyStats.sellCount === 0)) {
        continue;
      }
      
      // Show currency-specific header
      message += `📈 *${strings.offers24h.replace('(Últimas 24h)', `${currencyCode} (24h)`).replace('(Last 24h)', `${currencyCode} (24h)`)}*\n`;
      
      // Show offer count if enabled
      if (sections.offerCount !== false) {
        const totalOffers = currencyStats.buyCount + currencyStats.sellCount;
        message += `*${strings.total}:* ${totalOffers} (`;
        message += `${currencyStats.buyCount} ${strings.buy} | `;
        message += `${currencyStats.sellCount} ${strings.sell})\n`;
        
        // Show volume
        if (currencyStats.totalVolumeSats > 0) {
          message += `*${strings.volume}:* ${formatSats(currencyStats.totalVolumeSats)}\n`;
        }
      }
      
      // Show premium analysis if enabled
      if (sections.premiumAnalysis !== false) {
        const buyAvg = currencyStats.premiums.buy.avg;
        const sellAvg = currencyStats.premiums.sell.avg;
        
        if (buyAvg !== null || sellAvg !== null) {
          message += `*${strings.avgPremium}:* `;
          
          if (buyAvg !== null) {
            const sign = buyAvg >= 0 ? '+' : '';
            message += `${sign}${buyAvg.toFixed(1)}% (${strings.buy})`;
          }
          
          if (buyAvg !== null && sellAvg !== null) {
            message += ' / ';
          }
          
          if (sellAvg !== null) {
            const sign = sellAvg >= 0 ? '+' : '';
            message += `${sign}${sellAvg.toFixed(1)}% (${strings.sell})`;
          }
          
          message += '\n';
        }
      }
      
      message += '\n';
    }
  }
  
  // Coordinator Health Section
  if (sections.coordinatorHealth && stats.coordinatorsSorted && stats.coordinatorsSorted.length > 0) {
    message += `🌐 *${strings.coordinatorHealth}*\n`;
    
    // Get coordinator map for display names
    const coordinatorMap = config.COORDINATOR_MAP;
    
    // Get target currencies
    const targetCurrencies = config.TARGET_CURRENCIES.map(c => c.code);
    
    // Display coordinators (limit to top 10)
    const topCoordinators = stats.coordinatorsSorted.slice(0, 10);
    
    topCoordinators.forEach((coord, index) => {
      const displayName = coordinatorMap[coord.id] || coord.id;
      const healthIndicator = getHealthIndicator(coord.healthPercent);
      
      message += `*${index + 1}. ${displayName}:* ${Math.round(coord.healthPercent)}% ${healthIndicator}`;
      
      // Add volume per currency if available
      if (stats.coordinatorVolumeByCurrency && stats.coordinatorVolumeByCurrency[coord.id]) {
        const coordVolumes = stats.coordinatorVolumeByCurrency[coord.id];
        const volumeParts = [];
        
        for (const currency of targetCurrencies) {
          if (coordVolumes[currency] && coordVolumes[currency] > 0) {
            volumeParts.push(`${currency}: ${formatSats(coordVolumes[currency])}`);
          }
        }
        
        if (volumeParts.length > 0) {
          message += ` (${volumeParts.join(' | ')} 💧)`;
        }
      }
      
      message += '\n';
    });
    
    message += '\n';
  }
  
  // Closing Message
  const closingMessage = closingMessages.getClosingMessage();
  if (closingMessage) {
    message += `${closingMessage}\n`;
  }
  
  return message.trim();
}

module.exports = { formatDailySummary };
