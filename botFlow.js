const fs = require('fs');
const path = require('path');
const config = require('./config');

class BotFlow {
  constructor() {
    this.userStates = {}; 
    this.userData = {};
    this.packagesData = this.loadPackagesData();
    this.packageItineraries = this.loadPackageItineraries();
    this.lastMessageTime = {}; 
    this.MESSAGE_COOLDOWN = 1000; 
    this.googleDriveLinks = this.loadGoogleDriveLinks();
    
    // Start automatic cleanup scheduler
    this.startCleanupScheduler();
  }

  startCleanupScheduler() {
    // CLEANUP DISABLED - The automatic cleanup was removing data too aggressively
    // If you need to cleanup old conversations, run it manually:
    // 1. Stop the bot
    // 2. Backup conversations.json
    // 3. Run cleanup manually if needed
    console.log('Automatic cleanup disabled to prevent data loss');
    
    // Original cleanup code commented out:
    /*
    // Run cleanup every 24 hours at 2:00 AM
    const scheduleCleanup = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0); // 2:00 AM
      
      const timeUntilCleanup = tomorrow - now;
      
      setTimeout(() => {
        console.log('Starting scheduled conversation cleanup...');
        this.cleanupInactiveConversations();
        
        // Schedule next cleanup
        scheduleCleanup();
      }, timeUntilCleanup);
      
      console.log(`Next conversation cleanup scheduled for: ${tomorrow.toLocaleString()}`);
    };
    
    // Start the scheduler
    scheduleCleanup();
    */
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
      
      case 'awaiting_quotes':
        response = this.handleAwaitingQuotes(userId, lowerMessage);
        break;
      
      case 'book_my_trip':
        response = this.handleBookMyTrip(userId, lowerMessage);
        break;
      
      case 'completed':
        response = await this.handleCompleted(userId, message);
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
      'tell me', 'show me', 'explain', 'describe', 'details', 'information'
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
      'what is', 'what are', 'what does', 'what do',
      'where is', 'where are', 'where can',
      'when does', 'when is', 'when can',
      'why is', 'why are', 'why do',
      'which is', 'which are', 'which do',
      'is there', 'are there', 'do you have', 'can i',
      'tell me about', 'show me', 'explain', 'describe'
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
        messages: [`Hello! Welcome to Unravel Experience
We're here to make your trip unforgettable!

Here are some of our featured packages:

A London Christmas - 8 nights/9 days
A New York Christmas - 4 nights/5 days
A Parisian Noël - 6 nights/7 days
A Week with Santa - 6 nights/7 days`],
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
      this.userData[userId] = { selectedPackage };
      
      const itinerary = this.packageItineraries[selectedPackage.toLowerCase()] || 'Itinerary details coming soon...';
      
      // Package file mapping for PDFs
      const packageFileMap = {
        'A London Christmas': { pdfFile: 'Unravel x A London Christmas 🎄 .pdf', packageName: 'A London Christmas' },
        'A New York Christmas': { pdfFile: 'Unravel x A New York Christmas 🎄.pdf', packageName: 'A New York Christmas' },
        'A Parisian Noël': { pdfFile: 'Unravel x A Parisian Noel 🎄.pdf', packageName: 'A Parisian Noël' },
        'A Week with Santa': { pdfFile: 'Unravel x Lapland 🎅.pdf', packageName: 'A Week with Santa' }
      };

      const packageInfo = packageFileMap[selectedPackage];
      
      // Send package overview message immediately
      const messages = [
        `**${selectedPackage} - Package Overview**

**Destination:** ${this.getDestinationFromPackage(selectedPackage)}
**Duration:** ${this.getDurationFromPackage(selectedPackage)}
**Best For:** ${this.getBestForFromPackage(selectedPackage)}

**Detailed Itinerary:** The complete day-by-day itinerary with all activities, timings, and inclusions has been sent to you as a PDF file.

**Highlights Include:**
${this.getPackageHighlights(selectedPackage)}`
      ];

      // Start PDF sending in background - completely separate from response
      if (packageInfo) {
        try {
          console.log('DEBUG: Starting PDF send in background for package:', selectedPackage);
          
          // Send PDF and then follow-up message completely in background
          this.sendPDFAndFollowUp(userId, packageInfo);
          
        } catch (error) {
          console.log('DEBUG: Error starting PDF send:', error.message);
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
        console.log('DEBUG: PDF sent, now sending follow-up message');
        
        // Wait a moment to ensure PDF arrives first
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send follow-up message separately
        const { sendMessage } = require('./messageHandler');
        await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', ''), 
          `If you have any questions about this package, feel free to ask!

Ready to book? Reply "ready for this package".`
        );
        
        console.log('DEBUG: Follow-up message sent');
        
      } catch (error) {
        console.log('DEBUG: Error in background PDF/follow-up:', error.message);
        
        // Still try to send follow-up even if PDF failed
        try {
          const { sendMessage } = require('./messageHandler');
          await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', ''), 
            `If you have any questions about this package, feel free to ask!

Ready to book? Reply "ready for this package".`
          );
        } catch (followUpError) {
          console.log('DEBUG: Follow-up message also failed:', followUpError.message);
        }
      }
    }

  async handleNoPackageMatch() {
    return {
      messages: [`I'd be happy to help you choose a package! Please select from:

London - A London Christmas
New York - A New York Christmas  
Paris - A Parisian Noël
Santa - A Week with Santa

Which destination interests you?`],
      nextState: 'destination_selection'
    };
  }

  async handleStartBooking(userId, message) {
    if (message === 'ready for this package') {
      return {
        messages: [
          `Great! I'd be happy to help you book your trip!\n\nLet's start with your booking details.`,
          `Please provide your full name:`
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
          messages: [`I'm having trouble answering that right now. If you're ready to proceed with booking, please reply "ready for this package".`],
          nextState: 'start_booking'
        };
      }
    }

    return {
      messages: [`If you're ready to proceed with booking, please reply "ready for this package".

Or if you have questions about the package, feel free to ask!`],
      nextState: 'start_booking'
    };
  }

  handleCollectName(userId, message) {
    const name = message.trim();
    if (name.length < 2) {
      return {
        messages: [`Please provide your full name (at least 2 characters):`],
        nextState: 'collect_name'
      };
    }

    this.userData[userId].name = name;
    
    return {
      messages: [`How many travelers will be joining this trip? (e.g., 2)`],
      nextState: 'collect_travelers'
    };
  }

  handleCollectTravelers(userId, message) {
    const travelers = parseInt(message);
    if (isNaN(travelers) || travelers < 1 || travelers > 20) {
      return {
        messages: [`Please provide a valid number of travelers (1-20):`],
        nextState: 'collect_travelers'
      };
    }

    this.userData[userId].travelers = travelers;
    
    return {
      messages: [`What's your preferred travel date? (e.g., 15/08/2026)`],
      nextState: 'collect_date'
    };
  }

  handleCollectDate(userId, message) {
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = message.trim().match(dateRegex);
    
    if (!match) {
      return {
        messages: [`Please provide a valid date in DD/MM/YYYY format (e.g., 15/08/2026):`],
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
        `*BOOKING SUMMARY*\n\nName: ${data.name}\nTravelers: ${data.travelers}\nTravel Date: ${data.startDate}\nRequirements: ${data.requirements}\nPackage: ${data.selectedPackage}`,
        `All details collected! Reply with "finalize" to confirm your booking.`
      ],
      nextState: 'finalize'
    };
  }

  async handleFinalize(userId, message) {
    if (message !== 'finalize') {
      return {
        messages: [`Please reply with "finalize" to confirm your booking.`],
        nextState: 'finalize'
      };
    }

    try {
      // Send booking data to backend API
      const axios = require('axios');
      const bookingData = this.userData[userId];
      
      const backendResponse = await axios.post('http://127.0.0.1:8000/api/bookings/', {
        name: bookingData.name,
        phone: userId,
        email: `${userId}@whatsapp.com`, // Generate email from phone number
        destination: bookingData.selectedPackage,
        travel_date: this.formatDateForBackend(bookingData.startDate), // Format date
        guests: bookingData.travelers, // Changed from travelers
        requirements: bookingData.requirements,
        package: bookingData.selectedPackage
      }, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (backendResponse.status === 201 || backendResponse.status === 200) {
        return {
          messages: [`Your booking has been successfully submitted! Our team will contact you shortly with pricing details.`],
          nextState: 'awaiting_quotes'
        };
      } else {
        console.error('Backend returned error:', backendResponse.data);
        return {
          messages: [` Oops! Something went wrong while submitting your booking.

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
          messages: [` *SYSTEM UNAVAILABLE*

 Our booking system is currently experiencing technical difficulties.

Our team has been notified and is working to resolve this issue.

 Please try again in a few minutes or contact our support team directly:
• Phone: +91-XXXXXXXXXX
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
        
        errorMessage += '\nPlease try again in a few moments or reply *help* to connect with our team.';
        
        return {
          messages: [errorMessage],
          nextState: 'finalize'
        };
      }
      
      return {
        messages: [` Oops! Something went wrong while submitting your booking.

Please try again in a few moments or reply *help* to connect with our team.`],
        nextState: 'finalize'
      };
    }
  }

  handleAwaitingQuotes(userId, message) {
    // This state is used when waiting for vendor quotes
    // The actual quote message will be sent via webhook
    return {
      messages: [`Your booking is being processed. Our team will contact you with pricing details shortly.`],
      nextState: 'awaiting_quotes'
    };
  }

  handleBookMyTrip(userId, message) {
    if (message === 'book my trip') {
      const data = this.userData[userId];
      
      // Calculate end date based on package duration
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
      
      // Use the quote price if available, otherwise TBD
      const totalPrice = data.quotePrice || 'TBD';
      
      // Send internal admin notification
      this.sendAdminNotification(userId, data);
      
      return {
        messages: [`*BOOKING REQUEST RECEIVED!*\n\n*Your Booking Summary:*\nName: ${data.name}\nPhone: ${userId}\nDestination: ${data.selectedPackage}\nStart Date: ${data.startDate}\nEnd Date: ${endDateStr}\nNo. of People: ${data.travelers}\nRequirements: ${data.requirements}\nTotal Amount: ${totalPrice}\n\n*Next Steps:*\n• Our executive team has been notified\n• You will receive a call within 24 hours\n• Payment and final details will be confirmed\n\nThank you for choosing *Unravel Experience*!`],
        nextState: 'completed'
      };
    }

    return {
      messages: [`Reply "book my trip" to proceed with your booking.`],
      nextState: 'book_my_trip'
    };
  }

  async handleCompleted(userId, message) {
    // Check if user is asking a question about their itinerary
    if (this.isQuestion(message)) {
      try {
        const aiService = require('./aiService');
        const conversationHistory = this.getConversationHistory(userId);
        const aiResponse = await aiService.getAIResponse(message, userId, conversationHistory);
        
        return {
          messages: [aiResponse],
          nextState: 'completed'
        };
      } catch (error) {
        console.error('Error getting AI response in completed state:', error);
        return {
          messages: [`I'm having trouble answering that right now. Our executive will contact you soon with all the details about your ${this.userData[userId]?.selectedPackage || 'chosen'} itinerary.`],
          nextState: 'completed'
        };
      }
    }

    // Default response for non-questions in completed state
    return {
      messages: [`Your booking request has been received and our executive team has been notified! 

You'll receive a call within 24 hours to finalize the details of your ${this.userData[userId]?.selectedPackage || 'chosen'} package.

If you have any questions about your itinerary, feel free to ask!`],
      nextState: 'completed'
    };
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
    // Try to get user data, but don't rely on it being present
    const data = this.userData[userId];

    // Use destination from webhook if available, otherwise fallback to user data
    const destination = webhookData.destination || (data ? data.selectedPackage : 'Your Package');

    // Store the quote data for later use in book_my_trip and admin notification
    if (data) {
      data.quotePrice = price;
      data.quoteDestination = destination;
      data.vendorQuotes = vendorQuotes; // Store complete vendor quotes
    }

    // IMPORTANT: Update user state to book_my_trip when quotes are received
    this.userStates[userId] = 'book_my_trip';

    return {
      messages: [` *TRAVEL QUOTES RECEIVED!*

 Destination: ${destination}
 Price: ${price}${!isNaN(price) ? ` (₹${Math.round(parseFloat(price) * config.USD_TO_INR_RATE)})` : ''}

 Next Steps:
• Send "book my trip" to proceed
• Our executive will contact you

 Thank you for choosing Unravel Experience!`],
      nextState: 'book_my_trip'
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
      console.log('DEBUG: sendPDFFile called for package:', packageInfo.packageName);
      
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
      const whatsappId = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
      
      try {
        console.log('Sending PDF brochure for:', packageInfo.packageName);
        
        if (global.botInstance && typeof global.botInstance.sendMessage === 'function') {
          // Send with optimized settings for faster delivery
          await global.botInstance.sendMessage(whatsappId, {
            document: { url: fullPdfPath },
            fileName: pdfFileName
          }, {
            timeout: 60000 // 60 second timeout for faster failure detection
          });
          console.log('PDF sent successfully via Baileys for:', packageInfo.packageName);
        } else {
          throw new Error('Bot instance not available');
        }
        
      } catch (pdfError) {
        console.error('Error sending PDF:', pdfError.message);
        // Quick fallback - don't calculate file stats to save time
        const { sendMessage } = require('./messageHandler');
        
        const fallbackMessage = `${packageInfo.packageName} Brochure\n\n` +
          `The complete PDF brochure has been prepared for your ${packageInfo.packageName} package.\n\n` +
          `Please proceed with booking and our team will ensure you receive the full PDF brochure!`;
        
        await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', ''), fallbackMessage);
      }

    } catch (error) {
      console.error('Error in sendPDFFile:', error);
      // Fallback message
      const { sendMessage } = require('./messageHandler');
      await sendMessage(userId.replace('@s.whatsapp.net', '').replace('@c.us', ''), 
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
}

module.exports = new BotFlow();
