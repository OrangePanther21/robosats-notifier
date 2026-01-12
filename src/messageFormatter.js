const config = require('./config');

// Language strings
const STRINGS = {
  EN: {
    buy: '🟢 BUY',
    sell: '🔴 SELL',
    variable: 'Variable',
    market: 'Market price',
    amount: 'Amount',
    price: 'Price',
    payment: 'Payment',
    expiresAt: 'Expires in',
    link: 'Link',
    seeOffer: 'See offer',
    offer: 'Offer'
  },
  ES: {
    buy: '🟢 COMPRA',
    sell: '🔴 VENTA',
    variable: 'Variable',
    market: 'A mercado',
    amount: 'Monto',
    price: 'Precio',
    payment: 'Pago',
    expiresAt: 'Expira en',
    link: 'Link',
    seeOffer: 'Ver oferta',
    offer: 'Oferta'
  }
};

function formatOffer(offer) {
  const strings = STRINGS[config.LANGUAGE];
  
  // Type: 0 = BUY, 1 = SELL
  const type = offer.type === 0 ? strings.buy : strings.sell;
  
  // Get currency code from offer (added by robosatsClient)
  const currencyCode = offer.currencyCode;
  
  // Format fiat amount - handle ranges
  let fiatAmount = strings.variable;
  let satsAmount = '';
  
  if (offer.has_range && offer.min_amount && offer.max_amount) {
    const minAmt = parseFloat(offer.min_amount).toLocaleString();
    const maxAmt = parseFloat(offer.max_amount).toLocaleString();
    fiatAmount = `${minAmt} - ${maxAmt} ${currencyCode}`;
    
    // Calculate sats range from price (price is in fiat per BTC)
    // Formula: (fiat_amount / fiat_per_btc) * 100,000,000 = sats
    const price = offer.price_now !== undefined && offer.price_now !== null 
      ? offer.price_now 
      : offer.price;
    if (price && price > 0) {
      const minSats = Math.round((parseFloat(offer.min_amount) / price) * 100000000);
      const maxSats = Math.round((parseFloat(offer.max_amount) / price) * 100000000);
      satsAmount = `~${minSats.toLocaleString()} - ${maxSats.toLocaleString()} sats`;
    }
  } else if (offer.amount) {
    const amt = parseFloat(offer.amount).toLocaleString();
    fiatAmount = `${amt} ${currencyCode}`;
    
    // Format sats amount - use satoshis_now if available, otherwise satoshis
    const sats = offer.satoshis_now !== undefined && offer.satoshis_now !== null 
      ? offer.satoshis_now 
      : offer.satoshis;
    if (sats !== undefined && sats !== null) {
      satsAmount = `~${sats.toLocaleString()} sats`;
    }
  } else {
    // No fiat amount, try to show sats if available
    const sats = offer.satoshis_now !== undefined && offer.satoshis_now !== null 
      ? offer.satoshis_now 
      : offer.satoshis;
    if (sats !== undefined && sats !== null) {
      satsAmount = `~${sats.toLocaleString()} sats`;
    }
  }
  
  // Combine fiat and sats
  let amount = fiatAmount;
  if (satsAmount) {
    amount = `${fiatAmount} (${satsAmount})`;
  }
  
  // Format price
  // Note: Robosats API price might be in different units - check if it needs conversion
  let priceValue = offer.price;
  if (priceValue && typeof priceValue === 'number') {
    // Check if price seems unusually high (might be in smaller units or need division)
    // For now, display as-is but this might need adjustment based on API documentation
    priceValue = Math.round(priceValue);
  }
  const price = offer.price ? `${priceValue.toLocaleString()} ${currencyCode}` : strings.market;
  const premium = offer.premium ? `${parseFloat(offer.premium) > 0 ? '+' : ''}${offer.premium}%` : '';
  
  // Format expiration time if available - show relative time (e.g., "in 2h 30m")
  let expiresInfo = '';
  if (offer.expires_at) {
    try {
      const expiresDate = new Date(offer.expires_at);
      const now = new Date();
      const diffMs = expiresDate - now;
      
      if (diffMs > 0) {
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        let timeString = '';
        if (diffDays > 0) {
          const hours = diffHours % 24;
          timeString = `${diffDays}d`;
          if (hours > 0) {
            timeString += ` ${hours}h`;
          }
        } else if (diffHours > 0) {
          const minutes = diffMinutes % 60;
          timeString = `${diffHours}h`;
          if (minutes > 0) {
            timeString += ` ${minutes}m`;
          }
        } else {
          timeString = `${diffMinutes}m`;
        }
        
        expiresInfo = `${timeString}`;
      }
    } catch (e) {
      // Ignore date parsing/formatting errors
    }
  }
  
  // Show coordinator (always present from robosatsClient)
  const coordinatorId = offer.coordinator;
  const coordinatorName = config.COORDINATOR_MAP[coordinatorId] || coordinatorId;
    
  // Generate link - use configurable onion URL with format: /order/[coordinator]/[id]
  const link = `${config.ROBOSATS_ONION_URL}/order/${coordinatorId}/${offer.id}`;
  
  return `
*${type} ${strings.offer} (${coordinatorName})*
━━━━━━━━━━━━━━━━━
💰 *${strings.amount}:* ${amount}
💵 *${strings.price}:* ${price}${premium ? ` (${premium})` : ''}
🏦 *${strings.payment}:* ${offer.payment_method || strings.seeOffer}
⏳ *${strings.expiresAt}:* ${expiresInfo}
🔗 ${link}
`.trim();
}

module.exports = { formatOffer };
