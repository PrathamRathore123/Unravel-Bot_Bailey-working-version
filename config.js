const path = require('path');

module.exports = {
  // Database configuration
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'travel_bot',
  DB_PORT: process.env.DB_PORT || 3306,

  // API Keys

  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '83798e8eaamshaa73fa9639a127dp131ec8jsn22028caddb75',

  // File paths
  TRAVEL_PACKAGES_FILE: path.join(__dirname, 'travelPackages.json'),
  CONVERSATIONS_FILE: path.join(__dirname, 'conversations.json'),
  TOKENS_DIR: path.join(__dirname, 'tokens'),

  // Bot configuration
  BOT_NUMBER: process.env.BOT_NUMBER || '',
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token',
  SUPPORT_PHONE: process.env.SUPPORT_PHONE || '+91-9886174621',
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || 'support@unravelexperience.com',
  EXECUTIVE_PHONE: process.env.EXECUTIVE_PHONE || '7770974354',


  // Server configuration
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',

  // Vendor API endpoints (example)
  VENDOR_API_BASE: process.env.VENDOR_API_BASE || 'http://localhost:8000/api',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Booking configuration
  MAX_BOOKING_TIMEOUT: 72 * 60 * 60 * 1000, // 72 hours in milliseconds
  BOOKING_CONFIRMATION_DELAY: 5 * 60 * 1000, // 5 minutes in milliseconds
  
  
};
