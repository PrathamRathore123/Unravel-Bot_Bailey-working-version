require('dotenv').config();
const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const BotFlow = require('./botFlow');
const conversationManager = require('./conversationManager');

// Directory for storing authentication state (multi-file auth for session persistence)
const AUTH_DIR = './auth_info_baileys';

// Ensure the auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Concurrency control: Map to track per-user message processing
const userProcessingPromises = new Map();

/**
 * Main function to start the WhatsApp bot
 */
async function startBot() {
    // Load or create authentication state
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Create WhatsApp socket with Baileys
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            // Use cacheable signal key store for better performance
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        // Disable default QR printing, we'll handle it with qrcode-terminal
        printQRInTerminal: false,
        // Use pino for logging with minimal output
        logger: pino({ level: 'silent' }),
    });

    // Handle connection updates (QR code, connection status, reconnections)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Generate and display QR code in terminal when received
        if (qr) {
            console.log('Scan QR code below to authenticate:');
            qrcode.generate(qr, { small: true });
        }

        // Handle connection closure
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error?.message || 'Unknown reason');
            console.log('Reconnecting:', shouldReconnect);

            if (shouldReconnect) {
                startBot(); // Restart the bot
            }
        } else if (connection === 'open') {
            console.log('Successfully connected to WhatsApp');
        }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return; // Ignore messages without content

        // CRITICAL: Ignore messages from the bot itself to prevent infinite loops
        if (msg.key.fromMe) return;

        // Extract text content from various message types
        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            text = msg.message.extendedTextMessage.text;
        }

        // Ignore empty messages
        if (!text.trim()) return;

        // Get user ID for concurrency control
        const userId = msg.key.remoteJid;
        
        // Log received message clearly with user identification
        console.log(`Message from ${userId}: ${text}`);

        // CONCURRENCY CONTROL: Ensure only one message processes per user at a time
        if (userProcessingPromises.has(userId)) {
            console.log(`User ${userId} already has a message processing, queuing...`);
            // Wait for existing processing to complete
            try {
                await userProcessingPromises.get(userId);
            } catch (error) {
                console.log(`Previous processing for user ${userId} failed, continuing...`);
            }
        }

        // Create and store processing promise for this user
        const processingPromise = (async () => {
            try {
                // Store user message in conversation history
                conversationManager.addMessage(userId, text, false);

                // Get clean user ID (remove @s.whatsapp.net suffix for consistency)
                const cleanUserId = userId.split('@')[0];

                // Process message through the structured bot flow
                const flowResponse = await BotFlow.processMessage(cleanUserId, text);

                // Safety check: ensure flowResponse exists and has messages array
                if (!flowResponse || !flowResponse.messages || !Array.isArray(flowResponse.messages)) {
                    console.error('Invalid flow response:', flowResponse);
                    return;
                }

                // Send all messages in the response
                for (const message of flowResponse.messages) {
                    await sock.sendMessage(userId, { text: message });
                    
                    // Store bot message in conversation history
                    conversationManager.addMessage(userId, message, true);

                    // Add delay between multiple messages for better user experience
                    if (flowResponse.messages.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Log the response
                if (flowResponse.messages.length > 0) {
                    console.log(`Reply sent to ${userId}: ${flowResponse.messages[0].substring(0, 100)}${flowResponse.messages[0].length > 100 ? '...' : ''}`);
                }

            } catch (error) {
                console.error(`Error processing message from ${userId}:`, error);
                // Send a fallback error message
                try {
                    await sock.sendMessage(userId, { text: "I'm sorry, I encountered an error processing your message. Please try again." });
                } catch (sendError) {
                    console.error('Failed to send error message:', sendError);
                }
            } finally {
                // Clean up the processing promise when done
                userProcessingPromises.delete(userId);
            }
        })();

        // Store the processing promise
        userProcessingPromises.set(userId, processingPromise);
    });

    return sock;
}

// Start the bot
console.log('Starting WhatsApp Bot with Baileys...');
startBot().then(sock => {
    // Make socket available globally for webhook server and message handler
    global.sock = sock;
    global.botInstance = sock; // Add this for messageHandler compatibility
    console.log('Bot socket available globally for webhook server');
}).catch(err => {
    console.error('Failed to start bot:', err);
});
