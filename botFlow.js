const fs = require('fs');
const path = require('path');
const config = require('./config');
require('dotenv').config();

class BotFlow {
  constructor() {
    this.userStates = {}; 
    this.userData = {};
    this.packagesData = this.loadPackagesData();
    this.packageItineraries = this.loadPackageItineraries();
    this.lastMessageTime = {}; 
    this.MESSAGE_COOLDOWN = 1000; 
    this.googleDriveLinks = this.loadGoogleDriveLinks();
    
    // Load persistent user data
    this.loadUserData();
    
    // Start automatic cleanup scheduler
    this.startCleanupScheduler();
  }

  loadUserData() {
    try {
      const fs = require('fs');
      const userDataPath = './userData.json';
      
      if (fs.existsSync(userDataPath)) {
        const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
        this.userData = userData;
        console.log(`[USERDATA] Loaded ${Object.keys(userData).length} user records from userData.json`);
      } else {
        console.log('[USERDATA] No existing userData.json found, starting fresh');
      }
    } catch (error) {
      console.error('[USERDATA] Error loading user data:', error.message);
      this.userData = {};
    }
  }

  saveUserData() {
    const fs = require('fs');
    const path = require('path');
    const userDataPath = path.join(__dirname, 'userData.json');
    try {
      fs.writeFileSync(userDataPath, JSON.stringify(this.userData, null, 2));
    } catch (error) {
      console.error('Error saving user data:', error.message);
    }
  }

  startCleanupScheduler() {
    // Run selective cleanup every 24 hours at 2:00 AM
    const scheduleCleanup = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0); // 2:00 AM
      
      const timeUntilCleanup = tomorrow - now;
      
      setTimeout(() => {
        console.log('Starting scheduled selective cleanup...');
        const conversationManager = require('./conversationManager');
        conversationManager.selectiveCleanup();
        
        // Schedule next cleanup
        scheduleCleanup();
      }, timeUntilCleanup);
      
