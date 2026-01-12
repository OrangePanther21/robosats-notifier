require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Create event emitter for config changes
const configEmitter = new EventEmitter();

// Currency ID mapping from RoboSats
// Source: https://github.com/RoboSats/robosats/blob/main/frontend/static/assets/currencies.json
const CURRENCY_MAP = {
  'USD': 1,
  'EUR': 2,
  'GBP': 3,
  'AUD': 4,
  'CAD': 5,
  'JPY': 6,
  'CNY': 7,
  'CHF': 8,
  'SEK': 9,
  'NZD': 10,
  'KRW': 11,
  'TRY': 12,
  'RUB': 13,
  'ZAR': 14,
  'BRL': 15,
  'CLP': 16,
  'CZK': 17,
  'DKK': 18,
  'HKD': 19,
  'HUF': 20,
  'INR': 21,
  'ISK': 22,
  'MXN': 23,
  'MYR': 24,
  'NOK': 25,
  'PHP': 26,
  'PLN': 27,
  'RON': 28,
  'SGD': 29,
  'THB': 30,
  'TWD': 31,
  'ARS': 32,
  'VES': 33,
  'COP': 34,
  'PYG': 35,
  'PEN': 36,
  'UYU': 37,
  'BOB': 38,
  'CRC': 39,
  'GTQ': 40,
  'HNL': 41,
  'NIO': 42,
  'PAB': 43,
  'DOP': 44,
  'SAT': 1000
};

// Required environment variables
const requiredEnvVars = [
  'WHATSAPP_GROUP_NAME',
  'ROBOSATS_API_URL',
  'ROBOSATS_COORDINATORS',
  'ROBOSATS_ONION_URL',
  'TARGET_CURRENCIES'
];

// Validate required environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0 && process.env.ROBOSATS_USE_MOCK !== 'true') {
  console.error('ERROR: Missing required environment variables:');
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('\nPlease set these variables in your .env file');
  process.exit(1);
}

// Parse target currencies from comma-separated list
// Format: "USD,EUR,GBP" (currency codes only)
// The function will automatically map codes to IDs using CURRENCY_MAP
function parseTargetCurrencies() {
  const currenciesStr = process.env.TARGET_CURRENCIES;
  if (!currenciesStr) {
    if (process.env.ROBOSATS_USE_MOCK === 'true') {
      return [{ code: 'USD', id: 1 }];
    }
    throw new Error('TARGET_CURRENCIES environment variable is required');
  }

  const currencies = currenciesStr.split(',').map(code => {
    const currencyCode = code.trim().toUpperCase();
    const currencyId = CURRENCY_MAP[currencyCode];
    
    if (!currencyId) {
      const availableCurrencies = Object.keys(CURRENCY_MAP).join(', ');
      throw new Error(
        `Unknown currency code: ${currencyCode}\n` +
        `Available currencies: ${availableCurrencies}`
      );
    }
    
    return {
      code: currencyCode,
      id: currencyId
    };
  });

  if (currencies.length === 0) {
    throw new Error('At least one target currency must be specified');
  }

  return currencies;
}

// Parse check interval in minutes
function parseCheckInterval() {
  const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES);
  if (isNaN(intervalMinutes) || intervalMinutes < 1) {
    throw new Error('CHECK_INTERVAL_MINUTES must be a positive number');
  }
  return intervalMinutes * 60 * 1000; // Convert to milliseconds
}

// Coordinator name mapping (ID -> Display Name)
const COORDINATOR_MAP = {
  'bazaar': 'Bazaar',
  'moon': 'Moon',
  'lake': 'Lake',
  'temple': 'Temple',
  'veneto': 'Veneto',
  'freedomsats': 'FreedomSats',
  'whiteyesats': 'WhiteYesats',
  'alice': 'Alice',
  'mock': 'Mock' // For testing
};

// Available coordinators in RoboSats federation (derived from COORDINATOR_MAP, excluding 'mock')
const AVAILABLE_COORDINATORS = Object.keys(COORDINATOR_MAP).filter(c => c !== 'mock');

// Parse and validate language
function parseLanguage() {
  let lang = (process.env.LANGUAGE || 'EN').toUpperCase();
  
  // Extract language code from locale strings (e.g., "EN_US.UTF-8" -> "EN")
  // Take first 2 characters before underscore, dot, or dash
  const match = lang.match(/^([A-Z]{2})/);
  if (match) {
    lang = match[1];
  }
  
  if (!['EN', 'ES'].includes(lang)) {
    throw new Error(`Invalid LANGUAGE: ${process.env.LANGUAGE}. Must be 'EN' or 'ES'`);
  }
  return lang;
}

