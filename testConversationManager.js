const conversationManager = require('./conversationManager');
const fs = require('fs');
const config = require('./config');

class ConversationManagerTester {
  constructor() {
    this.testUserId = 'test_user_' + Date.now();
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async runAllTests() {
    this.log('Starting Conversation Manager Tests...');
    
    try {
      await this.testMessageLimit();
      await this.testBookingStateExpiration();
      await this.testScheduledCleanup();
      await this.testQuoteDataStorage();
      await this.testConversationHistory();
      await this.testFilePersistence();
      
      this.generateTestReport();
    } catch (error) {
      this.log(`Test suite failed: ${error.message}`, 'error');
    }
  }

  async testMessageLimit() {
    this.log('Testing Message Limit (50 messages per user)...');
    
    // Clear any existing test data
    conversationManager.conversations[this.testUserId] = [];
    
    // Add 60 messages to test the limit
    for (let i = 1; i <= 60; i++) {
      conversationManager.addMessage(this.testUserId, `Test message ${i}`, i % 2 === 0);
    }
    
    const conversation = conversationManager.conversations[this.testUserId];
    const messageCount = conversation.filter(msg => msg.type !== 'quote_data' && msg.type !== 'booking_state').length;
    
    if (messageCount === 50) {
      this.log('✅ Message limit test PASSED - Exactly 50 messages kept', 'success');
    } else {
      this.log(`❌ Message limit test FAILED - Expected 50, got ${messageCount}`, 'error');
    }
    
    // Verify the last 50 messages are kept
    const lastMessage = conversation[conversation.length - 1];
    if (lastMessage.message === 'Test message 60') {
      this.log('✅ Message retention test PASSED - Last messages kept correctly', 'success');
    } else {
      this.log('❌ Message retention test FAILED - Wrong messages kept', 'error');
    }
  }

  async testBookingStateExpiration() {
    this.log('Testing Booking State Expiration...');
    
    // Add a booking state that expires immediately
    const expiredBookingState = {
      type: 'booking_state',
      data: { test: 'expired_state' },
      expiresAt: Date.now() - 1000 // Expired 1 second ago
    };
    
    conversationManager.conversations[this.testUserId].push(expiredBookingState);
    
    // Try to retrieve the expired state
    const retrievedState = conversationManager.getBookingState(this.testUserId);
    
    if (retrievedState === null) {
      this.log('✅ Booking state expiration test PASSED - Expired state cleared', 'success');
    } else {
      this.log('❌ Booking state expiration test FAILED - Expired state not cleared', 'error');
    }
    
    // Add a valid booking state
    const validBookingState = {
      package: 'Test Package',
      date: '2024-12-25',
      contact: '+1234567890'
    };
    
    conversationManager.storeBookingState(this.testUserId, validBookingState);
    const validRetrievedState = conversationManager.getBookingState(this.testUserId);
    
    if (validRetrievedState && validRetrievedState.package === 'Test Package') {
      this.log('✅ Valid booking state storage test PASSED', 'success');
    } else {
      this.log('❌ Valid booking state storage test FAILED', 'error');
    }
  }

  async testScheduledCleanup() {
    this.log('Testing Scheduled Cleanup...');
    
    // Add multiple expired states for different users
    const expiredUser1 = 'expired_user_1_' + Date.now();
    const expiredUser2 = 'expired_user_2_' + Date.now();
    const validUser = 'valid_user_' + Date.now();
    
    // Expired states
    conversationManager.storeBookingState(expiredUser1, { test: 'expired1' });
    conversationManager.storeBookingState(expiredUser2, { test: 'expired2' });
    
    // Manually set expiration to past
    conversationManager.conversations[expiredUser1].forEach(msg => {
      if (msg.type === 'booking_state') msg.expiresAt = Date.now() - 1000;
    });
    conversationManager.conversations[expiredUser2].forEach(msg => {
      if (msg.type === 'booking_state') msg.expiresAt = Date.now() - 1000;
    });
    
    // Valid state
    conversationManager.storeBookingState(validUser, { test: 'valid' });
    
    // Run cleanup manually
    conversationManager.cleanExpiredStates();
    
    // Check results
    const expiredState1 = conversationManager.getBookingState(expiredUser1);
    const expiredState2 = conversationManager.getBookingState(expiredUser2);
    const validState = conversationManager.getBookingState(validUser);
    
    if (expiredState1 === null && expiredState2 === null && validState !== null) {
      this.log('✅ Scheduled cleanup test PASSED - Expired states cleared, valid states kept', 'success');
    } else {
      this.log('❌ Scheduled cleanup test FAILED', 'error');
    }
    
    // Clean up test users
    delete conversationManager.conversations[expiredUser1];
    delete conversationManager.conversations[expiredUser2];
    delete conversationManager.conversations[validUser];
  }

  async testQuoteDataStorage() {
    this.log('Testing Quote Data Storage...');
    
    const quoteData = {
      package: 'Test Travel Package',
      price: '$999',
      duration: '7 days',
      inclusions: ['Hotel', 'Flights', 'Meals']
    };
    
    conversationManager.storeQuoteData(this.testUserId, quoteData);
    const retrievedQuote = conversationManager.getQuoteData(this.testUserId);
    
    if (retrievedQuote && retrievedQuote.package === 'Test Travel Package' && retrievedQuote.price === '$999') {
      this.log('✅ Quote data storage test PASSED', 'success');
    } else {
      this.log('❌ Quote data storage test FAILED', 'error');
    }
  }

  async testConversationHistory() {
    this.log('Testing Conversation History...');
    
    // Clear and add specific messages
    conversationManager.conversations[this.testUserId] = [];
    
    const testMessages = [
      { text: 'Hello', isBot: false },
      { text: 'Hi there!', isBot: true },
      { text: 'How are you?', isBot: false },
      { text: 'I am doing well, thank you!', isBot: true }
    ];
    
    testMessages.forEach(msg => {
      conversationManager.addMessage(this.testUserId, msg.text, msg.isBot);
    });
    
    // Test getting last 2 messages
    const history = conversationManager.getConversationHistory(this.testUserId, 2);
    
    if (history.length === 2 && 
        history[0].message === 'How are you?' && 
        history[1].message === 'I am doing well, thank you!') {
      this.log('✅ Conversation history test PASSED', 'success');
    } else {
      this.log('❌ Conversation history test FAILED', 'error');
    }
    
    // Test conversation context
    const context = conversationManager.getConversationContext(this.testUserId);
    if (context.includes('User: How are you?') && context.includes('Bot: I am doing well, thank you!')) {
      this.log('✅ Conversation context test PASSED', 'success');
    } else {
      this.log('❌ Conversation context test FAILED', 'error');
    }
  }

  async testFilePersistence() {
    this.log('Testing File Persistence...');
    
    // Add test data
    conversationManager.addMessage(this.testUserId, 'Persistence test message', false);
    
    // Force save
    conversationManager.saveConversations();
    
    // Clear in-memory data
    const originalData = conversationManager.conversations[this.testUserId];
    delete conversationManager.conversations[this.testUserId];
    
    // Reload from file
    conversationManager.conversations = conversationManager.loadConversations();
    
    const reloadedData = conversationManager.conversations[this.testUserId];
    
    if (reloadedData && reloadedData.some(msg => msg.message === 'Persistence test message')) {
      this.log('✅ File persistence test PASSED', 'success');
    } else {
      this.log('❌ File persistence test FAILED', 'error');
    }
  }

  generateTestReport() {
    this.log('\n' + '='.repeat(60));
    this.log('TEST REPORT SUMMARY');
    this.log('='.repeat(60));
    
    const successCount = this.testResults.filter(r => r.type === 'success').length;
    const errorCount = this.testResults.filter(r => r.type === 'error').length;
    const totalTests = successCount + errorCount;
    
    this.log(`Total Tests: ${totalTests}`);
    this.log(`Passed: ${successCount} ✅`);
    this.log(`Failed: ${errorCount} ❌`);
    this.log(`Success Rate: ${totalTests > 0 ? ((successCount / totalTests) * 100).toFixed(1) : 0}%`);
    
    if (errorCount > 0) {
      this.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.type === 'error')
        .forEach(r => this.log(`  - ${r.message}`));
    }
    
    this.log('\n' + '='.repeat(60));
    
    // Clean up test data
    this.cleanup();
  }

