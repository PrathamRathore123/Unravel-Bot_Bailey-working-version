#!/usr/bin/env node

require('dotenv').config();

console.log('Starting WhatsApp Web Bot with Webhook Server...');
console.log('=====================================================');

// Check for required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'];
const hasAIKey = requiredEnvVars.some(key => process.env[key]);

if (!hasAIKey) {
  console.warn('Warning: No AI API keys found. Bot will work but AI responses will be limited.');
  console.warn('   Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in your .env file for better responses.');
}

console.log('Environment check:');
console.log(`   AI Keys: ${hasAIKey ? 'OK' : 'MISSING'}`);
console.log(`   Backend URL: ${process.env.BACKEND_URL || 'Not set'}`);
console.log(`   Port: ${process.env.PORT || 3000}`);
console.log('=====================================================\n');

// Start both services
console.log('Starting WhatsApp Bot...');
require('./index.js');

console.log('Starting Webhook Server...');
require('./webhook-server.js');