// Load configuration from JSON file if it exists, otherwise use env vars
function loadConfig() {
  const configPath = getConfigPath();
  
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Override process.env with values from config file
      Object.keys(configData).forEach(key => {
        if (configData[key] !== undefined && configData[key] !== '') {
          process.env[key] = configData[key];
        }
      });
      return true;
    } catch (error) {
      console.error('Error loading config file:', error.message);
      return false;
    }
  }
  return false;
}

// Get config file path - use ./data for local development, /data for Docker
function getConfigPath() {
  if (process.env.CONFIG_FILE) {
    return process.env.CONFIG_FILE;
  }
  // Check if we're in Docker (if /data exists and is writable)
  try {
    if (fs.existsSync('/data')) {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data/config.json';
    }
  } catch (e) {
    // Not accessible, fall back to local path
  }
  return './data/config.json';
}

// Save configuration to JSON file
function saveConfig(configData) {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  
  // Create directory if it doesn't exist
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving config file:', error);
    throw new Error(`Failed to save configuration: ${error.message}`);
  }
}

// Load config from file on module load
loadConfig();

function getConfig() {
  return {
    WHATSAPP_GROUP_NAME: process.env.WHATSAPP_GROUP_NAME,
    CHECK_INTERVAL_MINUTES: process.env.CHECK_INTERVAL_MINUTES,
    ROBOSATS_USE_MOCK: process.env.ROBOSATS_USE_MOCK,
    ROBOSATS_API_URL: process.env.ROBOSATS_API_URL,
    ROBOSATS_COORDINATORS: process.env.ROBOSATS_COORDINATORS,
    ROBOSATS_ONION_URL: process.env.ROBOSATS_ONION_URL,
    TARGET_CURRENCIES: process.env.TARGET_CURRENCIES,
    LANGUAGE: process.env.LANGUAGE,
    BOT_ENABLED: process.env.BOT_ENABLED
  };
}

// Reload configuration and update module exports
function reloadConfig() {
  // Reload from config file
  loadConfig();
  
  // Update module.exports with new values
  const config = module.exports;
  config.WHATSAPP_GROUP_NAME = process.env.WHATSAPP_GROUP_NAME;
  config.CHECK_INTERVAL_MS = parseCheckInterval();
  config.ROBOSATS_USE_MOCK = process.env.ROBOSATS_USE_MOCK === 'true';
  config.ROBOSATS_API_URL = process.env.ROBOSATS_API_URL;
  config.ROBOSATS_COORDINATORS = process.env.ROBOSATS_COORDINATORS;
  config.ROBOSATS_ONION_URL = process.env.ROBOSATS_ONION_URL;
  config.TARGET_CURRENCIES = parseTargetCurrencies();
  config.LANGUAGE = parseLanguage();
  config.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  config.BOT_ENABLED = process.env.BOT_ENABLED !== 'false'; // Default to true
  
  // Emit config change event
  configEmitter.emit('configChanged');
}

module.exports = {
  WHATSAPP_GROUP_NAME: process.env.WHATSAPP_GROUP_NAME,
  CHECK_INTERVAL_MS: parseCheckInterval(),
  
  // Robosats API Configuration
  ROBOSATS_USE_MOCK: process.env.ROBOSATS_USE_MOCK === 'true',
  ROBOSATS_API_URL: process.env.ROBOSATS_API_URL,
  ROBOSATS_COORDINATORS: process.env.ROBOSATS_COORDINATORS,
  ROBOSATS_ONION_URL: process.env.ROBOSATS_ONION_URL,
  
  AVAILABLE_COORDINATORS,
  CURRENCY_MAP,
  COORDINATOR_MAP,
  
  // Target currencies configuration
  TARGET_CURRENCIES: parseTargetCurrencies(),
  
  // Language configuration
  LANGUAGE: parseLanguage(),
  
  // Bot enabled/disabled state
  BOT_ENABLED: process.env.BOT_ENABLED !== 'false', // Default to true
  
  DATA_DIR: './data',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Configuration management functions
  loadConfig,
  saveConfig,
  getConfig,
  reloadConfig,
  
  // Event emitter for config changes
  configEmitter
};
