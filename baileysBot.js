const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Create auth directory if it doesn't exist
const authDir = path.join(__dirname, 'auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

class BaileysBot {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.authState = null;
  }

  async initialize() {
    console.log(' Initializing Baileys WhatsApp Bot...');

    // Load or create auth state
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    this.authState = state;

    // Create socket connection
    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }),
      browser: ['WhatsApp Bot', 'Chrome', '1.0.0']
    });

    // Handle connection updates
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(' Scan this QR code with WhatsApp:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(' Connection closed due to:', lastDisconnect?.error?.message || 'Unknown error');

        if (shouldReconnect) {
          console.log(' Reconnecting...');
          setTimeout(() => this.initialize(), 5000);
        } else {
          console.log(' Logged out. Please scan QR code again.');
        }
      } else if (connection === 'open') {
        console.log(' WhatsApp connected successfully!');
        this.isConnected = true;
      }
    });

    // Handle credential updates
    this.sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && !msg.messageStubType) {
        await this.handleIncomingMessage(msg);
      }
    });

    return this.sock;
  }

  async handleIncomingMessage(message) {
    try {
      // Extract message content
      const messageType = Object.keys(message.message || {})[0];
      let messageBody = '';

      switch (messageType) {
        case 'conversation':
          messageBody = message.message.conversation;
          break;
        case 'extendedTextMessage':
          messageBody = message.message.extendedTextMessage.text;
          break;
        case 'imageMessage':
          messageBody = message.message.imageMessage.caption || '[Image]';
          break;
        case 'videoMessage':
          messageBody = message.message.videoMessage.caption || '[Video]';
          break;
        case 'audioMessage':
          messageBody = '[Audio]';
          break;
        case 'documentMessage':
          messageBody = message.message.documentMessage.caption || '[Document]';
          break;
        case 'stickerMessage':
          messageBody = '[Sticker]';
          break;
        default:
          messageBody = '[Unsupported message type]';
      }

      // Skip empty messages
      if (!messageBody || messageBody.trim() === '') {
        return;
      }

      // Extract sender info
      const sender = message.key.remoteJid;
      const senderName = message.pushName || 'Unknown';

      // Log received message
      console.log('\nMESSAGE RECEIVED:');
      console.log(`From: ${senderName} (${sender})`);
      console.log(`Type: ${messageType}`);
      console.log(`Body: ${messageBody}`);
      console.log(`Timestamp: ${new Date(message.messageTimestamp * 1000).toLocaleString()}`);
      console.log('─'.repeat(50));

      // Echo functionality removed - bot will not automatically reply with echo

    } catch (error) {
      console.error('Error handling message:', error.message);
    }
  }

  async sendMessage(to, text) {
    try {
      if (!this.isConnected || !this.sock) {
        throw new Error('Bot is not connected');
      }

      const result = await this.sock.sendMessage(to, { text });
      console.log(`Message sent to ${to}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      return result;
    } catch (error) {
      console.error('Failed to send message:', error.message);
      throw error;
    }
  }

  async sendTemplateMessage(to, templateName) {
    const templates = {
      'hello_world': 'Hello! Welcome to our WhatsApp Bot service.',
      'greeting': 'Hi there! How can I help you today?'
    };

    const message = templates[templateName] || templateName;
    return await this.sendMessage(to, message);
  }

  async sendDocument(to, filePath, fileName, caption = '') {
    try {
      if (!this.isConnected || !this.sock) {
        throw new Error('Bot is not connected');
      }

      const fs = require('fs');
      const path = require('path');

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = this.getMimeType(fileName);

      const result = await this.sock.sendMessage(to, {
        document: fileBuffer,
        mimetype: mimeType,
        fileName: fileName,
        caption: caption
      });

      console.log(`Document sent to ${to}: ${fileName}`);
      return result;
    } catch (error) {
      console.error('Failed to send document:', error.message);
      throw error;
    }
  }

  getMimeType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  isReady() {
    return this.isConnected && this.sock !== null;
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.sock.end();
      this.isConnected = false;
      console.log('Disconnected from WhatsApp');
    }
  }
}

module.exports = BaileysBot;
