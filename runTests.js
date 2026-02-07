const ConversationManagerTester = require('./testConversationManager');

console.log('🧪 Conversation Manager Test Suite');
console.log('=====================================\n');

const tester = new ConversationManagerTester();

// Run all tests
async function runTestSuite() {
  try {
    await tester.runAllTests();
    await tester.performanceTest();
    
    console.log('\n✅ All tests completed successfully!');
    console.log('Check the detailed report above for results.');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

runTestSuite();
