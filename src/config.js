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

// Required environment variables (excluding notification-specific ones)
const requiredEnvVars = [
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

// Validate notification configuration (either group or contact must be configured)
// This validation happens after config is loaded, not at module initialization
function validateNotificationConfig() {
  const notificationType = process.env.NOTIFICATION_TYPE || 'group';
  
  if (notificationType === 'contact') {
    if (!process.env.CONTACT_COUNTRY_CODE || !process.env.CONTACT_PHONE_NUMBER) {
      throw new Error('Contact notification type selected but CONTACT_COUNTRY_CODE or CONTACT_PHONE_NUMBER not configured');
    }
  } else {
    if (!process.env.WHATSAPP_GROUP_NAME) {
      throw new Error('Group notification type selected but WHATSAPP_GROUP_NAME not configured');
    }
  }
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
  'alice': 'Alice',
  'whiteyesats': 'WhitEyeSats',
  'freedomsats': 'FreedomSats',
  'bazaar': 'LibreBazaar',
  'moon': 'Over the moon',
  'veneto': 'BitcoinVeneto',
  'lake': 'TheBigLake',
  'temple': 'Temple of Sats',
  'mock': 'Mock' // For testing
};

// Available coordinators in RoboSats federation (derived from COORDINATOR_MAP, excluding 'mock')
const AVAILABLE_COORDINATORS = Object.keys(COORDINATOR_MAP).filter(c => c !== 'mock');

// Country codes for phone number selection
// Sorted alphabetically by country name
const COUNTRY_CODES = [
  { code: 'AF', dialCode: '+93', name: 'Afghanistan', flag: '🇦🇫' },
  { code: 'AL', dialCode: '+355', name: 'Albania', flag: '🇦🇱' },
  { code: 'DZ', dialCode: '+213', name: 'Algeria', flag: '🇩🇿' },
  { code: 'AS', dialCode: '+1684', name: 'American Samoa', flag: '🇦🇸' },
  { code: 'AD', dialCode: '+376', name: 'Andorra', flag: '🇦🇩' },
  { code: 'AO', dialCode: '+244', name: 'Angola', flag: '🇦🇴' },
  { code: 'AI', dialCode: '+1264', name: 'Anguilla', flag: '🇦🇮' },
  { code: 'AG', dialCode: '+1268', name: 'Antigua and Barbuda', flag: '🇦🇬' },
  { code: 'AR', dialCode: '+54', name: 'Argentina', flag: '🇦🇷' },
  { code: 'AM', dialCode: '+374', name: 'Armenia', flag: '🇦🇲' },
  { code: 'AW', dialCode: '+297', name: 'Aruba', flag: '🇦🇼' },
  { code: 'AU', dialCode: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: 'AT', dialCode: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: 'AZ', dialCode: '+994', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'BS', dialCode: '+1242', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'BH', dialCode: '+973', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'BD', dialCode: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'BB', dialCode: '+1246', name: 'Barbados', flag: '🇧🇧' },
  { code: 'BY', dialCode: '+375', name: 'Belarus', flag: '🇧🇾' },
  { code: 'BE', dialCode: '+32', name: 'Belgium', flag: '🇧🇪' },
  { code: 'BZ', dialCode: '+501', name: 'Belize', flag: '🇧🇿' },
  { code: 'BJ', dialCode: '+229', name: 'Benin', flag: '🇧🇯' },
  { code: 'BM', dialCode: '+1441', name: 'Bermuda', flag: '🇧🇲' },
  { code: 'BT', dialCode: '+975', name: 'Bhutan', flag: '🇧🇹' },
  { code: 'BO', dialCode: '+591', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'BA', dialCode: '+387', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'BW', dialCode: '+267', name: 'Botswana', flag: '🇧🇼' },
  { code: 'BR', dialCode: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: 'BN', dialCode: '+673', name: 'Brunei', flag: '🇧🇳' },
  { code: 'BG', dialCode: '+359', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'BF', dialCode: '+226', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BI', dialCode: '+257', name: 'Burundi', flag: '🇧🇮' },
  { code: 'KH', dialCode: '+855', name: 'Cambodia', flag: '🇰🇭' },
  { code: 'CM', dialCode: '+237', name: 'Cameroon', flag: '🇨🇲' },
  { code: 'CA', dialCode: '+1', name: 'Canada', flag: '🇨🇦' },
  { code: 'CV', dialCode: '+238', name: 'Cape Verde', flag: '🇨🇻' },
  { code: 'KY', dialCode: '+1345', name: 'Cayman Islands', flag: '🇰🇾' },
  { code: 'CF', dialCode: '+236', name: 'Central African Republic', flag: '🇨🇫' },
  { code: 'TD', dialCode: '+235', name: 'Chad', flag: '🇹🇩' },
  { code: 'CL', dialCode: '+56', name: 'Chile', flag: '🇨🇱' },
  { code: 'CN', dialCode: '+86', name: 'China', flag: '🇨🇳' },
  { code: 'CO', dialCode: '+57', name: 'Colombia', flag: '🇨🇴' },
  { code: 'KM', dialCode: '+269', name: 'Comoros', flag: '🇰🇲' },
  { code: 'CG', dialCode: '+242', name: 'Congo', flag: '🇨🇬' },
  { code: 'CD', dialCode: '+243', name: 'Congo (DRC)', flag: '🇨🇩' },
  { code: 'CK', dialCode: '+682', name: 'Cook Islands', flag: '🇨🇰' },
  { code: 'CR', dialCode: '+506', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'HR', dialCode: '+385', name: 'Croatia', flag: '🇭🇷' },
  { code: 'CU', dialCode: '+53', name: 'Cuba', flag: '🇨🇺' },
  { code: 'CW', dialCode: '+599', name: 'Curaçao', flag: '🇨🇼' },
  { code: 'CY', dialCode: '+357', name: 'Cyprus', flag: '🇨🇾' },
  { code: 'CZ', dialCode: '+420', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'DK', dialCode: '+45', name: 'Denmark', flag: '🇩🇰' },
  { code: 'DJ', dialCode: '+253', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'DM', dialCode: '+1767', name: 'Dominica', flag: '🇩🇲' },
  { code: 'DO', dialCode: '+1', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'EC', dialCode: '+593', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'EG', dialCode: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: 'SV', dialCode: '+503', name: 'El Salvador', flag: '🇸🇻' },
  { code: 'GQ', dialCode: '+240', name: 'Equatorial Guinea', flag: '🇬🇶' },
  { code: 'ER', dialCode: '+291', name: 'Eritrea', flag: '🇪🇷' },
  { code: 'EE', dialCode: '+372', name: 'Estonia', flag: '🇪🇪' },
  { code: 'ET', dialCode: '+251', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'FK', dialCode: '+500', name: 'Falkland Islands', flag: '🇫🇰' },
  { code: 'FO', dialCode: '+298', name: 'Faroe Islands', flag: '🇫🇴' },
  { code: 'FJ', dialCode: '+679', name: 'Fiji', flag: '🇫🇯' },
  { code: 'FI', dialCode: '+358', name: 'Finland', flag: '🇫🇮' },
  { code: 'FR', dialCode: '+33', name: 'France', flag: '🇫🇷' },
  { code: 'PF', dialCode: '+689', name: 'French Polynesia', flag: '🇵🇫' },
  { code: 'GA', dialCode: '+241', name: 'Gabon', flag: '🇬🇦' },
  { code: 'GM', dialCode: '+220', name: 'Gambia', flag: '🇬🇲' },
  { code: 'GE', dialCode: '+995', name: 'Georgia', flag: '🇬🇪' },
  { code: 'DE', dialCode: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: 'GH', dialCode: '+233', name: 'Ghana', flag: '🇬🇭' },
  { code: 'GI', dialCode: '+350', name: 'Gibraltar', flag: '🇬🇮' },
  { code: 'GR', dialCode: '+30', name: 'Greece', flag: '🇬🇷' },
  { code: 'GL', dialCode: '+299', name: 'Greenland', flag: '🇬🇱' },
  { code: 'GD', dialCode: '+1473', name: 'Grenada', flag: '🇬🇩' },
  { code: 'GU', dialCode: '+1671', name: 'Guam', flag: '🇬🇺' },
  { code: 'GT', dialCode: '+502', name: 'Guatemala', flag: '🇬🇹' },
  { code: 'GN', dialCode: '+224', name: 'Guinea', flag: '🇬🇳' },
  { code: 'GW', dialCode: '+245', name: 'Guinea-Bissau', flag: '🇬🇼' },
  { code: 'GY', dialCode: '+592', name: 'Guyana', flag: '🇬🇾' },
  { code: 'HT', dialCode: '+509', name: 'Haiti', flag: '🇭🇹' },
  { code: 'HN', dialCode: '+504', name: 'Honduras', flag: '🇭🇳' },
  { code: 'HK', dialCode: '+852', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'HU', dialCode: '+36', name: 'Hungary', flag: '🇭🇺' },
  { code: 'IS', dialCode: '+354', name: 'Iceland', flag: '🇮🇸' },
  { code: 'IN', dialCode: '+91', name: 'India', flag: '🇮🇳' },
  { code: 'ID', dialCode: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'IR', dialCode: '+98', name: 'Iran', flag: '🇮🇷' },
  { code: 'IQ', dialCode: '+964', name: 'Iraq', flag: '🇮🇶' },
  { code: 'IE', dialCode: '+353', name: 'Ireland', flag: '🇮🇪' },
  { code: 'IL', dialCode: '+972', name: 'Israel', flag: '🇮🇱' },
  { code: 'IT', dialCode: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: 'JM', dialCode: '+1876', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'JP', dialCode: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: 'JO', dialCode: '+962', name: 'Jordan', flag: '🇯🇴' },
  { code: 'KZ', dialCode: '+7', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: 'KI', dialCode: '+686', name: 'Kiribati', flag: '🇰🇮' },
  { code: 'XK', dialCode: '+383', name: 'Kosovo', flag: '🇽🇰' },
  { code: 'KW', dialCode: '+965', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'KG', dialCode: '+996', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'LA', dialCode: '+856', name: 'Laos', flag: '🇱🇦' },
  { code: 'LV', dialCode: '+371', name: 'Latvia', flag: '🇱🇻' },
  { code: 'LB', dialCode: '+961', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'LS', dialCode: '+266', name: 'Lesotho', flag: '🇱🇸' },
  { code: 'LR', dialCode: '+231', name: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', dialCode: '+218', name: 'Libya', flag: '🇱🇾' },
  { code: 'LI', dialCode: '+423', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', dialCode: '+370', name: 'Lithuania', flag: '🇱🇹' },
  { code: 'LU', dialCode: '+352', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MO', dialCode: '+853', name: 'Macau', flag: '🇲🇴' },
  { code: 'MK', dialCode: '+389', name: 'Macedonia', flag: '🇲🇰' },
  { code: 'MG', dialCode: '+261', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MW', dialCode: '+265', name: 'Malawi', flag: '🇲🇼' },
  { code: 'MY', dialCode: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'MV', dialCode: '+960', name: 'Maldives', flag: '🇲🇻' },
  { code: 'ML', dialCode: '+223', name: 'Mali', flag: '🇲🇱' },
  { code: 'MT', dialCode: '+356', name: 'Malta', flag: '🇲🇹' },
  { code: 'MH', dialCode: '+692', name: 'Marshall Islands', flag: '🇲🇭' },
  { code: 'MR', dialCode: '+222', name: 'Mauritania', flag: '🇲🇷' },
  { code: 'MU', dialCode: '+230', name: 'Mauritius', flag: '🇲🇺' },
  { code: 'MX', dialCode: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: 'MD', dialCode: '+373', name: 'Moldova', flag: '🇲🇩' },
  { code: 'MC', dialCode: '+377', name: 'Monaco', flag: '🇲🇨' },
  { code: 'MN', dialCode: '+976', name: 'Mongolia', flag: '🇲🇳' },
  { code: 'ME', dialCode: '+382', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'MS', dialCode: '+1664', name: 'Montserrat', flag: '🇲🇸' },
  { code: 'MA', dialCode: '+212', name: 'Morocco', flag: '🇲🇦' },
  { code: 'MZ', dialCode: '+258', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'MM', dialCode: '+95', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'NA', dialCode: '+264', name: 'Namibia', flag: '🇳🇦' },
  { code: 'NR', dialCode: '+674', name: 'Nauru', flag: '🇳🇷' },
  { code: 'NP', dialCode: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: 'NL', dialCode: '+31', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'NC', dialCode: '+687', name: 'New Caledonia', flag: '🇳🇨' },
  { code: 'NZ', dialCode: '+64', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'NI', dialCode: '+505', name: 'Nicaragua', flag: '🇳🇮' },
  { code: 'NE', dialCode: '+227', name: 'Niger', flag: '🇳🇪' },
  { code: 'NG', dialCode: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KP', dialCode: '+850', name: 'North Korea', flag: '🇰🇵' },
  { code: 'NO', dialCode: '+47', name: 'Norway', flag: '🇳🇴' },
  { code: 'OM', dialCode: '+968', name: 'Oman', flag: '🇴🇲' },
  { code: 'PK', dialCode: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'PW', dialCode: '+680', name: 'Palau', flag: '🇵🇼' },
  { code: 'PS', dialCode: '+970', name: 'Palestine', flag: '🇵🇸' },
  { code: 'PA', dialCode: '+507', name: 'Panama', flag: '🇵🇦' },
  { code: 'PG', dialCode: '+675', name: 'Papua New Guinea', flag: '🇵🇬' },
  { code: 'PY', dialCode: '+595', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'PE', dialCode: '+51', name: 'Peru', flag: '🇵🇪' },
  { code: 'PH', dialCode: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: 'PL', dialCode: '+48', name: 'Poland', flag: '🇵🇱' },
  { code: 'PT', dialCode: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: 'PR', dialCode: '+1', name: 'Puerto Rico', flag: '🇵🇷' },
  { code: 'QA', dialCode: '+974', name: 'Qatar', flag: '🇶🇦' },
  { code: 'RE', dialCode: '+262', name: 'Réunion', flag: '🇷🇪' },
  { code: 'RO', dialCode: '+40', name: 'Romania', flag: '🇷🇴' },
  { code: 'RU', dialCode: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: 'RW', dialCode: '+250', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'WS', dialCode: '+685', name: 'Samoa', flag: '🇼🇸' },
  { code: 'SM', dialCode: '+378', name: 'San Marino', flag: '🇸🇲' },
  { code: 'ST', dialCode: '+239', name: 'São Tomé and Príncipe', flag: '🇸🇹' },
  { code: 'SA', dialCode: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'SN', dialCode: '+221', name: 'Senegal', flag: '🇸🇳' },
  { code: 'RS', dialCode: '+381', name: 'Serbia', flag: '🇷🇸' },
  { code: 'SC', dialCode: '+248', name: 'Seychelles', flag: '🇸🇨' },
  { code: 'SL', dialCode: '+232', name: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'SG', dialCode: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: 'SK', dialCode: '+421', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'SI', dialCode: '+386', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'SB', dialCode: '+677', name: 'Solomon Islands', flag: '🇸🇧' },
  { code: 'SO', dialCode: '+252', name: 'Somalia', flag: '🇸🇴' },
  { code: 'ZA', dialCode: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: 'KR', dialCode: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: 'SS', dialCode: '+211', name: 'South Sudan', flag: '🇸🇸' },
  { code: 'ES', dialCode: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: 'LK', dialCode: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'KN', dialCode: '+1869', name: 'St. Kitts and Nevis', flag: '🇰🇳' },
  { code: 'LC', dialCode: '+1758', name: 'St. Lucia', flag: '🇱🇨' },
  { code: 'VC', dialCode: '+1784', name: 'St. Vincent and Grenadines', flag: '🇻🇨' },
  { code: 'SD', dialCode: '+249', name: 'Sudan', flag: '🇸🇩' },
  { code: 'SR', dialCode: '+597', name: 'Suriname', flag: '🇸🇷' },
  { code: 'SZ', dialCode: '+268', name: 'Swaziland', flag: '🇸🇿' },
  { code: 'SE', dialCode: '+46', name: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', dialCode: '+41', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'SY', dialCode: '+963', name: 'Syria', flag: '🇸🇾' },
  { code: 'TW', dialCode: '+886', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'TJ', dialCode: '+992', name: 'Tajikistan', flag: '🇹🇯' },
  { code: 'TZ', dialCode: '+255', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'TH', dialCode: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: 'TL', dialCode: '+670', name: 'Timor-Leste', flag: '🇹🇱' },
  { code: 'TG', dialCode: '+228', name: 'Togo', flag: '🇹🇬' },
  { code: 'TO', dialCode: '+676', name: 'Tonga', flag: '🇹🇴' },
  { code: 'TT', dialCode: '+1868', name: 'Trinidad and Tobago', flag: '🇹🇹' },
  { code: 'TN', dialCode: '+216', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'TR', dialCode: '+90', name: 'Turkey', flag: '🇹🇷' },
  { code: 'TM', dialCode: '+993', name: 'Turkmenistan', flag: '🇹🇲' },
  { code: 'TC', dialCode: '+1649', name: 'Turks and Caicos Islands', flag: '🇹🇨' },
  { code: 'TV', dialCode: '+688', name: 'Tuvalu', flag: '🇹🇻' },
  { code: 'UG', dialCode: '+256', name: 'Uganda', flag: '🇺🇬' },
  { code: 'UA', dialCode: '+380', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'AE', dialCode: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸' },
  { code: 'UY', dialCode: '+598', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'UZ', dialCode: '+998', name: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'VU', dialCode: '+678', name: 'Vanuatu', flag: '🇻🇺' },
  { code: 'VA', dialCode: '+39', name: 'Vatican City', flag: '🇻🇦' },
  { code: 'VE', dialCode: '+58', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'VN', dialCode: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'VG', dialCode: '+1284', name: 'Virgin Islands (British)', flag: '🇻🇬' },
  { code: 'VI', dialCode: '+1340', name: 'Virgin Islands (US)', flag: '🇻🇮' },
  { code: 'YE', dialCode: '+967', name: 'Yemen', flag: '🇾🇪' },
  { code: 'ZM', dialCode: '+260', name: 'Zambia', flag: '🇿🇲' },
  { code: 'ZW', dialCode: '+263', name: 'Zimbabwe', flag: '🇿🇼' }
];

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
  // First install - set bot to paused by default so user can configure settings
  if (!process.env.BOT_ENABLED) {
    process.env.BOT_ENABLED = 'false';
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
    NOTIFICATION_TYPE: process.env.NOTIFICATION_TYPE || 'group',
    CONTACT_COUNTRY_CODE: process.env.CONTACT_COUNTRY_CODE,
    CONTACT_PHONE_NUMBER: process.env.CONTACT_PHONE_NUMBER,
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
  config.NOTIFICATION_TYPE = process.env.NOTIFICATION_TYPE || 'group';
  config.CONTACT_COUNTRY_CODE = process.env.CONTACT_COUNTRY_CODE;
  config.CONTACT_PHONE_NUMBER = process.env.CONTACT_PHONE_NUMBER;
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
  
  // Notification type configuration
  NOTIFICATION_TYPE: process.env.NOTIFICATION_TYPE || 'group', // 'group' or 'contact'
  CONTACT_COUNTRY_CODE: process.env.CONTACT_COUNTRY_CODE,
  CONTACT_PHONE_NUMBER: process.env.CONTACT_PHONE_NUMBER,
  
  CHECK_INTERVAL_MS: parseCheckInterval(),
  
  // Robosats API Configuration
  ROBOSATS_USE_MOCK: process.env.ROBOSATS_USE_MOCK === 'true',
  ROBOSATS_API_URL: process.env.ROBOSATS_API_URL,
  ROBOSATS_COORDINATORS: process.env.ROBOSATS_COORDINATORS,
  ROBOSATS_ONION_URL: process.env.ROBOSATS_ONION_URL,
  
  AVAILABLE_COORDINATORS,
  CURRENCY_MAP,
  COORDINATOR_MAP,
  COUNTRY_CODES,
  
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
  validateNotificationConfig,
  
  // Event emitter for config changes
  configEmitter
};