  cleanup() {
    this.log('Cleaning up test data...');
    delete conversationManager.conversations[this.testUserId];
    conversationManager.saveConversations();
    this.log('Test cleanup completed.');
  }

  // Performance test
  async performanceTest() {
    this.log('Running Performance Test...');
    
    const startTime = Date.now();
    const testUserCount = 100;
    const messagesPerUser = 30;
    
    // Create multiple users with messages
    for (let userId = 0; userId < testUserCount; userId++) {
      const testUserId = `perf_user_${userId}`;
      
      for (let msgId = 0; msgId < messagesPerUser; msgId++) {
        conversationManager.addMessage(testUserId, `Message ${msgId}`, msgId % 2 === 0);
      }
      
      // Add booking state for half the users
      if (userId % 2 === 0) {
        conversationManager.storeBookingState(testUserId, {
          package: `Package ${userId}`,
          contact: `+123456789${userId}`
        });
      }
    }
    
    const creationTime = Date.now() - startTime;
    
    // Test retrieval performance
    const retrievalStart = Date.now();
    for (let userId = 0; userId < testUserCount; userId++) {
      const testUserId = `perf_user_${userId}`;
      conversationManager.getConversationHistory(testUserId, 10);
      if (userId % 2 === 0) {
        conversationManager.getBookingState(testUserId);
      }
    }
    const retrievalTime = Date.now() - retrievalStart;
    
    // Test cleanup performance
    const cleanupStart = Date.now();
    conversationManager.cleanExpiredStates();
    const cleanupTime = Date.now() - cleanupStart;
    
    this.log(`Performance Results:`);
    this.log(`  - Created ${testUserCount} users with ${messagesPerUser} messages each: ${creationTime}ms`);
    this.log(`  - Retrieved data for all users: ${retrievalTime}ms`);
    this.log(`  - Cleanup operation: ${cleanupTime}ms`);
    
    // Clean up performance test data
    for (let userId = 0; userId < testUserCount; userId++) {
      delete conversationManager.conversations[`perf_user_${userId}`];
    }
    conversationManager.saveConversations();
    
    this.log('✅ Performance test completed', 'success');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new ConversationManagerTester();
  
  console.log('Choose test type:');
  console.log('1. Basic functionality tests');
  console.log('2. Performance test');
  console.log('3. All tests');
  
  // For automation, run all tests
  tester.runAllTests().then(() => {
    return tester.performanceTest();
  }).then(() => {
    console.log('\nAll tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = ConversationManagerTester;
