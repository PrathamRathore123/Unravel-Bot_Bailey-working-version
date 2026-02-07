const OpenRouterService = require('./openRouterService');
const ConversationManager = require('./conversationManager.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');

class AIService {
  constructor() {
    this.openRouterService = OpenRouterService;
    this.packagesData = this.loadPackagesData();
    this.companyInfo = this.loadCompanyInfo();
    this.packageDetails = this.loadPackageDetails();
    this.lastResponseSentForUser = {}; // Track last response per user to prevent duplicates
    this.userBookingState = {}; // Track if user has started booking process
    this.userBookingData = {}; // Store booking data per user
    this.userBookingStep = {}; // Track current step in booking process per user
    this.userBookingFinalizedTime = {}; // Track when booking was finalized for delayed confirmation

    // Clean up duplicate tracking every 5 minutes to prevent memory leaks
    setInterval(() => {
      this.lastResponseSentForUser = {};
      this.userBookingState = {};
      this.userBookingData = {};
      this.userBookingStep = {};
      this.userBookingFinalizedTime = {};
    }, 5 * 60 * 1000);
  }

  loadPackagesData() {
    try {
      const data = fs.readFileSync(config.TRAVEL_PACKAGES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading packages data:', error);
      return { packages: [] };
    }
  }

  loadCompanyInfo() {
    try {
      const filePath = path.join(__dirname, 'About unravel.txt');
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('Error loading company info:', error);
      return '';
    }
  }

  loadPackageDetails() {
    try {
      const packages = {};
      const packageFiles = [
        'A London Christmas.txt',
        'A New York Christmas.txt',
        'A Parisian Noël.txt',
        'A week with Santa.txt'
      ];

      packageFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          packages[file] = fs.readFileSync(filePath, 'utf8');
        }
      });

