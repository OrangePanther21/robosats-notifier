const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../app.log');

// Enable debug logging via environment variable
const DEBUG_ENABLED = process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'debug';

const levels = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const levelColors = {
  debug: colors.gray,
  info: colors.cyan,
  warn: colors.yellow,
  error: colors.red
};

function log(level, ...args) {
  // Skip debug logs unless debug is enabled
  if (level === 'debug' && !DEBUG_ENABLED) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const levelLabel = levels[level];
  const message = `[${timestamp}] [${levelLabel}] ${args.join(' ')}`;
  
  // Colored console output
  const color = levelColors[level] || colors.reset;
  console.log(`${color}${message}${colors.reset}`);
  
  // Plain text file output (no ANSI codes)
  fs.appendFileSync(LOG_FILE, message + '\n');
}

module.exports = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args)
};
