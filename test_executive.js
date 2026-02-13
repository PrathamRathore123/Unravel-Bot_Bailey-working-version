// Test script to send executive message
const BotFlow = require('./botFlow');

async function testExecutiveMessage() {
  const testUserId = 'test@s.whatsapp.net';
  const testUserData = {
    name: 'Test Customer',
    phone: '1234567890',
    selectedPackage: 'A New York Christmas',
    startDate: '15/12/2024',
    travelers: 2,
    requirements: 'Test requirements',
    quotes: [
      {
        vendor_name: 'Test Vendor',
        vendor_type: 'Hotel',
        original_price: '5000',
        markup_price: '5500',
        markup_amount: '500',
        quote_text: 'Test quote text'
      }
    ]
  };

  try {
    console.log('Sending test executive message...');
    await BotFlow.sendAdminNotification(testUserId, testUserData);
    console.log('Test executive message sent successfully');
  } catch (error) {
    console.error('Error sending test executive message:', error);
  }
}

testExecutiveMessage();
