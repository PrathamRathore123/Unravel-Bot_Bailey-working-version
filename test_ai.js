require('dotenv').config();
const botFlow = require('./botFlow');

async function testAI() {
  console.log('Testing AI functionality...\n');
  console.log('OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? 'Configured' : 'Not found');
  const testUserId = 'test_user@s.whatsapp.net';

  console.log('Testing question detection:');
  const testMessages = [
    'how many days',
    'what is included?',
    'tell me about the accommodation',
    'ready for this package',
    'hello',
    'is there a pool?',
    'where is the hotel located?'
  ];
  
  testMessages.forEach(message => {
    const isQuestion = botFlow.isQuestion(message);
    console.log(`"${message}" -> ${isQuestion ? 'Question' : 'Not a question'}`);
  });
  
  console.log('\nTesting AI response for "how many days" (London package):');
  

  botFlow.userStates[testUserId] = 'start_booking';
  botFlow.userData[testUserId] = { selectedPackage: 'A London Christmas' };
  

  const mockConversationHistory = `Bot: **A London Christmas - Package Overview**
Customer: london
Bot: **Destination:** London, United Kingdom
**Duration:** 8 Nights | 9 Days
Customer: how many days`;
  

  botFlow.getConversationHistory = () => mockConversationHistory;
  
  try {
    const response = await botFlow.handleStartBooking(testUserId, 'how many days');
    console.log('AI Response:', response.messages[0]);
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\nTesting AI response for company question "what is unravel":');
  
  try {
    const companyResponse = await botFlow.handleStartBooking(testUserId, 'what is unravel');
    console.log('Company AI Response:', companyResponse.messages[0]);
  } catch (error) {
    console.error('Company Error:', error.message);
  }

  console.log('\nTesting AI response in COMPLETED state (after booking):');
  
  // Set up user state to simulate completed booking
  botFlow.userStates[testUserId] = 'completed';
  botFlow.userData[testUserId] = { selectedPackage: 'A London Christmas' };
  
  try {
    const completedResponse = await botFlow.handleCompleted(testUserId, 'tell me about my itinerary');
    console.log('Completed State AI Response:', completedResponse.messages[0]);
  } catch (error) {
    console.error('Completed State Error:', error.message);
  }
}

testAI().catch(console.error);
