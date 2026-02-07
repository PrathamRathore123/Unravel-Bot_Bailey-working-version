const fs = require('fs');
const config = require('./config');

class ConversationManager {
  constructor() {
    this.conversations = this.loadConversations();
    // Clean expired states every hour
    setInterval(() => this.cleanExpiredStates(), 60 * 60 * 1000);
  }

  loadConversations() {
    try {
      if (fs.existsSync(config.CONVERSATIONS_FILE)) {
        const data = fs.readFileSync(config.CONVERSATIONS_FILE, 'utf8');
        if (!data || data.trim() === '') {
          return {};
        }
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      console.error('Error loading conversations:', error);
      return {};
    }
  }

  saveConversations() {
    try {
      fs.writeFileSync(config.CONVERSATIONS_FILE, JSON.stringify(this.conversations, null, 2));
    } catch (error) {
      console.error('Error saving conversations:', error);
    }
  }

  addMessage(userId, message, isBot = false) {
    console.log(`[CONV:${userId}] Adding message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''} (Bot: ${isBot})`);
    
    if (!this.conversations[userId]) {
      this.conversations[userId] = [];
      console.log(`[CONV:${userId}] Created new conversation array`);
    }

    this.conversations[userId].push({
      timestamp: new Date().toISOString(),
      message: message,
      isBot: isBot
    });

    console.log(`[CONV:${userId}] Total messages: ${this.conversations[userId].length}`);

    // Keep only last 50 messages per user to prevent file from growing too large
    if (this.conversations[userId].length > 50) {
      this.conversations[userId] = this.conversations[userId].slice(-50);
      console.log(`[CONV:${userId}] Trimmed to last 50 messages`);
    }

    this.saveConversations();
  }

  getConversationHistory(userId, limit = 10) {
    console.log('DEBUG - Getting conversation history for userId:', userId);
    console.log('DEBUG - Available userIds:', Object.keys(this.conversations));
    
    if (!this.conversations[userId]) {
      console.log('DEBUG - No conversation found for userId:', userId);
      return [];
    }

    const history = this.conversations[userId].slice(-limit);
    console.log('DEBUG - Returning', history.length, 'messages for userId:', userId);
    return history;
  }

  getConversationContext(userId) {
    const history = this.getConversationHistory(userId, 20);
    return history.map(msg => `${msg.isBot ? 'Bot' : 'User'}: ${msg.message}`).join('\n');
  }

  storeQuoteData(userId, quoteData) {
    if (!this.conversations[userId]) {
      this.conversations[userId] = [];
    }

    // Store quote data as a special message type
    this.conversations[userId].push({
      timestamp: new Date().toISOString(),
      type: 'quote_data',
      data: quoteData,
      isBot: true
    });

    this.saveConversations();
  }

  getQuoteData(userId) {
    if (!this.conversations[userId]) {
      return null;
    }

    // Find the most recent quote data
    const quoteEntry = this.conversations[userId]
      .slice()
      .reverse()
      .find(msg => msg.type === 'quote_data');

    return quoteEntry ? quoteEntry.data : null;
  }

  // New: Store booking state separately from quote data to avoid overwriting quotes
  storeBookingState(userId, bookingState) {
    if (!this.conversations[userId]) {
      this.conversations[userId] = [];
    }

    // Remove any existing booking_state entries to keep only latest
    this.conversations[userId] = this.conversations[userId].filter(msg => msg.type !== 'booking_state');

    // If bookingState is null, this acts as a clear operation
    if (bookingState == null) {
      this.saveConversations();
      return;
    }

    this.conversations[userId].push({
      timestamp: new Date().toISOString(),
      type: 'booking_state',
      data: bookingState,
      isBot: true,
      expiresAt: Date.now() + (72 * 60 * 60 * 1000) // 72 hours
    });

    this.saveConversations();
  }

  getBookingState(userId) {
    if (!this.conversations[userId]) {
      return null;
    }

    const bookingEntry = this.conversations[userId]
      .slice()
      .reverse()
      .find(msg => msg.type === 'booking_state');

    // Check expiration
    if (bookingEntry && bookingEntry.expiresAt && Date.now() > bookingEntry.expiresAt) {
      this.storeBookingState(userId, null); // Clear expired state
      return null;
    }

    return bookingEntry ? bookingEntry.data : null;
  }

  cleanExpiredStates() {
    const now = Date.now();
    for (const userId in this.conversations) {
      this.conversations[userId] = this.conversations[userId].filter(msg => {
        if (msg.type === 'booking_state' && msg.expiresAt && now > msg.expiresAt) {
          return false;
        }
        return true;
      });
    }
    this.saveConversations();
  }
}

module.exports = new ConversationManager();
