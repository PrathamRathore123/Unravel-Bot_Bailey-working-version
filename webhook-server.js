const express = require('express');
const cors = require('cors');
const BotFlow = require('./botFlow');
const conversationManager = require('./conversationManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to format phone number for WhatsApp
function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let formatted = phone.replace(/\D/g, '');
    
    // Add country code if not present (assuming India)
    if (!formatted.startsWith('91')) {
        formatted = '91' + formatted;
    }
    
    // Remove leading 91 if double-added
    if (formatted.startsWith('9191')) {
        formatted = formatted.substring(2);
    }
    
    return formatted + '@s.whatsapp.net';
}

// Helper function to send message via Baileys socket
async function sendMessageViaBaileys(phone, message) {
    try {
        // Get the global socket from index.js
        const sock = global.sock;
        if (!sock) {
            console.error('WhatsApp socket not available. Is bot running?');
            return false;
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        console.log(`Sending message via Baileys to ${formattedPhone}`);
        
        await sock.sendMessage(formattedPhone, { text: message });
        console.log('Message sent successfully via Baileys');
        return true;
    } catch (error) {
        console.error('Failed to send message via Baileys:', error.message);
        return false;
    }
}

// Webhook endpoint to receive notifications from backend
app.post('/webhook', async (req, res) => {
    console.log('Received webhook from backend:', JSON.stringify(req.body, null, 2));
    
    try {
        // Handle different types of webhook notifications
        if (req.body.type === 'vendor_quotes_collected' || (req.body.quote_request_id && req.body.quotes)) {
            // Handle vendor quotes notification
            console.log('Processing vendor quotes webhook');
            
            // Extract customer phone number
            const customerPhone = req.body.customer_phone;
            if (customerPhone) {
                console.log(`Phone format: ${customerPhone} -> ${formatPhoneNumber(customerPhone)}`);
                
                // Extract price from webhook - use total_price first, then grand_total
                const price = req.body.total_price || req.body.grand_total || 'TBD';
                
                // Use BotFlow to handle the quote message
                const quoteResponse = BotFlow.handleQuoteMessage(customerPhone, price, req.body.quotes || [], req.body);
                
                if (quoteResponse && quoteResponse.messages) {
                    console.log('Sending quote messages to customer:', customerPhone);
                    
                    // Actually send messages via Baileys
                    for (const msg of quoteResponse.messages) {
                        try {
                            console.log('Sending message:', msg.substring(0, 100) + '...');
                            const success = await sendMessageViaBaileys(customerPhone, msg);
                            if (success) {
                                console.log('Message sent successfully to', customerPhone);
                                // Store bot message in conversation history
                                conversationManager.addMessage(formatPhoneNumber(customerPhone), msg, true);
                            } else {
                                console.error('Failed to send message to', customerPhone);
                            }
                        } catch (error) {
                            console.error('Error sending message to', customerPhone, ':', error.message);
                        }
                    }
                }
            }
        } else if (req.body.phone) {
            // Handle booking confirmation webhook
            console.log('Processing booking confirmation webhook');
            const customerPhone = req.body.phone;
            
            console.log(`Phone format: ${customerPhone} -> ${formatPhoneNumber(customerPhone)}`);
            
            // Send booking finalized message
            const confirmationMessage = `*BOOKING FINALIZED!*

*Your booking request has been successfully submitted!*

*Booking Details:*
*Name:* ${req.body.name || 'Customer'}
*Phone:* ${customerPhone}
*Destination:* ${req.body.destination || 'Package'}
*Travel Date:* ${req.body.travel_date || 'TBD'}
*Guests:* ${req.body.guests || 1}

*Our team will review your details and contact you shortly with final pricing.*

*Thank you for choosing Unravel Experience!*

*Please keep this chat open for updates.*`;

            console.log('Sending confirmation to:', customerPhone);
            
            // Actually send the confirmation message via Baileys
            try {
                const success = await sendMessageViaBaileys(customerPhone, confirmationMessage);
                if (success) {
                    console.log('Confirmation message sent successfully to', customerPhone);
                    // Store bot message in conversation history
                    conversationManager.addMessage(formatPhoneNumber(customerPhone), confirmationMessage, true);
                } else {
                    console.error('Failed to send confirmation message to', customerPhone);
                }
            } catch (error) {
                console.error('Error sending confirmation message to', customerPhone, ':', error.message);
            }
        }
        
        res.status(200).json({ status: 'success', message: 'Webhook received successfully' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ status: 'error', message: 'Failed to process webhook' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Bot webhook server is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Bot webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
