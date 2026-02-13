const fs = require('fs');
const config = require('./config');

class ConversationManager {
  constructor() {
    this.conversations = this.loadConversations();
    // Clean expired states every hour
    setInterval(() => this.cleanExpiredStates(), 60 * 60 * 1000);
    // Run selective cleanup every 24 hours
    setInterval(() => this.selectiveCleanup(), 24 * 60 * 60 * 1000);
  }

  // Helper method to detect if userId is a group chat
  isGroupChat(userId) {
    return userId.includes('@g.us') || userId.includes('@broadcast');
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
    // Skip storing group messages
    if (this.isGroupChat(userId)) {
      console.log(`[CONV:${userId}] Skipping group message storage`);
      return;
    }

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

    // Keep only last 50 AI messages per user, but preserve ALL user messages
    if (isBot) {
      const botMessages = this.conversations[userId].filter(msg => msg.isBot);
      if (botMessages.length > 50) {
        // Count how many bot messages to remove
        const botMessagesToRemove = botMessages.length - 50;
        let removedCount = 0;
        
        // Remove oldest bot messages while preserving user messages
        this.conversations[userId] = this.conversations[userId].filter(msg => {
          if (msg.isBot && removedCount < botMessagesToRemove) {
            removedCount++;
            return false; // Remove this bot message
          }
          return true; // Keep user messages and recent bot messages
        });
        
        console.log(`[CONV:${userId}] Trimmed to last 50 bot messages (removed ${removedCount} old bot responses)`);
      }
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

  // Selective cleanup function for conversations older than 30 days
  selectiveCleanup() {
    console.log('[CLEANUP] Starting selective cleanup process...');
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    let cleanedUsers = 0;
    let preservedUsers = 0;

    // Load userData to check for active booking sessions
    let userData = {};
    try {
      const userDataPath = './userData.json';
      if (fs.existsSync(userDataPath)) {
        userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      }
    } catch (error) {
      console.error('[CLEANUP] Error loading userData:', error);
    }

    for (const userId in this.conversations) {
      // Remove group chats entirely
      if (this.isGroupChat(userId)) {
        console.log(`[CLEANUP] Removing group chat: ${userId}`);
        delete this.conversations[userId];
        cleanedUsers++;
        continue;
      }

      // Check if user has active booking session (within last 7 days)
      const hasActiveBooking = userData[userId] && 
        userData[userId].requestTimestamp && 
        (Date.now() - userData[userId].requestTimestamp) < (7 * 24 * 60 * 60 * 1000);

      if (hasActiveBooking) {
        console.log(`[CLEANUP] Preserving user with active booking: ${userId}`);
        preservedUsers++;
        continue;
      }

      // Check if all messages are older than 30 days
      const userMessages = this.conversations[userId];
      const hasRecentMessages = userMessages.some(msg => {
        const messageDate = new Date(msg.timestamp);
        return messageDate > thirtyDaysAgo;
      });

      if (!hasRecentMessages) {
        console.log(`[CLEANUP] Removing old conversation for user: ${userId}`);
        delete this.conversations[userId];
        cleanedUsers++;
      } else {
        // Keep only recent messages (last 30 days)
        const originalCount = userMessages.length;
        this.conversations[userId] = userMessages.filter(msg => {
          const messageDate = new Date(msg.timestamp);
          return messageDate > thirtyDaysAgo;
        });
        
        if (this.conversations[userId].length < originalCount) {
          console.log(`[CLEANUP] Trimmed old messages for user: ${userId} (${originalCount} -> ${this.conversations[userId].length})`);
        }
        preservedUsers++;
      }
    }

    this.saveConversations();
    console.log(`[CLEANUP] Cleanup completed. Removed: ${cleanedUsers} users, Preserved: ${preservedUsers} users`);
  }
}

module.exports = new ConversationManager();