      return packages;
    } catch (error) {
      console.error('Error loading package details:', error);
      return {};
    }
  }

  async getAIResponse(userMessage, userId, conversationHistory = '', hasQuotesBeenSent = false) {
    
    if (this.userBookingFinalizedTime[userId] && Date.now() - this.userBookingFinalizedTime[userId] >= 5 * 60 * 1000) {
      delete this.userBookingFinalizedTime[userId];
   
      const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
      const destination = selectedPackage ? selectedPackage.destination : 'London';

      return `TRAVEL QUOTES RECEIVED

Destination: ${destination}

Price: 

Next Steps:

Send "book my trip" to proceed with booking
Our executive will contact you to complete the booking process

Thank you for choosing Unravel Experience`;
    }

    // Initialize booking state and data if not present
    if (!this.userBookingState[userId]) {
      this.userBookingState[userId] = false;
      this.userBookingData[userId] = {
        customerName: '',
        selectedPackage: '',
        startDate: '',
        numberOfPeople: '',
        specialNotes: ''
      };
      this.userBookingStep[userId] = 0; // 0 means not started
    }

    const lowerMessage = userMessage.toLowerCase();

    // Check if this is a greeting
    if (this.isGreeting(userMessage)) {
      return `Hello. Welcome to Unravel Experience

Explore our featured packages:
A London Christmas - 8 nights/9 days
A New York Christmas - 4 nights/5 days
A Parisian Noël - 6 nights/7 days
A Week with Santa - 6 nights/7 days

Tell me which destination interests you most, and I'll provide detailed information.`;
    }



    // Start booking flow on trigger phrases
    if (lowerMessage.includes('ready for this package') || lowerMessage.includes('ready to book')) {
      this.userBookingState[userId] = true;
      this.userBookingStep[userId] = 1; // Start with collecting full name

      // Determine which package user is interested in based on conversation history
      const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
      const packageName = selectedPackage ? selectedPackage.name : 'London Christmas';

      return `I would be happy to help you book your ${packageName} trip.

Let's start with your booking details.

Please provide your full name:`;
    }

    // If user is in booking process, handle sequential data collection
    if (this.userBookingState[userId]) {
      const bookingData = this.userBookingData[userId];
      const step = this.userBookingStep[userId];

      // Helper to validate date format (simple DD/MM/YYYY)
      const isValidDate = (dateStr) => {
        const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = dateStr.match(regex);
        if (!match) return false;
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        if (year < 2024 || year > 2030) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        return true;
      };

      switch (step) {
        case 1: // Collect full name
          if (userMessage.trim().length < 3) {
            return "Please provide a valid full name.";
          }
          bookingData.customerName = userMessage.trim();
          this.userBookingStep[userId] = 2;
          return "How many travelers will be joining this trip? (e.g., 2)";

        case 2: // Collect number of people
          const numPeople = parseInt(userMessage.trim(), 10);
          if (isNaN(numPeople) || numPeople < 1 || numPeople > 20) {
            return "Please provide a valid number of people (1-20).";
          }
          bookingData.numberOfPeople = numPeople.toString();
          this.userBookingStep[userId] = 3;
          return "What's your preferred travel date? (e.g., 15/12/2025)";

        case 3: // Collect start date
          if (!isValidDate(userMessage.trim())) {
            return "Please provide a valid start date in DD/MM/YYYY format.";
          }
          bookingData.startDate = userMessage.trim();
          this.userBookingStep[userId] = 4;
          return "Any special requirements or preferences? (or type 'none' if no special requirements)";

        case 4: // Collect special notes
          bookingData.specialNotes = userMessage.trim();
          this.userBookingStep[userId] = 5;

          // Determine which package user is interested in based on conversation history
          const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
          const packageName = selectedPackage ? selectedPackage.name : 'London Christmas';

          // Show summary and ask for confirmation
          return `BOOKING SUMMARY

Name: ${bookingData.customerName}
Travelers: ${bookingData.numberOfPeople}
Travel Date: ${bookingData.startDate}
Requirements: ${bookingData.specialNotes}
Package: ${packageName}

All details collected. Reply with 'finalize' to confirm your booking.

Thank you for choosing Unravel Experience.`;

        case 5: // Confirmation step
          if (lowerMessage === 'finalize') {
            this.userBookingState[userId] = false;
            this.userBookingStep[userId] = 0;

            // Get destination from conversation history
            const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
            const destination = selectedPackage ? selectedPackage.destination : 'London';

            return `Our team is currently gathering the best vendor quotes for your trip.

You will receive the pricing details shortly. Please wait for our message with the travel quotes.

Thank you for your patience.`;
          } else {
            return 'Please reply with "finalize" to confirm your booking.';
          }

        default:
          this.userBookingState[userId] = false;
          this.userBookingStep[userId] = 0;
          return "Booking process ended. If you want to start again, please say 'ready to book'.";
      }
    }

    // Check for "book my trip" - final booking step
    if (lowerMessage.includes('book my trip')) {
      const bookingData = this.userBookingData[userId];
      if (bookingData && bookingData.customerName) {
        // Determine which package user is interested in based on conversation history
        const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
        const destination = selectedPackage ? selectedPackage.destination : 'London';

        return `BOOKING REQUEST RECEIVED

Your Booking Summary:
Name: ${bookingData.customerName}
Phone: ${userId}
Destination: ${destination}
Start Date: ${bookingData.startDate}
End Date: 22/12/2025
No. of People: ${bookingData.numberOfPeople}
Requirements: ${bookingData.specialNotes}
Total Amount: TBD

Next Steps:
Our executive team has been notified
You will receive a call within 24 hours
Payment and final details will be confirmed

Thank you for choosing Unravel Experience`;
      } else {
        return "I'd be happy to help you book your trip! Please start by saying 'ready for this package' to begin the booking process.";
      }
    }

    // Check if this is a company-related question about Unravel
    if (this.isCompanyQuestion(userMessage.toLowerCase())) {
      const companyPrompt = `You are Unravel One, the AI travel assistant for Unravel Experiences.

COMPANY INFORMATION:
${this.companyInfo}

RULES:
1. Use ONLY the company information provided above to answer questions about Unravel Experiences
2. Answer questions about the company, its mission, approach, and services
3. Be helpful and informative about what makes Unravel Experiences unique
4. Focus on the company's values and approach to travel
5. Do not mention specific packages unless asked

Customer message: "${userMessage}"

Answer the customer's question about Unravel Experiences using the company information provided above.`;

      try {
        const aiResponse = await this.openRouterService.generateResponse(companyPrompt);
        return aiResponse;
      } catch (error) {
        if (!error.message?.includes('quota')) {
          console.error('Error getting AI response for company question:', error);
        }
        return "Unravel Experiences is a luxury experiential travel company that curates hand-built journeys for travelers seeking authentic, meaningful travel experiences.";
      }
    }

    // Check if this is a package-related question - AI Prompt 1
    const packageQuestion = this.isPackageQuestion(userMessage.toLowerCase()) ||
                           this.isDetailedTravelQuestion(userMessage.toLowerCase());
    if (packageQuestion) {
      const selectedPackage = this.getSelectedPackageFromHistory(conversationHistory);
      if (selectedPackage) {
        // Get the specific package file content for the selected package
        const packageFileName = this.getPackageFileName(selectedPackage.name);
        const selectedPackageContent = this.packageDetails[packageFileName] || '';
        
        // AI Prompt: Answer about selected package ONLY
        const packagePrompt = `You are Unravel One: minimal, professional, softly young. You are calm, confident, and helpful.

SELECTED PACKAGE INFORMATION ONLY:
${selectedPackageContent}

RULES:
1. Use ONLY the information from the selected package file above to answer questions
2. Do NOT mention other packages or compare with other packages
3. Answer questions specifically about ${selectedPackage.name} based on the provided content
4. If the information is not in the package file, say "I don't have that specific information about this package"
5. Be concise and accurate based on the package details provided
6. Focus only on the ${selectedPackage.name} package
7. Use short sentences (4-12 words maximum)
8. No emojis or exclamation marks
9. Minimal, warm, and intentional tone
10. Answer in 1-2 sentences maximum

Customer message: "${userMessage}"

Answer the customer's question using ONLY the ${selectedPackage.name} package information provided above.`;

        try {
          const aiResponse = await this.openRouterService.generateResponse(packagePrompt);
          return aiResponse;
        } catch (error) {
          if (!error.message?.includes('quota')) {
            console.error('Error getting AI response for package question:', error);
          }
          const fallbackResponse = this.answerPackageQuestion(userMessage.toLowerCase(), selectedPackage);
          return fallbackResponse;
        }
      }
    }

    // Check for "book my trip" - AI Prompt 4
    if (userMessage.toLowerCase().includes('book my trip')) {
      const bookTripPrompt = `You are Unravel One, the AI travel assistant for Unravel Experiences.

COMPANY INFORMATION:
${this.companyInfo}

AVAILABLE PACKAGES:
${Object.entries(this.packageDetails).map(([name, content]) => `\n--- ${name} ---\n${content}`).join('\n')}

RULES:
1. Use the company information and package details from the text files to answer questions
2. Help customers with booking inquiries
3. Provide information about available packages
4. Guide them through the booking process
5. Be warm, helpful, and professional

Customer message: "${userMessage}"

Conversation history:
${conversationHistory}

Help the customer with their booking inquiry using the provided company and package information.`;

      try {
        const aiResponse = await this.openRouterService.generateResponse(bookTripPrompt);
        return aiResponse;
      } catch (error) {
        if (!error.message?.includes('quota')) {
          console.error('Error getting AI response for book my trip:', error);
        }
        return "I'd be happy to help you book your trip! What questions do you have about the Bali Explorer package?";
      }
    }

    // If quotes have been sent, don't collect booking information again
    if (hasQuotesBeenSent) {
      // Use AI service to generate a general response
      const aiPrompt = `You are Unravel One, the AI travel assistant for Unravel Experiences.

COMPANY INFORMATION:
${this.companyInfo}

AVAILABLE PACKAGES:
${Object.entries(this.packageDetails).map(([name, content]) => `\n--- ${name} ---\n${content}`).join('\n')}

The customer has already received travel quotes.

RULES:
1. Use the company information and package details to answer questions
2. If they mention booking or quotes, remind them they can use "book my trip" to proceed
3. Be helpful and provide accurate information from the files

Customer message: "${userMessage}"

Conversation history:
${conversationHistory}

Provide a helpful response using the provided company and package information.`;

      try {
        const aiResponse = await this.openRouterService.generateResponse(aiPrompt);
        return aiResponse || "I'm here to help! Since you've received quotes, you can proceed with booking using the available commands.";
      } catch (error) {
        if (!error.message?.includes('quota')) {
          console.error('Error getting AI response:', error);
        }
        return "I'm here to help with your travel plans! Since quotes have been sent, you can use 'book my trip' to proceed with booking.";
      }
    }

    // Default fallback response - use AI to generate helpful response
    const packageNames = Object.keys(this.packageDetails).join(', ');
    const generalPrompt = `You are Unravel One, the AI travel assistant for Unravel Experiences.

COMPANY INFORMATION:
${this.companyInfo.substring(0, 1000)}...

AVAILABLE PACKAGES:
${packageNames}

RULES:
1. Use the company information to answer questions about Unravel
2. Be warm, helpful, and professional  
3. Provide accurate information based on the files
4. NEVER repeat or echo the customer's message back to them
5. If asked about packages, mention: ${packageNames}
6. If asked about Unravel, use the company information provided
7. Always provide a unique, helpful response that answers the customer's question or provides relevant information

Customer message: "${userMessage}"

Provide a helpful, unique response using the provided company information. Do not repeat the customer's message.`;

    try {
      const aiResponse = await this.openRouterService.generateResponse(generalPrompt);
      return aiResponse || "If you have any questions about the package or want to proceed with booking, just let me know!";
    } catch (error) {
      if (!error.message?.includes('quota')) {
        console.error('Error getting general AI response:', error);
      }
      return "If you have any questions about the package or want to proceed with booking, just let me know!";
    }
  }

  isCompanyQuestion(message) {
    const companyKeywords = [
      'unravel', 'unravel experiences', 'company', 'about', 'who are', 'what is', 'your company',
      'your mission', 'your approach', 'why choose', 'what makes', 'how do', 'your service',
      'your philosophy', 'your values', 'about unravel', 'unravel travel', 'unravel company'
    ];
    return companyKeywords.some(keyword => message.includes(keyword));
  }

  isPackageQuestion(message) {
    const questionKeywords = ['accommodation', 'hotel', 'star', 'restaurant', 'cafe', 'nearby', 'places', 'visit', 'what', 'how', 'where', 'is there', 'do i get', 'included'];
    return questionKeywords.some(keyword => message.includes(keyword));
  }

  isDetailedTravelQuestion(message) {
    const detailedKeywords = [
      'day 1', 'day 2', 'day 3', 'day 4', 'day 5', 'day one', 'day two', 'day three', 'day four', 'day five',
      'first day', 'second day', 'third day', 'fourth day', 'fifth day',
      'itinerary', 'schedule', 'activities', 'plan', 'agenda', 'timeline',
      'more info', 'more information', 'details', 'tell me about', 'explain',
      'what do we do', 'what happens', 'what will we', 'what can we',
      'food', 'meals', 'breakfast', 'lunch', 'dinner', 'eat',
      'transport', 'transfer', 'pickup', 'drop', 'airport',
      'temple', 'beach', 'culture', 'tour', 'guide', 'sightseeing',
      'spa', 'massage', 'relax', 'wellness',
      'shopping', 'market', 'souvenir', 'buy',
      'weather', 'climate', 'temperature', 'season',
      'currency', 'money', 'payment', 'cost', 'price',
      'language', 'speak', 'english', 'local',
      'safety', 'safe', 'security', 'precaution'
    ];
    return detailedKeywords.some(keyword => message.includes(keyword));
  }

  getSelectedPackageFromHistory(conversationHistory) {
    const history = conversationHistory.toLowerCase();
    // Check for package mentions in conversation
    if (history.includes('london')) {
      return { name: 'A London Christmas', destination: 'London' };
    } else if (history.includes('new york')) {
      return { name: 'A New York Christmas', destination: 'New York' };
    } else if (history.includes('paris')) {
      return { name: 'A Parisian Noël', destination: 'Paris' };
    } else if (history.includes('santa') || history.includes('lapland')) {
      return { name: 'A Week with Santa', destination: 'Lapland, Finland' };
    }
    return null;
  }

  getPackageFileName(packageName) {
    const fileMapping = {
      'A London Christmas': 'A London Christmas.txt',
      'A New York Christmas': 'A New York Christmas.txt',
      'A Parisian Noël': 'A Parisian Noël.txt',
      'A Week with Santa': 'A week with Santa.txt'
    };
    return fileMapping[packageName] || '';
  }

  answerPackageQuestion(question, packageData) {
    let response = '';

    if (question.includes('accommodation') || question.includes('hotel') || question.includes('star')) {
      response = `Accommodation Details:\n\n` +
        `${packageData.accommodation.name}\n` +
        `Type: ${packageData.accommodation.type}\n` +
        `Location: ${packageData.accommodation.location}\n` +
        `Amenities: ${packageData.accommodation.amenities.join(', ')}\n\n` +
        `This is a comfortable ${packageData.accommodation.type.split(' ')[0]} resort for your stay.\n\n` +
        `If you're ready to proceed with booking, reply "ready for this package".`;
    } else if (question.includes('restaurant') || question.includes('cafe') || question.includes('food') || question.includes('eat')) {
      response = `Nearby Restaurants & Cafes:\n\n` +
        `Restaurants:\n${packageData.accommodation.nearby_restaurants.map(r => `• ${r}`).join('\n')}\n\n` +
        `Cafes:\n${packageData.accommodation.nearby_cafes.map(c => `• ${c}`).join('\n')}\n\n` +
        `Enjoy local flavors and international cuisine near your accommodation.\n\n` +
        `If you're ready to proceed with booking, reply "ready for this package".`;
    } else if (question.includes('places') || question.includes('visit') || question.includes('nearby') || question.includes('attractions')) {
      response = `Nearby Places to Visit:\n\n${packageData.accommodation.nearby_attractions.map(a => `• ${a}`).join('\n')}\n\n` +
        `Explore these locations during your free time.\n\n` +
        `If you're ready to proceed with booking, reply "ready for this package".`;
    } else {
      // General package info
      response = `Package Information:\n\n` +
        `${packageData.name}\n` +
        `Destination: ${packageData.destination}\n` +
        `Duration: ${packageData.duration}\n\n` +
        `Highlights: ${packageData.highlights.join(', ')}\n\n` +
        `Inclusions: ${packageData.inclusions.join(', ')}\n\n` +
        `If you have specific questions about accommodation, food, or activities, ask.\n\n` +
        `If you're ready to proceed with booking, reply "ready for this package".`;
    }

    return response;
  }

  isGreeting(message) {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'hola', 'bonjour', 'ciao'];
    const lowerMessage = message.toLowerCase().trim();

    // Check if the message is only a greeting (or greeting with basic punctuation)
    return greetings.some(greet => {
      const greetPattern = new RegExp(`^\\s*${greet}\\s*[.!?]*\\s*$`, 'i');
      return greetPattern.test(lowerMessage);
    });
  }

  isTravelDocumentQuestion(message) {
    const keywords = [
      'passport', 'pass port', 'visa', 'documents', 'id card', 'identification',
      'travel documents', 'passport required', 'passport needed', 'passport necessary',
      'do i need', 'do we need', 'need passport', 'bring passport', 'is passport',
      'passport?', 'passports', 'pass port?'
    ];
    return keywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()));
  }

  async answerTravelDocumentQuestion(message, conversationHistory = '') {
    // Use AI to generate a contextual response for travel document questions
    const aiPrompt = `You are a helpful travel assistant for Unravel Experience. A customer is asking about travel documents.

Customer message: "${message}"

Conversation history:
${conversationHistory}

Please provide a helpful, accurate response about travel documents. If they mention a specific destination or package, tailor your answer accordingly. If no specific destination is mentioned, give general advice about international travel requirements.`;

    try {
      const aiResponse = await this.openRouterService.generateResponse(aiPrompt);
      return aiResponse || "For international travel, you'll typically need a valid passport and possibly a visa. Please check the specific requirements for your destination.";
    } catch (error) {
      if (!error.message?.includes('quota')) {
        console.error('Error getting AI response for travel documents:', error);
      }
      return "For international travel, you'll typically need a valid passport and possibly a visa. Please check the specific requirements for your destination.";
    }
  }

  // New method to handle contextual package questions with explicit package name
  async getContextualPackageAnswer(userMessage, selectedPackageName, conversationHistory) {
    try {
      // Get the specific package file content for the selected package
      const packageFileName = this.getPackageFileName(selectedPackageName);
      const selectedPackageContent = this.packageDetails[packageFileName] || '';
      
      // Extract only key information to reduce token usage
      const keyInfo = this.extractKeyPackageInfo(selectedPackageContent);
      
      // AI Prompt: Answer about selected package ONLY with minimal info
      const packagePrompt = `You are Unravel One: minimal, professional, softly young.

SELECTED PACKAGE: ${selectedPackageName}
KEY PACKAGE INFORMATION:
${keyInfo}

RULES:
1. Use ONLY the key information above to answer questions
2. Answer specifically about ${selectedPackageName}
3. If information not available, say "I don't have that specific information"
4. Use short sentences (4-12 words maximum)
5. No emojis or exclamation marks
6. Answer in 1-2 sentences maximum
7. NEVER provide price or price range information
8. If asked about price, say "I will share pricing details as you complete your booking"

Question: ${userMessage}

Answer:`;

      const aiResponse = await this.openRouterService.generateResponse(packagePrompt);
      return aiResponse;
    } catch (error) {
      if (!error.message?.includes('quota')) {
        console.error('Error getting contextual package answer:', error);
      }
      return "I don't have that specific information about this package.";
    }
  }

  // Extract key information from package content to reduce tokens
  extractKeyPackageInfo(packageContent) {
    const lines = packageContent.split('\n');
    const keyInfo = [];
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Include only essential information lines (EXCLUDE price-related)
      if ((lowerLine.includes('duration') || 
           lowerLine.includes('days') || 
           lowerLine.includes('nights') ||
           lowerLine.includes('included') ||
           lowerLine.includes('highlights') ||
           lowerLine.includes('destination') ||
           lowerLine.includes('location')) &&
          !lowerLine.includes('price') &&
          !lowerLine.includes('cost') &&
          !lowerLine.includes('rate') &&
          !lowerLine.includes('charge') &&
          !lowerLine.includes('fee') &&
          !lowerLine.includes('$') &&
          !lowerLine.includes('₹') &&
          !lowerLine.includes('€')) {
        keyInfo.push(line.trim());
      }
      
      // Limit to 10 most relevant lines
      if (keyInfo.length >= 10) break;
    }
    
    return keyInfo.join('\n');
  }
}

module.exports = new AIService();