      console.log(`Next selective cleanup scheduled for: ${tomorrow.toLocaleString()}`);
    };
    
    // Start the scheduler
    scheduleCleanup();
  }

  loadGoogleDriveLinks() {
    try {
      const links = {
        'A London Christmas': process.env.LONDON_CHRISTMAS_PDF_LINK || '',
        'A New York Christmas': process.env.NEWYORK_CHRISTMAS_PDF_LINK || '',
        'A Parisian Noël': process.env.PARIS_NOEL_PDF_LINK || '',
        'A Week with Santa': process.env.SANTA_WEEK_PDF_LINK || ''
      };
      
      console.log('Google Drive links loaded from environment variables');
      return links;
    } catch (error) {
      console.error('Error loading Google Drive links:', error);
      return {};
    }
  }

  loadPackagesData() {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'travelPackages.json'), 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading packages data:', error);
      return { packages: [] };
    }
  }

  loadPackageItineraries() {
    const itineraries = {};
    try {
      // Load itinerary files
      const files = [
        'A London Christmas.txt',
        'A New York Christmas.txt', 
        'A Parisian Noël.txt',
        'A Week with Santa.txt'
      ];
      
      files.forEach(file => {
        try {
          const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
          const packageName = file.replace('.txt', '');
          itineraries[packageName.toLowerCase()] = content;
        } catch (err) {
          console.error(`Error loading ${file}:`, err);
        }
      });
    } catch (error) {
      console.error('Error loading itineraries:', error);
    }
    return itineraries;
  }

  formatDateForBackend(dateString) {
  
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return dateString; // Return original if format is unexpected
  }

  getDestinationFromPackage(packageName) {
    const destinations = {
      'A London Christmas': 'London, United Kingdom',
      'A New York Christmas': 'New York, USA',
      'A Parisian Noël': 'Paris, France',
      'A Week with Santa': 'Lapland, Finland'
    };
    return destinations[packageName] || 'Destination';
  }

  getDurationFromPackage(packageName) {
    const durations = {
      'A London Christmas': '8 Nights | 9 Days',
      'A New York Christmas': '4 Nights | 5 Days',
      'A Parisian Noël': '6 Nights | 7 Days',
      'A Week with Santa': '6 Nights | 7 Days'
    };
    return durations[packageName] || 'Duration';
  }

  getBestForFromPackage(packageName) {
    const bestFor = {
      'A London Christmas': 'Couples, families, solo travelers seeking festive winter magic',
      'A New York Christmas': 'Couples, families seeking iconic holiday experiences',
      'A Parisian Noël': 'Couples, romantics, culture lovers seeking winter charm',
      'A Week with Santa': 'Families with children, Christmas enthusiasts'
    };
    return bestFor[packageName] || 'Travelers seeking memorable experiences';
  }

  getPackageHighlights(packageName) {
    const highlights = {
      'A London Christmas': `• Royal history walking tour with champagne at Harrods
• Christmas lights tour with festive markets
• Private guide & driver for market exploration
• West End experiences and cultural discoveries`,
      
      'A New York Christmas': `• Iconic holiday attractions and landmarks
• Festive markets and seasonal events
• Broadway shows and entertainment
• Central Park winter experiences`,
      
      'A Parisian Noël': `• Christmas markets along Champs-Élysées
• Eiffel Tower holiday illuminations
• Louvre and cultural experiences
• Festive dining and winter romance`,
      
      'A Week with Santa': `• Santa Claus Village visit
• Husky sledding and reindeer encounters
• Northern Lights viewing
• Arctic activities and winter wonderland`
    };
    return highlights[packageName] || '• Premium accommodations and transfers\n• Expert local guides\n• Curated experiences\n• 24/7 support';
  }

  resetUserFlow(userId) {
    this.userStates[userId] = 'greeting';
    this.userData[userId] = {};
  }

  async processMessage(userId, message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Add user identification to all debug logs
    console.log(`[USER:${userId}] Processing message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    
    // CRITICAL: Rate limiting - prevent rapid successive messages
    const now = Date.now();
    if (this.lastMessageTime[userId] && (now - this.lastMessageTime[userId]) < this.MESSAGE_COOLDOWN) {
      console.log(`[USER:${userId}] Rate limiting: Ignoring message - too soon`);
      return { messages: [], nextState: this.userStates[userId] || 'greeting' };
    }
    this.lastMessageTime[userId] = now;
    
    // CRITICAL: Prevent bot from responding to its own messages
    if (this.isBotMessage(lowerMessage)) {
      console.log(`[USER:${userId}] Ignoring bot message`);
      return { messages: [], nextState: this.userStates[userId] || 'greeting' };
    }
    
    // Initialize user state if not exists
    if (!this.userStates[userId]) {
      console.log(`[USER:${userId}] Initializing user state`);
      this.resetUserFlow(userId);
    }

    const currentState = this.userStates[userId];
    console.log(`[USER:${userId}] Current state: ${currentState}`);
    
    let response;

    switch (currentState) {
      case 'greeting':
        response = await this.handleGreeting(userId, lowerMessage);
        break;
      
      case 'destination_selection':
        response = await this.handleDestinationSelection(userId, lowerMessage);
        break;
      
      case 'start_booking':
        response = await this.handleStartBooking(userId, message);
        break;
      
      case 'collect_name':
        response = this.handleCollectName(userId, message);
        break;
      
      case 'collect_travelers':
        response = this.handleCollectTravelers(userId, lowerMessage);
        break;
      
      case 'collect_date':
        response = this.handleCollectDate(userId, message);
        break;
      
      case 'collect_requirements':
        response = this.handleCollectRequirements(userId, message);
        break;
      
      case 'finalize':
        response = await this.handleFinalize(userId, lowerMessage);
        break;
      
      case 'confirm_booking':
        response = await this.handleConfirmBooking(userId, lowerMessage);
        break;
      
      case 'awaiting_quotes':
        response = await this.handleAwaitingQuotes(userId, message);
        break;
      
      default:
        this.resetUserFlow(userId);
        response = this.handleGreeting(userId, lowerMessage);
    }

    // Update the user state if response includes nextState
    if (response && response.nextState) {
      this.userStates[userId] = response.nextState;
      console.log(`[USER:${userId}] State updated to: ${response.nextState}`);
    }

    // CRITICAL: Always return a valid response object
    if (!response || !response.messages || !Array.isArray(response.messages)) {
      console.error(`[USER:${userId}] Invalid response in processMessage, using fallback:`, response);
      return {
        messages: ["I'm sorry, I encountered an error. Please try again."],
        nextState: 'greeting'
      };
    }

    console.log(`[USER:${userId}] Returning ${response.messages.length} message(s)`);
    return response;
  }

  // Helper function to detect bot messages
  isBotMessage(message) {
    const botMessagePatterns = [
      'if you\'re ready to proceed with booking',
      'please reply "ready for this package"',
      'hello! welcome to unravel experience',
      'here is the day-wise itinerary',
      '*booking summary*',
      '*booking finalized!*',
      '*booking request received!*',
      'please provide your full name',
      'how many travelers will be joining',
      'what\'s your preferred travel date',
      'any special requirements or preferences',
      'all details collected! reply with "finalize"',
      'great! i\'d be happy to help you book'
    ];
    
    return botMessagePatterns.some(pattern => message.includes(pattern));
  }

  // Helper function to detect if message is a question
  isQuestion(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check for question marks
    if (lowerMessage.includes('?')) {
      return true;
    }
    
    // Check for question words
    const questionWords = [
      'what', 'how', 'where', 'when', 'why', 'which', 'who', 'whose',
      'is', 'are', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
      'tell me', 'show me', 'explain', 'describe', 'details', 'information',
      'any', 'have to', 'need to', 'must', 'gonna', 'going to'
    ];
    
    // Check if message starts with question words
    const startsWithQuestion = questionWords.some(word => {
      return lowerMessage.startsWith(word) || lowerMessage.startsWith(word + ' ');
    });
    
    if (startsWithQuestion) {
      return true;
    }
    
    // Check for common question patterns
    const questionPatterns = [
      'how many', 'how much', 'how long', 'how far',
      'what is', 'what are', 'what does', 'what do', 'what about',
      'where is', 'where are', 'where can',
      'when does', 'when is', 'when can',
      'why is', 'why are', 'why do',
      'which is', 'which are', 'which do',
      'is there', 'are there', 'do you have', 'can i', 'do we', 'will we',
      'tell me about', 'show me', 'explain', 'describe',
      'have to pay', 'need to pay', 'extra charge', 'additional cost',
      'gonna get', 'going to get', 'included in'
    ];
    
    return questionPatterns.some(pattern => lowerMessage.includes(pattern));
  }

  // Helper function to get conversation history for AI context
  getConversationHistory(userId) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const conversationsPath = path.join(__dirname, 'conversations.json');
      if (!fs.existsSync(conversationsPath)) {
        return '';
      }
      
      const conversationsData = JSON.parse(fs.readFileSync(conversationsPath, 'utf8'));
      const userConversation = conversationsData[userId];
      
      if (!userConversation || !userConversation.messages || userConversation.messages.length === 0) {
        return '';
      }
      
      // Get last 10 messages for context
      const recentMessages = userConversation.messages.slice(-10);
      
      // Format conversation history
      const history = recentMessages.map(msg => {
        const sender = msg.sender === 'user' ? 'Customer' : 'Bot';
        return `${sender}: ${msg.message}`;
      }).join('\n');
      
      return history;
      
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return '';
    }
  }

  async handleGreeting(userId, message) {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    
    if (greetings.some(greeting => message.includes(greeting)) || message === '') {
      return {
        messages: [`Hey, I'm Unravel One. I'll help you put together your trip. We have a few winter experiences ready to go:

• London Christmas (8N/9D)
• New York Christmas (4N/5D) 
• Parisian Noël (6N/7D)
• A Week with Santa (6N/7D)

Which one fits you?`],
        nextState: 'destination_selection'
      };
    }
    
    // If not a greeting, treat as destination selection
    return await this.handleDestinationSelection(userId, message);
  }

  async handleDestinationSelection(userId, message) {
    const packageKeywords = {
      'london': 'A London Christmas',
      'new york': 'A New York Christmas', 
      'paris': 'A Parisian Noël',
      'santa': 'A Week with Santa'
    };

    let selectedPackage = null;
    for (const [keyword, packageName] of Object.entries(packageKeywords)) {
      if (message.includes(keyword)) {
        selectedPackage = packageName;
        break;
      }
    }

    if (selectedPackage) {
      // Merge with existing userData instead of overwriting
      if (!this.userData[userId]) {
        this.userData[userId] = {};
      }
      this.userData[userId].selectedPackage = selectedPackage;
      
      const itinerary = this.packageItineraries[selectedPackage.toLowerCase()] || 'Itinerary details coming soon...';
      
      // Package file mapping for PDFs
      const packageFileMap = {
        'A London Christmas': { pdfFile: 'Unravel x A London Christmas 🎄 .pdf', packageName: 'A London Christmas' },
        'A New York Christmas': { pdfFile: 'Unravel x A New York Christmas 🎄.pdf', packageName: 'A New York Christmas' },
        'A Parisian Noël': { pdfFile: 'Unravel x A Parisian Noel 🎄.pdf', packageName: 'A Parisian Noël' },
        'A Week with Santa': { pdfFile: 'Unravel x Lapland 🎅.pdf', packageName: 'A Week with Santa' }
      };

      const packageInfo = packageFileMap[selectedPackage];
      
      // Create conversational package description based on selection
      let packageDescription = '';
      switch(selectedPackage) {
        case 'A London Christmas':
          packageDescription = `London Christmas. Eight nights in the city during the holiday season - Christmas markets, private experiences, New Year's Eve. The full itinerary will be send to you.`;
          break;
        case 'A New York Christmas':
          packageDescription = `New York Christmas. Four nights in the Big Apple during the most magical time of year - iconic holiday sights, Broadway shows, festive dining. The full itinerary will be send to you.`;
          break;
        case 'A Parisian Noël':
          packageDescription = `Parisian Noël. Six nights in the City of Light during Christmas - romantic markets, Eiffel Tower illuminations, festive cuisine. The full itinerary will be send to you.`;
          break;
        case 'A Week with Santa':
          packageDescription = `A Week with Santa. Six nights in Lapland - Santa Claus Village, husky sledding, Northern Lights, Arctic wonderland.The full itinerary will be send to you.`;
          break;
        default:
          packageDescription = `${selectedPackage}. The full itinerary will be send to you.`;
      }
      
      // Send package overview message immediately
      const messages = [packageDescription];

      // Start PDF sending in background - completely separate from response
      if (packageInfo) {
        try {
          
          // Send PDF and then follow-up message completely in background
          this.sendPDFAndFollowUp(userId, packageInfo);
          
        } catch (error) {
          console.log('Error starting PDF send:', error.message);
        }
      }
      
      return {
        messages: messages,
        nextState: 'start_booking'
      };
    } else {
      // If no package matched, provide guidance
      return await this.handleNoPackageMatch();
    }
  }

    // New method to handle PDF and follow-up message completely in background
    async sendPDFAndFollowUp(userId, packageInfo) {
      try {
        // Send PDF first
        await this.sendPDFFile(userId, null, packageInfo);
        
        // Wait a moment to ensure PDF arrives first
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send follow-up message separately
        const { sendMessage } = require('./messageHandler');
        // Handle different WhatsApp ID formats (@lid, @s.whatsapp.net, @c.us)
        const cleanPhoneId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        await sendMessage(cleanPhoneId, 
          `Any questions about the trip?`
        );
        
      } catch (error) {
        console.log('Error in background PDF/follow-up:', error.message);
        
        // Still try to send follow-up even if PDF failed
        try {
          const { sendMessage } = require('./messageHandler');
          const cleanPhoneId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
          await sendMessage(cleanPhoneId, 
            `Any questions about the trip?`
          );
        } catch (followUpError) {
          console.log('Follow-up message also failed:', followUpError.message);
        }
      }
    }

  async handleNoPackageMatch() {
    return {
      messages: [`I'd be happy to help you choose! We have:

• London - A London Christmas
• New York - A New York Christmas  
• Paris - A Parisian Noël
• Santa - A Week with Santa

Which destination interests you?`],
      nextState: 'destination_selection'
    };
  }

  async handleStartBooking(userId, message) {
    // Accept multiple variations of "ready" responses
    const readyVariations = [
      'ready',
      'Ready',
      'READY',
      'ready to reserve',
      'Ready to reserve',
      'READY TO RESERVE',
      'ready to book',
      'Ready to book',
      'READY TO BOOK',
      'yes ready',
      'Yes ready',
      'YES READY',
      'let\'s do it',
      'Let\'s do it',
      'LET\'S DO IT',
      'book it',
      'Book it',
      'BOOK IT',
      'confirm',
      'Confirm',
      'CONFIRM'
    ];
    
    const normalizedMessage = message.trim();
    
    if (readyVariations.some(variation => variation.toLowerCase() === normalizedMessage.toLowerCase())) {
      return {
        messages: [
          `What's your name?`
        ],
        nextState: 'collect_name'
      };
    }

    // Check if user is asking a question about the package
    // AI only works in this state, not after user commits to booking
    if (this.isQuestion(message)) {
      try {
        const aiService = require('./aiService');
        const conversationHistory = this.getConversationHistory(userId);
        
        // Add package context to the message
        const selectedPackage = this.userData[userId]?.selectedPackage;
        let contextualMessage = message;
        if (selectedPackage) {
          contextualMessage = `User is asking about the "${selectedPackage}" package. Question: ${message}. Please provide a short, clear answer (1-2 sentences maximum) without detailed explanations.`;
          
          // Use the contextual package question method
          const aiResponse = await aiService.getContextualPackageAnswer(contextualMessage, selectedPackage, conversationHistory);
          return {
            messages: [aiResponse],
            nextState: 'start_booking'
          };
        }
        
        // Fallback to regular AI if no package selected
        const aiResponse = await aiService.getAIResponse(contextualMessage, userId, conversationHistory);
        
        return {
          messages: [aiResponse],
          nextState: 'start_booking'
        };
      } catch (error) {
        console.error('Error getting AI response:', error);
        return {
          messages: [`I'm having trouble answering that right now. Ready to reserve this? It's free to hold while we work out final details.

Or if you have questions about the trip, feel free to ask!`],
          nextState: 'start_booking'
        };
      }
    }

    return {
      messages: [`Ready to reserve this? It's free to hold while we work out final details.

Or if you have questions about the trip, feel free to ask!`],
      nextState: 'start_booking'
    };
  }

  handleCollectName(userId, message) {
    const name = message.trim();
    if (name.length < 2) {
      return {
        messages: [`Could I get your full name, please?`],
        nextState: 'collect_name'
      };
    }

    this.userData[userId].name = name;
    
    return {
      messages: [`How many people are traveling?`],
      nextState: 'collect_travelers'
    };
  }

  handleCollectTravelers(userId, message) {
    const travelers = parseInt(message);
    if (isNaN(travelers) || travelers < 1 || travelers > 20) {
      return {
        messages: [`How many people will be traveling? (1-20)`],
        nextState: 'collect_travelers'
      };
    }

    this.userData[userId].travelers = travelers;
    
    return {
      messages: [`When do you want to travel? (e.g., 20/12/2025)`],
      nextState: 'collect_date'
    };
  }

  handleCollectDate(userId, message) {
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = message.trim().match(dateRegex);
    
    if (!match) {
      return {
        messages: [`Please use DD/MM/YYYY format - e.g., 20/12/2025 or 25/12/2025`],
        nextState: 'collect_date'
      };
    }

    this.userData[userId].startDate = message.trim();
    
    return {
      messages: [`Any special requirements or preferences? (or type 'none')`],
      nextState: 'collect_requirements'
    };
  }

  handleCollectRequirements(userId, message) {
    const requirements = message.trim() === 'none' ? 'No special requirements' : message.trim();
    this.userData[userId].requirements = requirements;

    const data = this.userData[userId];
    
    return {
      messages: [
        `Ready to revert this? It's free to hold while we work out the final details 

You can reply yes or no`
      ],
      nextState: 'confirm_booking'
    };
  }

  async handleFinalize(userId, message) {
    // Accept multiple variations of "finalize" responses
    const finalizeVariations = [
      'finalize',
      'Finalize',
      'FINALIZE',
      'finalise',
      'Finalise',
      'FINALISE',
      'confirm booking',
      'Confirm booking',
      'CONFIRM BOOKING',
      'yes finalize',
      'Yes finalize',
      'YES FINALIZE',
      'book now',
      'Book now',
      'BOOK NOW',
      'proceed',
      'Proceed',
      'PROCEED'
    ];
    
    const normalizedMessage = message.trim();
    
    if (!finalizeVariations.some(variation => variation.toLowerCase() === normalizedMessage.toLowerCase())) {
      return {
        messages: [`Please reply "finalize" pull pricing for you.`],
        nextState: 'finalize'
      };
    }

    try {
      // Generate unique request ID for this quote request
      const requestId = `REQ_${Date.now()}_${userId.slice(-6)}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      console.log(`[QUOTE REQUEST] Generated new request ID: ${requestId} for user: ${userId}`);
      
      // Store request ID in user data for tracking
      this.storeRequestId(userId, requestId);
      
      // Send booking data to backend API with request ID
      const axios = require('axios');
      const bookingData = this.userData[userId];
      
      const backendResponse = await axios.post('http://127.0.0.1:8000/create-quote-request/', {
        request_id: requestId,  // Include bot's request_id
        customer_name: bookingData.name,
        customer_phone: userId,
        destination: 'Multiple', // All vendors are configured for 'Multiple' destination
        service_type: 'mixed', // All packages include multiple services
        num_people: bookingData.travelers,
        start_date: this.formatDateForBackend(bookingData.startDate),
        end_date: null, // Single date for now
        special_requirements: bookingData.requirements,
      
      }, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (backendResponse.status === 201 || backendResponse.status === 200) {
        // Store the backend's returned ID for proper quote matching
        const backendData = backendResponse.data;
        console.log(`[DEBUG] Backend response data:`, JSON.stringify(backendData, null, 2));
        
        if (backendData && backendData.request_id) {
          this.userData[userId].backendRequestId = backendData.request_id;
          console.log(`[QUOTE REQUEST] Backend returned request_id: ${backendData.request_id} for user: ${userId}`);
        } else if (backendData && backendData.id) {
          this.userData[userId].backendRequestId = backendData.id;
          console.log(`[QUOTE REQUEST] Backend returned id: ${backendData.id} for user: ${userId}`);
        } else {
          console.log(`[DEBUG] Backend response has no request_id or id field`);
        }
        
        // Save user data to persist backend ID
        this.saveUserData();
        
        // Change state to awaiting quotes with request ID tracking
        this.userStates[userId] = 'awaiting_quotes';
        
        return {
          messages: [], // Let webhook-server handle the confirmation message
          nextState: 'awaiting_quotes'
        };
      } else {
        console.error('Backend returned error:', backendResponse.data);
        return {
          messages: [`Oops! Something went wrong while submitting your booking.

Please try again in a few moments or reply *help* to connect with our team.`],
          nextState: 'finalize'
        };
      }
    } catch (error) {
      console.error('Backend error:', error.message);
      if (error.response) {
        console.error('Backend response data:', JSON.stringify(error.response.data, null, 2));
        console.error('Backend status:', error.response.status);
        console.error('Backend headers:', error.response.headers);
      }
      // Handle backend connection errors properly
      if (error.code === 'ECONNREFUSED') {
        console.log('Backend not available - informing user');
        return {
          messages: [`*System Temporarily Unavailable*

Our booking system is currently experiencing technical difficulties.

Our team has been notified and is working to resolve this issue.

Please try again in a few minutes or contact our support team directly:
• Phone: +91-9886174621
• Email: support@unravelexperience.com

We apologize for the inconvenience and appreciate your patience!`],
          nextState: 'finalize'
        };
      }
      
      // If it's a validation error, show more specific message
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        let errorMessage = 'Oops! Something went wrong while submitting your booking.\n\n';
        
        if (errorData && typeof errorData === 'object') {
          Object.keys(errorData).forEach(field => {
            if (Array.isArray(errorData[field])) {
              errorMessage += `${field}: ${errorData[field].join(', ')}\n`;
            }
          });
        }
        
        errorMessage += '\nPlease try again or reply *help* to connect with our team.';
        
        return {
          messages: [errorMessage],
          nextState: 'finalize'
        };
      }
      
      return {
        messages: [`Oops! Something went wrong while submitting your booking.

Please try again in a few moments or reply *help* to connect with our team.`],
        nextState: 'finalize'
      };
    }
  }

  async handleConfirmBooking(userId, message) {
    const normalizedMessage = message.trim().toLowerCase();

    if (normalizedMessage === 'yes') {
      // Proceed with finalize logic
      try {
        // Generate unique request ID for this quote request
        const requestId = `REQ_${Date.now()}_${userId.slice(-6)}`;
        console.log(`[QUOTE REQUEST] Generated new request ID: ${requestId} for user: ${userId}`);
        
        // Normalize userId - remove @s.whatsapp.net suffix for consistent storage
        const cleanUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        
        // Store request ID with clean user ID
        this.storeRequestId(cleanUserId, requestId);
        
        // Send booking data to backend API with request ID
        const axios = require('axios');
        const bookingData = this.userData[userId];
        
        const backendResponse = await axios.post('http://127.0.0.1:8000/create-quote-request/', {
          request_id: requestId,  // Include bot's request_id
          customer_name: bookingData.name,
          customer_phone: cleanUserId,
          destination: bookingData.selectedPackage,
          service_type: 'mixed', // All packages include multiple services
          num_people: bookingData.travelers,
          start_date: this.formatDateForBackend(bookingData.startDate),
          end_date: null, // Single date for now
          special_requirements: bookingData.requirements,
          preferences: '' // No preferences collected yet
        }, {
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (backendResponse.status === 201 || backendResponse.status === 200) {
          // Store the backend's returned ID if present
          const backendData = backendResponse.data;
          console.log(`[DEBUG] Backend response data:`, JSON.stringify(backendData, null, 2));
          
          if (backendData && backendData.request_id) {
            this.userData[cleanUserId].backendRequestId = backendData.request_id;
            console.log(`[QUOTE REQUEST] Backend returned request_id: ${backendData.request_id} for user: ${cleanUserId}`);
          } else if (backendData && backendData.quote_request_id) {
            this.userData[cleanUserId].backendRequestId = backendData.quote_request_id;
            console.log(`[QUOTE REQUEST] Backend returned quote_request_id: ${backendData.quote_request_id} for user: ${cleanUserId}`);
          } else if (backendData && backendData.id) {
            this.userData[cleanUserId].backendRequestId = backendData.id;
            console.log(`[QUOTE REQUEST] Backend returned id: ${backendData.id} for user: ${cleanUserId}`);
          } else {
            console.log(`[DEBUG] Backend response has no request_id, quote_request_id, or id field`);
          }
          
          // Save user data
          this.saveUserData();
          
          // Change state to awaiting quotes
          this.userStates[userId] = 'awaiting_quotes';
          
          return {
            messages: [], // Let webhook-server handle the confirmation message
            nextState: 'awaiting_quotes'
          };
        } else {
          console.error('Backend returned error:', backendResponse.data);
          return {
            messages: [`Oops! Something went wrong while submitting your booking.

Please try again in a few moments or reply *help* to connect with our team.`],
            nextState: 'confirm_booking'
          };
        }
      } catch (error) {
        console.error('Backend error:', error.message);
        if (error.response) {
          console.error('Backend response data:', JSON.stringify(error.response.data, null, 2));
          console.error('Backend status:', error.response.status);
          console.error('Backend headers:', error.response.headers);
        }
        // Handle backend connection errors properly
        if (error.code === 'ECONNREFUSED') {
          console.log('Backend not available - informing user');
          
          // Notify executive about the error
          try {
            const executiveNumber = process.env.EXECUTIVE_WHATSAPP;
            if (executiveNumber) {
              const errorMessage = `SYSTEM ERROR ALERT\n\nCustomer: ${userId}\nError: Backend not available (ECONNREFUSED)\nTime: ${new Date().toLocaleString()}`;
              await this.sendMessage(executiveNumber, errorMessage);
            }
          } catch (execError) {
            console.error('Failed to notify executive of error:', execError.message);
          }
          
          return {
            messages: [`*System Temporarily Unavailable*

Our booking system is currently experiencing technical difficulties.

Our team has been notified and is working to resolve this issue.

Please try again in a few minutes or contact our support team directly:
• Phone: +91-9886174621
• Email: support@unravelexperience.com

We apologize for the inconvenience and appreciate your patience!`],
            nextState: 'confirm_booking'
          };
        }
        
        // If it's a validation error, show more specific message
        if (error.response && error.response.status === 400) {
          const errorData = error.response.data;
          let errorMessage = 'Oops! Something went wrong while submitting your booking.';
          
          if (errorData && typeof errorData === 'object') {
            Object.keys(errorData).forEach(field => {
              if (Array.isArray(errorData[field])) {
                errorMessage += `${field}: ${errorData[field].join(', ')}
`;
              }
            });
          }
          
          errorMessage += 'Please try again or reply *help* to connect with our team.';
          
          return {
            messages: [errorMessage],
            nextState: 'confirm_booking'
          };
        }
        
        return {
          messages: [`Oops! Something went wrong while submitting your booking.

Please try again in a few moments or reply *help* to connect with our team.`],
          nextState: 'confirm_booking'
        };
      }
    } else if (normalizedMessage === 'no') {
      return {
        messages: [`How else can I assist you? You can ask about packages, change your selection, or contact support.`],
        nextState: 'greeting'
      };
    } else {
      return {
        messages: [`Please reply with "yes" to confirm or "no" for other assistance.`],
        nextState: 'confirm_booking'
      };
    }
  }

  sendAdminNotification(userId, userData) {
    try {
      // Get executive phone from environment or use default
      const executivePhone = process.env.EXECUTIVE_PHONE || '7770974354';
      
      // Calculate end date
      const packageDurations = {
        'A London Christmas': 9,
        'A New York Christmas': 5,
        'A Parisian Noël': 7,
        'A Week with Santa': 7
      };
      
      const duration = packageDurations[userData.selectedPackage] || 7;
      const startDate = new Date(userData.startDate.split('/').reverse().join('-'));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration - 1);
      
      const endDateStr = `${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}/${endDate.getFullYear()}`;
      
      // Format vendor quotes for executive
      let vendorQuotesDetails = '';
      if (userData.vendorQuotes && userData.vendorQuotes.length > 0) {
        vendorQuotesDetails = userData.vendorQuotes.map(quote => {
          return `• ${quote.vendor_name} (${quote.vendor_type})
  - Original Price: ₹${quote.original_price}
  - Markup Price: ₹${quote.markup_price}
  - Markup Amount: ₹${quote.markup_amount}
  - Quote: ${quote.quote_details.substring(0, 100)}...`;
        }).join('\n\n');
      } else {
        vendorQuotesDetails = '• No vendor quotes available';
      }
      
      // Get conversation summary for current customer
      const conversationSummary = this.getCustomerConversationSummary(userId);
      
      // Create admin notification message
      const adminMessage = ` *NEW BOOKING REQUEST*

 Time: ${new Date().toLocaleString()}

 CUSTOMER DETAILS:
• Name: ${userData.name}
• Phone: ${userId}

 TRIP DETAILS:
• Package: ${userData.selectedPackage}
• Start Date: ${userData.startDate}
• End Date: ${endDateStr}
• Travelers: ${userData.travelers}
• Requirements: ${userData.requirements}

 ORIGINAL VENDOR QUOTES:
${vendorQuotesDetails}

 QUOTES SENT TO CUSTOMER:
• Final Price: ${userData.quotePrice || 'TBD'}

 CONVERSATION SUMMARY:
${conversationSummary}`;

      // Send to executive via the global socket
      if (global.sock) {
        const formattedPhone = executivePhone.replace(/\D/g, '');
        const finalPhone = formattedPhone.startsWith('91') ? formattedPhone : '91' + formattedPhone;
        
        global.sock.sendMessage(finalPhone + '@s.whatsapp.net', { text: adminMessage })
          .then(() => {
            console.log(' Admin notification sent to executive:', executivePhone);
          })
          .catch((error) => {
            console.error(' Failed to send admin notification:', error.message);
          });
      } else {
        console.error(' WhatsApp socket not available for admin notification');
      }
      
    } catch (error) {
      console.error(' Error sending admin notification:', error);
    }
  }

  getCustomerConversationSummary(userId) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Read conversations file
      const conversationsPath = path.join(__dirname, 'conversations.json');
      if (!fs.existsSync(conversationsPath)) {
        return '• No conversation history available';
      }
      
      const conversationsData = JSON.parse(fs.readFileSync(conversationsPath, 'utf8'));
      
      // Get conversation for current user
      const userConversation = conversationsData[userId];
      if (!userConversation || !userConversation.messages || userConversation.messages.length === 0) {
        return '• No conversation history available for this customer';
      }
      
      // Extract last 10 messages to keep summary concise
      const recentMessages = userConversation.messages.slice(-10);
      
      // Format conversation summary
      const summaryLines = recentMessages.map(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const sender = msg.sender === 'user' ? 'Customer' : 'Bot';
        const message = msg.message.substring(0, 80) + (msg.message.length > 80 ? '...' : '');
        return `• [${timestamp}] ${sender}: ${message}`;
      }).join('\n');
      
      // Clear the conversation for this user after sending to executive
      this.clearUserConversation(userId);
      
      return summaryLines;
      
    } catch (error) {
      console.error(' Error reading conversation summary:', error);
      return '• Error loading conversation history';
    }
  }

  clearUserConversation(userId) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const conversationsPath = path.join(__dirname, 'conversations.json');
      if (!fs.existsSync(conversationsPath)) {
        return;
      }
      
      const conversationsData = JSON.parse(fs.readFileSync(conversationsPath, 'utf8'));
      
      // Remove the conversation for this user
      if (conversationsData[userId]) {
        delete conversationsData[userId];
        
        // Write back the updated conversations
        fs.writeFileSync(conversationsPath, JSON.stringify(conversationsData, null, 2));
        console.log(` Cleared conversation for user ${userId} after sending to executive`);
      }
      
    } catch (error) {
      console.error(' Error clearing user conversation:', error);
    }
  }

  cleanupInactiveConversations() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const conversationsPath = path.join(__dirname, 'conversations.json');
      if (!fs.existsSync(conversationsPath)) {
        return;
      }
      
      const conversationsData = JSON.parse(fs.readFileSync(conversationsPath, 'utf8'));
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90); // Changed from 30 to 90 days
      
      let cleanedCount = 0;
      const originalCount = Object.keys(conversationsData).length;
      
      // Check each conversation for customer inactivity (no messages in last 90 days)
      for (const userId in conversationsData) {
        const userConversation = conversationsData[userId];
        
        // Only remove if truly empty (no messages at all)
        if (!userConversation.messages || userConversation.messages.length === 0) {
          console.log(` Removing empty conversation for ${userId}`);
          delete conversationsData[userId];
          cleanedCount++;
          continue;
        }
        
        // Check if there are ANY messages (customer or bot) in the last 90 days
        const hasRecentActivity = userConversation.messages.some(msg => {
          try {
            const messageTime = new Date(msg.timestamp);
            return messageTime >= ninetyDaysAgo;
          } catch (error) {
            // If timestamp is invalid, consider it old
            return false;
          }
        });
        
        // Only remove if no activity at all in the last 90 days
        if (!hasRecentActivity) {
          delete conversationsData[userId];
          cleanedCount++;
          
          // Find the last message for logging
          const lastMessage = userConversation.messages.pop();
          if (lastMessage) {
            try {
              const lastMessageTime = new Date(lastMessage.timestamp);
              console.log(` Cleaned inactive customer ${userId} (last activity: ${lastMessageTime.toLocaleString()})`);
            } catch (error) {
              console.log(` Cleaned inactive customer ${userId} (invalid timestamp)`);
            }
          } else {
            console.log(` Cleaned customer ${userId} (no valid messages found)`);
          }
        }
      }
      
      // Write back the cleaned conversations
      if (cleanedCount > 0) {
        fs.writeFileSync(conversationsPath, JSON.stringify(conversationsData, null, 2));
        console.log(` Cleanup complete: Removed ${cleanedCount}/${originalCount} inactive customers (no activity in 90 days)`);
      } else {
        console.log(` No inactive customers to clean (checked ${originalCount} customers)`);
      }
      
    } catch (error) {
      console.error(' Error cleaning inactive conversations:', error);
    }
  }

  // Handle backend quote messages
  handleQuoteMessage(userId, price, vendorQuotes = [], webhookData = {}) {
    // Normalize userId - remove WhatsApp suffixes for consistent lookup
    const cleanUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
    
    console.log(`[QUOTE DEBUG] Webhook userId: ${userId}, Clean userId: ${cleanUserId}`);
    console.log(`[QUOTE DEBUG] Available user data keys:`, Object.keys(this.userData));
    
    // Try to get user data with clean ID
    const data = this.userData[cleanUserId];

    // Validate request ID to prevent stale data
    const webhookRequestId = webhookData.request_id || webhookData.quote_request_id;
    
    if (!data || !data.requestIds || data.requestIds.length === 0) {
      console.log(`[QUOTE ERROR] No stored request IDs for user ${cleanUserId}. Ignoring quote.`);
      return null; // Don't respond if no request was made
    }
    
    // Find matching request ID - ONLY exact match, no fallback
    let matchedRequest = null;
    let isValidRequestId = false;
    
    console.log(`[QUOTE DEBUG] Looking for webhook ID: ${webhookRequestId} in ${data.requestIds.length} stored requests`);
    
    // Try exact ID match ONLY
    for (const requestInfo of data.requestIds) {
      if (requestInfo.id === webhookRequestId && !requestInfo.used) {
        matchedRequest = requestInfo;
        isValidRequestId = true;
        console.log(`[QUOTE DEBUG] Exact ID match found: ${webhookRequestId} (unused)`);
        break;
      }
    }
    
    if (!isValidRequestId || !matchedRequest) {
      console.log(`[QUOTE WARNING] No matching unused request ID found. Webhook ID: ${webhookRequestId}. Ignoring quote.`);
      console.log(`[QUOTE DEBUG] Available request IDs:`, data.requestIds.map(r => ({id: r.id, used: r.used})));
      return null; // Ignore quotes that don't match exactly
    }
    
    // Mark this request as used to prevent duplicate processing
    matchedRequest.used = true;
    this.saveUserData();
    
    console.log(`[QUOTE SUCCESS] Valid request ID match: ${webhookRequestId} for user ${userId}`);

    // Use destination from webhook if available, otherwise fallback to user data
    const destination = webhookData.destination || (data ? data.selectedPackage : 'Your Package');

    // NO HARDCODED PRICES - Only use actual vendor quotes
    let finalPriceNumeric = price;
    let finalPriceDisplay = `₹${price} Per Person`;
    
    // If we have individual vendor quotes, calculate total properly
    if (vendorQuotes && vendorQuotes.length > 0) {
      const totalFromQuotes = vendorQuotes.reduce((sum, quote) => {
        const quotePrice = parseFloat(quote.markup_price) || parseFloat(quote.price) || 0;
        return sum + quotePrice;
      }, 0);
      
      if (totalFromQuotes > 0) {
        finalPriceNumeric = totalFromQuotes;
        finalPriceDisplay = `₹${Math.round(totalFromQuotes).toLocaleString('en-IN')}`;
        console.log(`[QUOTE CALCULATION] Calculated total from ${vendorQuotes.length} vendor quotes: ${finalPriceDisplay}`);
      }
    }

    // Store the quote data for later use in book_my_trip and admin notification
    if (data) {
      data.quotePrice = finalPriceDisplay;
      data.quoteDestination = destination;
      data.vendorQuotes = vendorQuotes; // Store complete vendor quotes
      data.quoteRequestId = webhookRequestId; // Store the validated request ID
      data.quoteReceivedAt = Date.now(); // Track when quotes were received
    }

    // IMPORTANT: Update user state to awaiting_quotes when quotes are received
    this.userStates[cleanUserId] = 'awaiting_quotes';

    // Format dates and duration
    const packageDurations = {
      'A London Christmas': 9,
      'A New York Christmas': 5,
      'A Parisian Noël': 7,
      'A Week with Santa': 7
    };
    const durationDays = packageDurations[data?.selectedPackage] || 7;
    const durationNights = durationDays - 1;

    let formattedDates = '';
    if (data?.startDate) {
      const startDateParts = data.startDate.split('/');
      const startDate = new Date(`${startDateParts[2]}-${startDateParts[1]}-${startDateParts[0]}`);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays - 1);
      
      const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
      const endMonth = endDate.toLocaleString('en-US', { month: 'long' });
      const startDay = startDate.getDate();
      const endDay = endDate.getDate();
      const year = startDate.getFullYear();
      
      if (startMonth === endMonth) {
        formattedDates = `${startMonth} ${startDay}-${endDay}, ${year}`;
      } else {
        formattedDates = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
      }
    }

    const travelers = webhookData.guests || data?.travelers || 1;
    const travelerText = travelers === 1 ? 'traveler' : 'travelers';

    return {
      messages: [`Your pricing for ${destination}:
${formattedDates} ${travelers} ${travelerText} ${durationNights} nights / ${durationDays} days
Trip Start Date: ${data?.startDate || 'TBD'}
Total: ${finalPriceDisplay}
One of our executives will reach out to you to take it further.`],
      nextState: 'awaiting_quotes',
      sendExecutive: true,
      executiveData: {
        userId: cleanUserId,
        userData: data
      }
    };
  }

  async handleAwaitingQuotes(userId, message) {
    // End conversation after quotes are received - no further responses
    return {
      messages: [],
      nextState: 'greeting'
    };
  }

  // Generate executive notification
  // Method to send PDF content as text (working solution)
  async sendPDFContentAsText(userId, pdfPath, packageInfo) {
    try {
      console.log(' DEBUG: sendPDFContentAsText called for userId:', userId);
      console.log(' DEBUG: PDF path:', pdfPath);
      
      // Convert userId to WhatsApp format
      const phoneNumber = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');
      
      // Send detailed PDF information as text messages
      const pdfDetailsMessage = ` **${packageInfo.packageName} - Complete Package Details**\n\n` +
                              ` PDF File: ${packageInfo.pdfFile}\n` +
                              ` Package: ${packageInfo.packageName}\n` +
                              ` Status: PDF brochure prepared and ready\n\n` +
                              `** What's Included in Your Package:**\n\n` +
                              ` Complete itinerary with day-by-day breakdown\n` +
                              ` Accommodation details and recommendations\n` +
                              ` Activity descriptions and timing\n` +
                              ` Transportation information\n` +
                              ` Pricing details and inclusions\n` +
                              ` Contact information and support\n\n` +
                              `** Next Steps:**\n\n` +
                              `• Reply "ready for this package" to proceed with booking\n` +
                              `• Our team will send you the complete PDF brochure\n` +
                              `• You'll receive all package details via email and WhatsApp\n\n` +
                              `** Why wait?** Your ${packageInfo.packageName} adventure awaits!`;
      
      // Send the message using the working message system
      try {
        // Use the sendMessage function from messageHandler
        const { sendMessage } = require('./messageHandler');
        await sendMessage(phoneNumber, pdfDetailsMessage);
        console.log(' PDF content sent via messageHandler.sendMessage');
      } catch (error) {
        console.log(' PDF content sending failed:', error.message);
      }
      
    } catch (error) {
      console.error('Error in sendPDFContentAsText:', error);
    }
  }

  // Method to send PDF file as document (optimized for speed)
  async sendPDFFile(userId, pdfPath, packageInfo) {
    try {
      
      const path = require('path');
      
      // Quick package to file mapping
      const pdfFiles = {
        'A London Christmas': 'Unravel x A London Christmas 🎄 .pdf',
        'A New York Christmas': 'Unravel x A New York Christmas 🎄.pdf',
        'A Parisian Noël': 'Unravel x A Parisian Noel 🎄.pdf',
        'A Week with Santa': 'Unravel x Lapland 🎅.pdf'
      };
      
      const pdfFileName = pdfFiles[packageInfo.packageName];
      if (!pdfFileName) {
        console.log('No PDF file mapped for package:', packageInfo.packageName);
        return;
      }
      
      const fullPdfPath = path.join(__dirname, 'Brochures', pdfFileName);
      
      // Quick file existence check (no stats to save time)
      const fs = require('fs');
      if (!fs.existsSync(fullPdfPath)) {
        console.log('PDF file not found:', fullPdfPath);
        return;
      }
      
      // Send PDF file as document via Baileys (optimized)
      // Handle different WhatsApp ID formats
      let whatsappId;
      if (userId.includes('@')) {
        if (userId.includes('@lid')) {
          // Convert @lid format to @c.us format for Baileys
          const cleanPhone = userId.replace('@lid', '');
          whatsappId = `${cleanPhone}@c.us`;
        } else {
          whatsappId = userId; // Already in correct format
        }
      } else {
        whatsappId = `${userId}@s.whatsapp.net`;
      }
      
      try {
        console.log('Sending PDF brochure for:', packageInfo.packageName);
        
        if (global.botInstance && typeof global.botInstance.sendMessage === 'function') {
          // Read file as buffer and send
          const fileBuffer = fs.readFileSync(fullPdfPath);
          await global.botInstance.sendMessage(whatsappId, {
            document: fileBuffer,
            mimetype: 'application/pdf',
            fileName: pdfFileName
          });
        } else {
          throw new Error('Bot instance not available');
        }
        
      } catch (pdfError) {
        console.error('Error sending PDF:', pdfError.message);
        // Quick fallback - don't calculate file stats to save time
        const { sendMessage } = require('./messageHandler');
        
        const fallbackMessage = `${packageInfo.packageName} Brochure

` +
          `The complete PDF brochure has been prepared for your ${packageInfo.packageName} package.

` +
          `Please proceed with booking and our team will ensure you receive the full PDF brochure!`;
        
        await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', ''), fallbackMessage);
      }

    } catch (error) {
      console.error('Error in sendPDFFile:', error);
      // Fallback message
      const { sendMessage } = require('./messageHandler');
      await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', ''), 
        `PDF brochure for ${packageInfo.packageName} will be sent to you along with your booking details.`
      );
    }
  }

  // Method to send PDF brochure for a package (backup method)
  async sendPackagePDF(userId, packageInfo) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      console.log(' DEBUG: sendPackagePDF called for userId:', userId);
      console.log(' DEBUG: packageInfo:', packageInfo);
      
      const pdfPath = path.join(__dirname, 'Brochures', packageInfo.pdfFile);
      console.log(' DEBUG: Full PDF path:', pdfPath);
      console.log(' DEBUG: PDF exists:', fs.existsSync(pdfPath));

      if (fs.existsSync(pdfPath)) {
        console.log(' DEBUG: PDF file exists, checking bot availability...');
        console.log(' DEBUG: global.botInstance exists:', !!global.botInstance);
        console.log(' DEBUG: sendDocument function exists:', !!(global.botInstance && typeof global.botInstance.sendDocument === 'function'));
        
        // Convert userId to WhatsApp format
        const whatsappId = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
        
        try {
          console.log(' Sending PDF brochure for:', packageInfo.packageName);
          
          // Try to send via Baileys bot if available
          if (global.botInstance && typeof global.botInstance.sendDocument === 'function') {
            console.log(' DEBUG: Using Baileys bot to send PDF...');
            await global.botInstance.sendDocument(whatsappId, pdfPath, packageInfo.pdfFile);
            console.log(' PDF sent via Baileys bot');
          } else {
            console.log(' DEBUG: Baileys bot not available, trying direct message with file info...');
            
            // Fallback: Send a message with PDF file info since document sending might not work
            const fs = require('fs');
            const stats = fs.statSync(pdfPath);
            const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            // Try using the sendMessage function from messageHandler
            try {
              const { sendMessage } = require('./messageHandler');
              const pdfInfoMessage = ` **PDF Brochure Available**\n\n` +
                ` File: ${packageInfo.pdfFile}\n` +
                ` Size: ${fileSizeInMB} MB\n` +
                ` Package: ${packageInfo.packageName}\n\n` +
                `The complete PDF brochure has been prepared for your ${packageInfo.packageName} package.\n\n` +
                `Please proceed with booking and our team will ensure you receive the full brochure!`;
              
              await sendMessage(whatsappId.replace('@s.whatsapp.net', ''), pdfInfoMessage);
              console.log(' PDF info message sent via sendMessage');
            } catch (error) {
              console.log(' No sending method available:', error.message);
            }
          }
        } catch (pdfError) {
          console.error('Error sending PDF:', pdfError);
          console.log(' DEBUG: PDF error details:', pdfError.message);
        }
      } else {
        console.log(' PDF file does not exist:', pdfPath);
      }
    } catch (error) {
      console.error('Error in sendPackagePDF:', error);
    }
  }

  // Method to format executive notification message
  formatExecutiveMessage(userId) {
    const data = this.userData[userId];
    if (!data) return '';

    const time = new Date().toLocaleString();
    const name = data.name || 'Unknown';
    const phone = userId;

    // Calculate end date based on package
    const packageDurations = {
      'A London Christmas': 9,
      'A New York Christmas': 5,
      'A Parisian Noël': 7,
      'A Week with Santa': 7
    };
    const duration = packageDurations[data.selectedPackage] || 7;
    const startDateParts = data.startDate.split('/');
    const startDate = new Date(`${startDateParts[2]}-${startDateParts[1]}-${startDateParts[0]}`);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    const endDateStr = `${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}/${endDate.getFullYear()}`;

    const selectedPackage = data.selectedPackage || 'Unknown';
    const travelers = data.travelers || 1;
    const requirements = data.requirements || 'No special requirements';

    let quotesSection = '';
    if (data.quotes && data.quotes.length > 0) {
      quotesSection = data.quotes.map(quote => {
        return `* ${quote.vendor_name} (${quote.vendor_type})\n  - Original Price: ₹${quote.original_price}\n  - Markup Price: ₹${quote.markup_price}\n  - Markup Amount: ₹${quote.markup_amount}\n  - Quote: ${quote.quote_text}\n\nOn ${new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}, ${new Date().toLocaleTimeString()} <${quote.vendor_email}> wrote:\n\n> ${quote.quote_text}`;
      }).join('\n\n');
    } else {
      quotesSection = 'No quotes available';
    }

    const finalPrice = data.quotes ? data.quotes.reduce((sum, q) => sum + (parseFloat(q.markup_price) || 0), 0) : 0;

    const conversationHistory = this.getConversationHistory(userId);
    const conversationSummary = conversationHistory.length > 0 ? conversationHistory.map(msg => `* ${msg}`).join('\n') : '* No conversation history available for this customer';

    const message = `NEW BOOKING REQUEST

Time: ${time}

CUSTOMER DETAILS:
* Name: ${name}
* Phone: ${phone}

TRIP DETAILS:
* Package: ${selectedPackage}
* Start Date: ${data.startDate}
* End Date: ${endDateStr}
* Travelers: ${travelers}${data.requirements && data.requirements !== 'No special requirements' ? `\n* Requirements: ${data.requirements}` : ''}

ORIGINAL VENDOR QUOTES:
${quotesSection}

QUOTES SENT TO CUSTOMER:
* Final Price: ₹${finalPrice}

CONVERSATION SUMMARY:
${conversationSummary}`;

    return message;
  }

  generateExecutiveNotification(userId, whatsappNumber, vendorQuotes = []) {
    const data = this.userData[userId];
    if (!data) return null;

    const packageDurations = {
      'A London Christmas': 9,
      'A New York Christmas': 5,
      'A Parisian Noël': 7,
      'A Week with Santa': 7
    };
    
    const duration = packageDurations[data.selectedPackage] || 7;
    const startDate = new Date(data.startDate.split('/').reverse().join('-'));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    
    const endDateStr = `${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}/${endDate.getFullYear()}`;

    let vendorQuotesText = '';
    if (vendorQuotes.length > 0) {
      vendorQuotesText = vendorQuotes.map(quote => `• ${quote.name}: ${quote.price}`).join('\n');
    }

    return ` *NEW BOOKING REQUEST*

 Time: ${new Date().toLocaleString()}

 CUSTOMER DETAILS:
• Name: ${data.name}
• Phone: ${whatsappNumber}

 TRIP DETAILS:
• Destination: ${data.selectedPackage}
• Package: ${data.selectedPackage}
• Start Date: ${data.startDate}
• End Date: ${endDateStr}
• Travelers: ${data.travelers}
• Requirements: ${data.requirements}

 VENDOR QUOTES:
${vendorQuotesText}

 CONVERSATION SUMMARY:
• Customer selected ${data.selectedPackage} package
• Ready to proceed with booking`;
  }

  // Store request ID for quote matching
  storeRequestId(userId, requestId) {
    if (!this.userData[userId]) {
      this.userData[userId] = {};
    }
    
    // Initialize requestIds array if it doesn't exist
    if (!this.userData[userId].requestIds) {
      this.userData[userId].requestIds = [];
      
      // Migrate existing request ID if present
      if (this.userData[userId].currentRequestId && this.userData[userId].requestTimestamp) {
        this.userData[userId].requestIds.push({
          id: this.userData[userId].currentRequestId,
          timestamp: this.userData[userId].requestTimestamp,
          used: false
        });
        console.log(`[BOTFLOW] Migrated existing request ID ${this.userData[userId].currentRequestId} to new format for user ${userId}`);
      }
    }
    
    // Add new request ID with timestamp
    const requestInfo = {
      id: requestId,
      timestamp: Date.now(),
      used: false
    };
    
    this.userData[userId].requestIds.push(requestInfo);
    this.userData[userId].currentRequestId = requestId;
    this.userData[userId].requestTimestamp = Date.now();
    
    // Keep only last 10 request IDs to prevent memory issues
    if (this.userData[userId].requestIds.length > 10) {
      this.userData[userId].requestIds = this.userData[userId].requestIds.slice(-10);
    }
    
    this.saveUserData();
    
    console.log(`[BOTFLOW] Stored request ID ${requestId} for user ${userId} (total: ${this.userData[userId].requestIds.length} requests)`);
  }
}

module.exports = new BotFlow();
