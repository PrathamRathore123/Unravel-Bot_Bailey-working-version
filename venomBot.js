const venom = require('venom-bot');
const MessageHandler = require('./messageHandler');

class VenomBot {
  constructor() {
    this.client = null;
    this.messageHandler = new MessageHandler();
    this.isInitialized = false;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      console.log('Initializing Venom Bot...');

      venom
        .create(
          'session-venom',
          (base64Qr, asciiQR) => {
            console.log('Scan QR Code:');
            console.log(asciiQR);
          },
          (statusSession) => {
            console.log('Status:', statusSession);
          },
          {
            multidevice: true,
            headless: false,
            useChrome: false,
            logQR: true,
            browserArgs: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-web-security',
              '--disable-features=IsolateOrigins,site-per-process'
            ],
            createPathFileToken: true,
            waitForLogin: true,
            disableWelcome: true,
            updatesLog: false,
            autoClose: 60000,
            puppeteerOptions: {
              timeout: 60000
            }
          }
        )
        .then((client) => {
          this.client = client;
          this.isInitialized = true;
          console.log('Venom client created!');

          // Setup listeners immediately
          console.log('Setting up Venom listeners...');

          client.onMessage(async (message) => {
            console.log('\n========== VENOM MESSAGE RECEIVED ==========');
            console.log('RAW MESSAGE OBJECT:', JSON.stringify(message, null, 2));
            console.log('From:', message.from);
            console.log('Body:', message.body);
            console.log('Type:', message.type);
            console.log('FromMe:', message.fromMe);
            console.log('Timestamp:', message.timestamp);
            console.log('====================================\n');

            // Always log the message first, regardless of filtering
            await this.handleIncomingMessage(message);
          });

          console.log('Venom listeners ready!');
          resolve(client);
        })
        .catch((error) => {
          console.error('Venom error:', error.message);
          reject(error);
        });
    });
  }

  async handleIncomingMessage(message) {
    try {
      console.log('\n========== MESSAGE ==========');
      console.log('From:', message.from);
      console.log('Body:', message.body);
      console.log('Type:', message.type);
      console.log('================================\n');

      if (message.fromMe || message.type !== 'chat') {
        return;
      }

      const convertedMessage = {
        from: message.from.replace('@c.us', ''),
        body: message.body,
        fromMe: message.fromMe,
        timestamp: message.timestamp,
        id: message.id
      };

      await this.messageHandler.handleIncomingMessage(convertedMessage);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async sendMessage(to, message) {
    const recipient = to.includes('@c.us') ? to : `${to}@c.us`;
    return await this.client.sendText(recipient, message);
  }

  async sendTemplateMessage(to, templateName) {
    const templates = { 'hello_world': 'Hello! Welcome to our service.' };
    return await this.sendMessage(to, templates[templateName] || templateName);
  }

  isReady() {
    return this.client !== null && this.isInitialized;
  }
}

module.exports = VenomBot;
