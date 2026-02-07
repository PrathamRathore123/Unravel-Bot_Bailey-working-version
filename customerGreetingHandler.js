const apiConnector = require('./apiConnector');
const config = require('./config');
const { sendMessage } = require('./whatsapp');
const conversationManager = require('./conversationManager');

class CustomerGreetingHandler {
  constructor() {
  }

  normalizePhoneNumber(phone) {
    if (!phone) return '';
    let normalized = phone;
    // Remove @c.us suffix if present
    if (normalized.includes('@')) {
      normalized = normalized.replace(/@.*$/, '');
    }
    // Remove any non-digit characters
    normalized = normalized.replace(/[^0-9]/g, '');
    // WhatsApp Cloud API expects numbers without + sign
    return normalized;
  }

  async handleGreeting(msg, customerData = null) {
    if (msg.fromMe) return false;

    // Extract phone number for customer lookup
    const phoneNumber = this.normalizePhoneNumber(msg.from);

    // Use provided customer data (already cached from messageHandler)
    // No need to fetch again as it's already provided

    // Check if message is a greeting
    if (this.isGreeting(msg.body)) {
      let greetingMessage = config.GREETING_MESSAGE;

      console.log(`Sending greeting`);
      try {
        await sendMessage(phoneNumber, greetingMessage);
        conversationManager.addMessage(msg.from, msg.body, false);
        conversationManager.addMessage(msg.from, greetingMessage, true);
        return true;
      } catch (error) {
        console.error('Greeting send failed:', error.message);
        conversationManager.addMessage(msg.from, msg.body, false);
        return false;
      }
    }

    return false; // Not a greeting, continue with normal flow
  }

  isGreeting(text) {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const lowerText = text.toLowerCase().trim();
    
    // Check if the message is only a greeting (or greeting with basic punctuation)
    return greetings.some(greet => {
      const greetPattern = new RegExp(`^\\s*${greet}\\s*[.!?]*\\s*$`, 'i');
      return greetPattern.test(lowerText);
    });
  }

  // Method to get customer data for use in other handlers
  async getCustomerData(phoneNumber) {
    return await apiConnector.getCustomerData(phoneNumber);
  }
}

module.exports = CustomerGreetingHandler;
