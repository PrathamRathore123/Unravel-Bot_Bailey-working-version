const express = require('express');
const cors = require('cors');
const axios = require('axios');
const config = require('./config');
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
            
            // Extract customer phone number and format it consistently
            const customerPhone = req.body.customer_phone;
            const formattedPhone = formatPhoneNumber(customerPhone);
            console.log(`Phone format: ${customerPhone} -> ${formattedPhone}`);
            
            if (customerPhone) {
                
                // Extract price from webhook - use total_price first, then grand_total
                const price = req.body.total_price || req.body.grand_total || 'TBD';
                
                // Use BotFlow to handle the quote message
                const quoteResponse = BotFlow.handleQuoteMessage(formattedPhone, price, req.body.quotes || [], req.body);
                
                if (quoteResponse && quoteResponse.messages) {
                    console.log('Sending quote messages to customer:', formattedPhone);
                    
                    // Actually send messages via Baileys
                    for (const msg of quoteResponse.messages) {
                        try {
                            console.log('Sending message:', msg.substring(0, 100) + '...');
                            const success = await sendMessageViaBaileys(formattedPhone, msg);
                            if (success) {
                                console.log('Message sent successfully to', formattedPhone);
                                // Store bot message in conversation history
                                conversationManager.addMessage(formattedPhone, msg, true);
                            } else {
                                console.error('Failed to send message to', formattedPhone);
                            }
                        } catch (error) {
                            console.error('Error sending message to', formattedPhone, ':', error.message);
                        }
                    }
                    
                    // Send executive notification after quotes are sent to customer
                    if (quoteResponse.sendExecutive && quoteResponse.executiveData) {
                        try {
                            console.log('Sending executive notification after quotes delivered');
                            const { userId: execUserId, userData } = quoteResponse.executiveData;
                            BotFlow.sendAdminNotification(execUserId, userData);
                        } catch (execError) {
                            console.error('Error sending executive notification:', execError.message);
                        }
                    }
                } else if (quoteResponse === null) {
                    console.log('Ignoring stale quote - no matching request ID found for:', formattedPhone);
                } else {
                    console.log('No quote response generated for:', formattedPhone);
                }
            }
        } else if (req.body.phone) {
            // Handle booking confirmation webhook
            console.log('Processing booking confirmation webhook');
            const customerPhone = req.body.phone;
            
            console.log(`Phone format: ${customerPhone} -> ${formatPhoneNumber(customerPhone)}`);
            
            // Store request ID in BotFlow immediately for quote matching
            const requestId = req.body.request_id;
            const formattedPhone = formatPhoneNumber(customerPhone);
            if (requestId) {
                BotFlow.storeRequestId(formattedPhone, requestId);
                console.log(`[REQUEST ID] Stored request ID ${requestId} for user ${customerPhone} (formatted as ${formattedPhone})`);
            }
            
            // Send booking finalized message
            const confirmationMessage = `*Your request has been successfully submitted*

*Booking Details:*
*Name:* ${req.body.name || 'Customer'}
*Phone:* ${customerPhone}
*Destination:* ${req.body.destination || 'Package'}
*Travel Date:* ${req.body.travel_date || 'TBD'}
*Guests:* ${req.body.guests || 1}${req.body.requirements && req.body.requirements !== 'No special requirements' ? `\n*Requirements:* ${req.body.requirements}` : ''}

*Our team will review your details and contact you shortly with pricing.*

*Thank you for choosing Unravel Experience!*

*Please keep this chat open for updates.*`;

            console.log('Sending confirmation to:', customerPhone);
            
            // Actually send confirmation message via Baileys
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

// Submit booking endpoint for frontend integration
app.post('/submit-booking', async (req, res) => {
    console.log('Received frontend booking submission:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate required fields
        const { name, email, phone, destination, travel_date, guests } = req.body;
        if (!name || !email || !phone || !destination || !travel_date || !guests) {
            return res.status(400).json({ error: 'Missing required fields: name, email, phone, destination, travel_date, guests' });
        }

        // Generate unique request ID using existing bot logic
        const requestId = `REQ_${Date.now()}_${phone.slice(-6)}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        console.log(`[FRONTEND BOOKING] Generated request ID: ${requestId} for phone: ${phone}`);

        // Prepare booking data for backend
        const bookingData = {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            destination: destination.trim(),
            travel_date: travel_date,
            guests: parseInt(guests) || 1,
            special_requests: 'none', // As specified for frontend bookings
            request_id: requestId
        };

        // Call backend API
        console.log('Calling backend with booking data...');
        const backendResponse = await axios.post(`${config.BACKEND_URL}/api/receive-customer-booking/`, bookingData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (backendResponse.status === 201) {
            console.log('Backend booking creation successful');

            // Store request ID in BotFlow for future quote matching
            const cleanPhone = formatPhoneNumber(phone).split('@')[0];
            BotFlow.storeRequestId(cleanPhone, requestId);
            console.log(`[REQUEST ID] Stored request ID ${requestId} for frontend user ${phone} (clean phone: ${cleanPhone})`);

            res.status(200).json({ success: true, request_id: requestId });
        } else {
            console.error('Backend returned error status:', backendResponse.status);
            res.status(500).json({ error: 'Backend error' });
        }
    } catch (error) {
        console.error('Error processing frontend booking submission:', error.message);
        if (error.response) {
            console.error('Backend error response:', error.response.data);
        }
        res.status(500).json({ error: 'Internal server error' });
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
