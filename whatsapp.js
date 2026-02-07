const axios = require('axios');
require('dotenv').config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Global set to track processed message IDs for deduplication
const processedMessageIds = new Set();

// Rate limiting: track last message time per user
const userLastMessageTime = new Map();
const MESSAGE_RATE_LIMIT = 2000; // 2 seconds between messages from same user

async function sendTextMessage(to, text) {
  // Validate environment variables
  if (!WHATSAPP_TOKEN) {
    throw new Error('WHATSAPP_TOKEN environment variable is not set');
  }
  if (!PHONE_NUMBER_ID) {
    throw new Error('PHONE_NUMBER_ID environment variable is not set');
  }

  console.log(`Sending to ${to}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

  try {
    const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: {
        body: text
      }
    };
    const headers = {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(url, data, { headers });
    console.log('Message sent');
    return response.data;
  } catch (error) {
    console.error('Send failed:', error.response?.data?.error?.message || error.message);
    throw error;
  }
}

async function sendTemplateMessage(to, templateName, languageCode = 'en_US') {
  // Sanitize "to" parameter: strip @c.us and any non-digit characters, then add country code
  let sanitizedTo = String(to || '');
  if (sanitizedTo.includes('@')) sanitizedTo = sanitizedTo.replace(/@.*$/, '');
  sanitizedTo = sanitizedTo.replace(/[^0-9]/g, '');

  // Add country code (+91 for India) if not present
  if (!sanitizedTo.startsWith('+')) {
    sanitizedTo = '+91' + sanitizedTo;
  }

  try {
    const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to: sanitizedTo,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        }
      }
    };
    const headers = {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    };

    console.log(`SENDING TEMPLATE MESSAGE to ${sanitizedTo}: ${templateName}`);

    const response = await axios.post(url, data, { headers });
    console.log('Template message sent successfully');
    return response.data;
  } catch (error) {
    console.error('Error sending template message:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Backward compatibility - keep the old function name
async function sendMessage(to, text) {
  return await sendTextMessage(to, text);
}

async function handleWebhook(req, res) {
  const body = req.body;

  console.log('\n========== WEBHOOK RECEIVED ==========');
  console.log('Time:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Object:', body?.object || 'unknown');
  console.log('========================================\n');
  
  // Debug: Log full webhook body for troubleshooting
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
    console.log('Incoming Messages:', JSON.stringify(body.entry[0].changes[0].value.messages, null, 2));
  } else {
    console.log('No messages found in webhook body');
    console.log('Full body:', JSON.stringify(body, null, 2));
  }

  // Check if this is a webhook verification request
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WEBHOOK_AUTH_TOKEN) {
    console.log('WEBHOOK VERIFICATION REQUEST - Token matches');
    res.status(200).send(req.query['hub.challenge']);
    return;
  }

  // Check if this is a backend webhook notification (quote data, etc.)
  if (body && typeof body === 'object' && !body.object) {
    // This is likely a backend webhook notification
    console.log('Received backend webhook notification:', JSON.stringify(body, null, 2));

    // Handle different types of backend notifications
    if (body.type === 'vendor_quotes_complete' || (body.quote_request_id && body.quotes)) {
      // This is a vendor quotes notification
      console.log('Processing vendor_quotes_complete webhook');
      if (global.messageHandler) {
        try {
          await global.messageHandler.handleVendorQuotes(body);
          console.log('Vendor quotes processed successfully');
        } catch (error) {
          console.error('Error processing vendor quotes webhook:', error);
        }
      } else {
        console.error('Global message handler not available');
      }
    } else {
      console.log('Unknown backend webhook type:', Object.keys(body));
      console.log('Webhook body:', JSON.stringify(body, null, 2));
    }

    res.status(200).send('OK');
    return;
  }

  // Process incoming WhatsApp messages
  if (body.object === 'whatsapp_business_account') {
    // Respond immediately to prevent retries
    res.status(200).send('OK');
    
    if (!body.entry || !Array.isArray(body.entry)) {
      console.log('Invalid WhatsApp webhook structure: missing or invalid entry array');
      return;
    }

    body.entry.forEach(entry => {
      if (!entry.changes || !Array.isArray(entry.changes)) {
        console.log('Invalid WhatsApp webhook structure: missing or invalid changes array for entry:', entry);
        return;
      }

      entry.changes.forEach(change => {
        if (change.field === 'messages') {
          // Check if this contains actual messages
          if (change.value && change.value.messages && Array.isArray(change.value.messages)) {
            console.log(`Processing ${change.value.messages.length} message(s)`);

            change.value.messages.forEach(async (message) => {
              console.log('\nProcessing message:', message.id);
              console.log('   From:', message.from);
              console.log('   Type:', message.type);
              console.log('   Timestamp:', message.timestamp);
              // Skip messages from the bot itself (check if from matches our phone number)
              if (message.from === PHONE_NUMBER_ID) {
                console.log('Skipping bot message (from matches PHONE_NUMBER_ID)');
                return;
              }

              // Handle different message types
              let messageBody = '';
              if (message.text && message.text.body) {
                messageBody = message.text.body;
              } else if (message.text) {
                messageBody = message.text;
              } else if (message.type === 'text' && message.text) {
                messageBody = message.text.body || message.text;
              } else {
                console.log('Skipping non-text message:', message.type);
                return; // Skip non-text messages for now
              }

              // Convert Meta API message format to Web.js-like format for compatibility
              const convertedMessage = {
                from: message.from, // Phone number (e.g., "1234567890")
                body: messageBody,
                fromMe: message.from === PHONE_NUMBER_ID,
                timestamp: message.timestamp,
                id: message.id
              };

              console.log(`Message from ${message.from}: "${messageBody}"`);

              // Skip old messages (older than 5 minutes)
              const messageTime = parseInt(message.timestamp) * 1000; // Convert to milliseconds
              const currentTime = Date.now();
              const fiveMinutesAgo = currentTime - (5 * 60 * 1000);
              
              if (messageTime < fiveMinutesAgo) {
                console.log(`Skipping old message (${new Date(messageTime).toISOString()})`);
                return;
              } else {
                console.log(`Message is recent (${new Date(messageTime).toISOString()})`);
              }

              // Create comprehensive unique identifier for duplicate detection
              const messageId = convertedMessage.id || `${convertedMessage.from}_${convertedMessage.timestamp}_${convertedMessage.body.substring(0, 50)}`;
              
              // Check for duplicate message processing
              if (processedMessageIds.has(messageId)) {
                console.log(`Duplicate message ignored: ${messageId}`);
                return;
              } else {
                console.log(`New message, processing: ${messageId}`);
              }

              // Rate limiting: prevent rapid messages from same user
              const now = Date.now();
              const lastMessageTime = userLastMessageTime.get(convertedMessage.from) || 0;
              if (now - lastMessageTime < MESSAGE_RATE_LIMIT) {
                console.log(`Rate limited: ${convertedMessage.from} (${now - lastMessageTime}ms since last)`);
                return;
              } else {
                console.log(`Rate limit OK for ${convertedMessage.from}`);
              }
              userLastMessageTime.set(convertedMessage.from, now);

              // Add message ID to processed set BEFORE processing
              processedMessageIds.add(messageId);

              // Limit set size to prevent memory leaks
              if (processedMessageIds.size > 1000) {
                const tempArray = Array.from(processedMessageIds).slice(-500);
                processedMessageIds.clear();
                tempArray.forEach(id => processedMessageIds.add(id));
              }

              // Process the message using the message handler
              if (global.messageHandler) {
                try {
                  console.log(`Passing to message handler...`);
                  await global.messageHandler.handleIncomingMessage(convertedMessage);
                  console.log(`Message processed successfully`);
                } catch (error) {
                  console.error('Processing error:', error.message);
                  console.error('Stack:', error.stack);
                }
              } else {
                console.error('Message handler not initialized!');
              }
            });
          }
          // Check if this contains status updates (sometimes sent under 'messages' field)
          else if (change.value && change.value.statuses && Array.isArray(change.value.statuses)) {
            // Status updates - no action needed
          }
        }
      });
    });
  }
}

module.exports = {
  sendMessage,
  sendTextMessage,
  sendTemplateMessage,
  handleWebhook
};
