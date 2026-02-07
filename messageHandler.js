const aiService = require('./aiService');

const apiConnector = require('./apiConnector');

const conversationManager = require('./conversationManager');

const customerGreetingHandler = require('./customerGreetingHandler');

const config = require('./config');



// Wrapper sendMessage: use Baileys bot instance

async function sendMessage(to, text) {

  // Helper: normalize to digits only (strip any @suffix or non-digits)

  const normalizeDigits = (input) => {

    if (!input) return '';

    let s = String(input);

    if (s.includes('@')) s = s.replace(/@.*$/, '');

    // keep only digits

    s = s.replace(/[^0-9]/g, '');

    return s;

  };



  // Try send using appropriate channel and recipient formatting

  const trySend = async (recipientRaw, body) => {

    const digits = normalizeDigits(recipientRaw);

    // Use Baileys bot instance only
    if (global.botInstance && typeof global.botInstance.sendMessage === 'function') {

      const botRecipient = digits ? `${digits}@c.us` : recipientRaw; // fallback to raw if normalization fails

      console.log(`Sending via Baileys to ${botRecipient}`);

      return await global.botInstance.sendMessage(botRecipient, { text: body });

    }

    throw new Error('Baileys bot instance not available or not connected');

  };



  // Perform primary try + single retry
  try {

    return await trySend(to, text);

  } catch (err) {

    console.warn('Send failed, retrying once after delay:', err && (err.message || err));

    await new Promise(r => setTimeout(r, 800));

    try {

      return await trySend(to, text);

    } catch (err2) {

      console.error('Final send attempt failed:', err2 && (err2.message || err2));
      throw err2;

    }

  }

}

const mysqlConnector = require('./mysqlConnector');



class MessageHandler {

  constructor() {

    this.customerGreetingHandler = new customerGreetingHandler();

    this.userMessageQueues = new Map(); // Map to hold per-user message processing promises

    this.processedMessageIds = new Set(); // Set to track processed message IDs for deduplication

    this.userLastGreetingTime = new Map(); // Track last greeting time per user

    this.GREETING_RATE_LIMIT = 30000; // 30 seconds between greetings from same user

  }



  normalizePhoneNumber(phone) {

    if (!phone) return '';

    let normalized = phone;

    if (normalized.includes('@')) {

      normalized = normalized.replace(/@.*$/, '');

    }

    normalized = normalized.replace(/[^0-9]/g, '');

    return normalized;

  }



  // Helper method to get clean phone number for sending messages

  getCleanPhoneNumber(msg) {

    return this.normalizePhoneNumber(msg.from);

  }







  isPackageSelection(text) {

    const lowerText = text.toLowerCase();

    const packageKeywords = ['bali explorer', 'paris explorer', 'london explorer', 'bali', 'paris', 'london', 'p001', 'p002', 'p003'];

    return packageKeywords.some(pkg => lowerText.includes(pkg));

  }



  async handlePackageSelection(msg, customerData) {

    try {

      conversationManager.addMessage(msg.from, msg.body, false);



      const packageName = msg.body.trim();

      const packageIdMap = {

        'bali explorer': 'P001',

        'paris explorer': 'P002',

        'london explorer': 'P003',

        'bali': 'P001',

        'paris': 'P002',

        'london': 'P003',

        'P001': 'P001',

        'P002': 'P002',

        'P003': 'P003',

        'p001': 'P001',

        'p002': 'P002',

        'p003': 'P003',

        'santa': 'P004',

        'week with santa': 'P004',

        'lapland': 'P004'

      };

      const selectedPackageId = packageIdMap[packageName.toLowerCase()] || null;



      if (!selectedPackageId) {

        await sendMessage(this.getCleanPhoneNumber(msg), "Sorry, I couldn't recognize that package. Please select a valid package.");

        return;

      }



      // Package file mapping for text files and PDFs

      const packageFileMap = {

        'P001': { textFile: 'A London Christmas.txt', pdfFile: 'Unravel x A London Christmas.pdf', packageName: 'A London Christmas' },

        'P002': { textFile: 'A New York Christmas.txt', pdfFile: 'Unravel x A New York Christmas.pdf', packageName: 'A New York Christmas' },

        'P003': { textFile: 'A Parisian Noël.txt', pdfFile: 'Unravel x A Parisian Noel.pdf', packageName: 'A Parisian Noël' },

        'P004': { textFile: 'A week with Santa.txt', pdfFile: 'Unravel x Lapland.pdf', packageName: 'A Week with Santa' }

      };



      const packageInfo = packageFileMap[selectedPackageId];

      if (!packageInfo) {

        await sendMessage(msg.from, "Sorry, package details are not available right now.");

        return;

      }



      // Extract brief itinerary overview from text file

      const fs = require('fs');

      const path = require('path');

      const textFilePath = path.join(__dirname, packageInfo.textFile);



      if (!fs.existsSync(textFilePath)) {

        await sendMessage(msg.from, "Sorry, package details are not available right now.");

        return;

      }



      const fileContent = fs.readFileSync(textFilePath, 'utf8');

      const lines = fileContent.split('\n');



      // Extract the "Itinerary Overview" section

      let itineraryOverview = '';

      let inOverviewSection = false;

      for (const line of lines) {

        if (line.includes('1. Itinerary Overview')) {

          inOverviewSection = true;

          continue;

        }

        if (inOverviewSection && line.includes('2. Day-by-Day Breakdown')) {

          break;

        }

        if (inOverviewSection) {

          itineraryOverview += line + '\n';

        }

      }



      // Send brief itinerary message

      const phoneNumber = msg.from.replace('@c.us', '');

      const briefItineraryMessage = `${packageInfo.packageName}\n\n${itineraryOverview.trim()}`;

      await sendMessage(phoneNumber, briefItineraryMessage);

      conversationManager.addMessage(msg.from, briefItineraryMessage, true);



      // Send PDF brochure IMMEDIATELY after brief itinerary
      console.log('About to send PDF for package:', packageInfo.packageName);
      console.log('PDF file path:', packageInfo.pdfFile);
      
      const pdfPath = path.join(__dirname, 'Brochures', packageInfo.pdfFile);
      console.log('Full PDF path:', pdfPath);
      console.log('PDF exists:', fs.existsSync(pdfPath));

      if (fs.existsSync(pdfPath)) {
        console.log('PDF file exists, checking bot availability...');
        console.log('global.botInstance exists:', !!global.botInstance);
        console.log('sendDocument function exists:', !!(global.botInstance && typeof global.botInstance.sendDocument === 'function'));
        
        try {
          console.log('Sending PDF brochure for:', packageInfo.packageName);
          
          // Try to send via Baileys bot if available
          if (global.botInstance && typeof global.botInstance.sendDocument === 'function') {
            console.log('Using Baileys bot to send PDF...');
            await global.botInstance.sendDocument(`${phoneNumber}@c.us`, pdfPath, packageInfo.pdfFile, `${packageInfo.packageName} Brochure`);
            console.log('PDF sent via Baileys bot');
          } else {
            console.log('Baileys bot not available, trying Meta API...');
            // Fallback to Meta API if available
            const whatsappModule = require('./whatsapp');
            console.log('whatsappModule exists:', !!whatsappModule);
            console.log('sendDocument function exists:', !!(whatsappModule && typeof whatsappModule.sendDocument === 'function'));
            
            if (whatsappModule && typeof whatsappModule.sendDocument === 'function') {
              await whatsappModule.sendDocument(phoneNumber, pdfPath, packageInfo.pdfFile, `${packageInfo.packageName} Brochure`);
              console.log('PDF sent via Meta API');
            } else {
              console.log('No PDF sending method available');
            }
          }
        } catch (pdfError) {
          console.error('Error sending PDF:', pdfError);
          // Don't fail the whole process if PDF sending fails
        }
      } else {
        console.log('PDF file does not exist:', pdfPath);
      }



      // Send confirmation message

      const confirmationMessage = `Itinerary Confirmation\n\nI've sent you the brief itinerary and PDF brochure for ${packageInfo.packageName}. Please review them and let me know if you have any questions or if you're ready to proceed with booking.`;

      await sendMessage(phoneNumber, confirmationMessage);

      conversationManager.addMessage(msg.from, confirmationMessage, true);



      // Send instruction message

      const instructionMessage = `If you have any questions about this package, feel free to ask! If you're ready to proceed, reply 'ready for this ${packageInfo.packageName}'.`;

      await sendMessage(phoneNumber, instructionMessage);

      conversationManager.addMessage(msg.from, instructionMessage, true);



    } catch (error) {

      console.error('Error handling package selection:', error);

      await this.sendErrorNotification(msg.from, 'Failed to load package details. Please try again.');

    }

  }



  // Method to handle vendor quotes received from backend webhook

  async handleVendorQuotes(quoteData) {

    try {

      console.log(' RECEIVED VENDOR QUOTES (vendor_quotes_complete):', JSON.stringify(quoteData, null, 2));



      // Validate that customer_phone is present in quoteData

      if (!quoteData.customer_phone) {

        console.error(' ERROR: Missing customer_phone in quoteData');

        console.error('QuoteData received:', quoteData);

        return; // Don't process quotes without customer phone

      }



      const customerPhone = quoteData.customer_phone.trim();

      console.log(` PROCESSING QUOTES FOR: ${customerPhone}`);



      // Validate phone number format (should be numeric)

      if (!/^\d+$/.test(customerPhone)) {

        console.error(` ERROR: Invalid phone number format: ${customerPhone}`);

        return;

      }



      // Store quote data in conversation manager for later use

      const customerChatId = `${customerPhone}@c.us`;

      conversationManager.storeQuoteData(customerChatId, quoteData);

      console.log(` QUOTES STORED: For customer ${customerChatId}`);



      // Format and send quote message to customer

      const quoteMessage = this.formatQuoteMessage(quoteData);

      console.log(` FORMATTED MESSAGE:`);

      console.log(quoteMessage);

      console.log(` SENDING TO: ${customerPhone}`);



      await sendMessage(customerPhone, quoteMessage);

      console.log(` QUOTE MESSAGE SENT: Successfully sent to ${customerPhone}`);



      // Save bot message to conversation history

      conversationManager.addMessage(customerChatId, quoteMessage, true);

      console.log(` CONVERSATION UPDATED: Quote message saved for ${customerChatId}`);



    } catch (error) {

      console.error(' ERROR handling vendor quotes:', error);

      console.error('Error stack:', error.stack);

      console.error('QuoteData that caused error:', quoteData);

    }

  }





  // Format quote message for customer

  formatQuoteMessage(quoteData) {

    console.log(' Quote data received:', JSON.stringify(quoteData, null, 2));

    

    let message = ' **TRAVEL QUOTES RECEIVED!**\n\n';

    message += ` Destination: ${quoteData.destination}\n\n`;

    

    // Use final price from backend with fallback calculation

    let finalPrice = quoteData.final_price_inr || quoteData.grand_total_inr;

    

    if (!finalPrice && quoteData.grand_total) {

      // Backend is sending grand_total in INR already

      finalPrice = Math.round(parseFloat(quoteData.grand_total));

      console.log(` Using grand_total as INR: ₹${finalPrice}`);

    }

    

    message += ` Price: ₹${finalPrice || 'TBD'}\n\n`;

    

    message += ' *Next Steps:*\n\n';

    message += '• Send *"book my trip"* to proceed with booking\n';

    message += '• Our executive will contact you to complete the booking process\n\n';

    

    message += ' Thank you for choosing *Unravel Experience*!';

    

    return message;

  }



  isGreeting(text) {

    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];

    const lowerText = text.toLowerCase().trim();

    return greetings.some(greet => {

      const greetPattern = new RegExp(`^\\s*${greet}\\s*[.!?]*\\s*$`, 'i');

      return greetPattern.test(lowerText);

    });

  }



  isPriceInquiry(text) {

    const priceKeywords = ['price', 'cost', 'rate', 'quote', 'inquiry', 'budget'];

    const lowerText = text.toLowerCase();

    return priceKeywords.some(keyword => lowerText.includes(keyword));

  }



  isNextStepsInquiry(text) {

    const nextStepsKeywords = ['next steps', 'how to book', 'book this', 'proceed with booking', 'what are the next steps'];

    const lowerText = text.toLowerCase();

    return nextStepsKeywords.some(keyword => lowerText.includes(keyword));

  }



  async handleNextStepsInquiry(msg, customerData) {

    try {

      const nextStepsMessage = "Here are the next steps to book your Parisian Noël package:\n\n" +

        "1. **Share your preferred travel dates** with me. This will allow us to provide a customized quote based on availability and seasonal pricing.\n\n" +

        "2. **Once you confirm your travel dates**, a member of our Unravel team will reach out to finalize the booking and collect payment.\n\n" +

        "The payment process is handled directly by our human team members, not through the Unravel One AI assistant. They will provide details on the payment terms, deposit requirements, and schedule.\n\n" +

        "3. **After your booking is confirmed**, we'll take care of all the details - from arranging your accommodations and transfers to securing reservations for the activities and experiences included in the itinerary.\n\n" +

        "4. **Throughout your trip**, you'll have 24/7 access to Unravel One, your digital travel companion, for any questions, updates, or support needs.\n\n" +

        "Please let me know if you have any questions about this process.";



      await sendMessage(this.getCleanPhoneNumber(msg), nextStepsMessage);

      conversationManager.addMessage(msg.from, msg.body, false);

      conversationManager.addMessage(msg.from, nextStepsMessage, true);

    } catch (error) {

      console.error('Error handling next steps inquiry:', error);

      await this.sendErrorNotification(msg.from, 'Failed to provide booking steps. Please try again.');

    }

  }



  async handlePriceInquiry(msg, customerData) {

    try {

      const inquiryData = {

        customer_phone: msg.from.replace('@c.us', ''),

        inquiry_text: msg.body,

        customer_data: customerData || null

      };



      const result = await apiConnector.sendVendorEmail(inquiryData);



      if (result) {

        const message = "Thank you for your inquiry! Our team will get back to you with pricing details soon.";

        console.log(` Bot response to ${msg.from}: ${message}`);

        await sendMessage(this.getCleanPhoneNumber(msg), message);

      } else {

        const message = "Sorry, there was an issue processing your inquiry. Please try again later.";

        console.log(` Bot response to ${msg.from}: ${message}`);

        await sendMessage(this.getCleanPhoneNumber(msg), message);

      }

    } catch (error) {

      console.error('Error handling price inquiry:', error);

      const message = "Sorry, there was an error processing your request. Please try again.";

      console.log(` Bot response to ${msg.from}: ${message}`);

      await sendMessage(msg.from, message);

    }

  }



  containsBookingInfo(text) {

    const bookingKeywords = [

      'book my trip', 'book this trip', 'i want to book', 'make a booking',

      'reserve this package', 'book the package', 'proceed with booking'

    ];

    const lowerText = text.toLowerCase();

    return bookingKeywords.some(keyword => lowerText.includes(keyword));

  }



  isFinalizeCommand(text) {

    const lowerText = text.toLowerCase().trim();

    return lowerText === 'finalize' || lowerText === 'finialize' || lowerText === 'finalise';

  }



  isBookMyTripCommand(text) {

    const lowerText = text.toLowerCase().trim();

    return lowerText === 'book my trip' || lowerText === 'book trip';

  }



  isBookMyTripNowCommand(text) {

    const lowerText = text.toLowerCase().trim();

    return lowerText === 'book my trip now';

  }



  isReadyForThisPackageCommand(text) {

    const lowerText = text.toLowerCase().trim();

    return lowerText === 'ready for this package' || lowerText === 'ready for the package';

  }



  async handleFinalizeCommand(msg, customerData) {

    try {

      // Get booking data from the new step-by-step flow

      const bookingState = conversationManager.getBookingState(msg.from);



      let bookingInfo;



      if (bookingState && bookingState.customerName) {

        // Use data from new booking flow

        bookingInfo = {

          customerPhone: msg.from.replace('@c.us', ''),

          customerName: bookingState.customerName,

          package: 'P001',

          destination: 'Bali',

          startDate: this.convertToBackendDateFormat(bookingState.startDate),

          endDate: this.calculateEndDate(bookingState.startDate),

          numberOfPeople: bookingState.numberOfTravelers,

          totalPrice: '',

          status: 'Pending',

          notes: `Booking for ${bookingState.customerName}, ${bookingState.numberOfTravelers} travelers, from ${bookingState.startDate}. Requirements: ${bookingState.specialRequirements || 'none'}`

        };

      } else {

        // Fallback to old method

        const conversationHistory = conversationManager.getConversationHistory(msg.from);

        bookingInfo = this.extractBookingFromConversation(conversationHistory, msg.from);



        if (customerData && customerData.length > 0) {

          bookingInfo.customerName = customerData[0].name;

        }



        if (bookingInfo.package === 'Bali Explorer (P001)') {

          bookingInfo.package = 'P001';

        }



        if (!bookingInfo.customerName || bookingInfo.customerName.trim() === '') {

          bookingInfo.customerName = 'Customer';

        }



        if (!bookingInfo.numberOfPeople || bookingInfo.numberOfPeople.trim() === '') {

          bookingInfo.numberOfPeople = '1';

        }



        if (!bookingInfo.startDate || bookingInfo.startDate.trim() === '') {

          console.error(' No booking data found - cannot proceed with booking');

          const errorMessage = " **BOOKING ERROR**\n\n" +

            "I couldn't find your booking details.\n" +

            "Please start the booking process again by saying 'ready for this package'.";

          await sendMessage(msg.from, errorMessage);

          return;

        }

      }



      // Ensure end date is set

      if (!bookingInfo.endDate || bookingInfo.endDate.trim() === '') {

        bookingInfo.endDate = this.calculateEndDate(bookingInfo.startDate);

      }



      // Save booking to MySQL database first

      const bookingData = {

        name: bookingInfo.customerName,

        destination: bookingInfo.destination,

        travel_date: bookingInfo.startDate,

        end_date: bookingInfo.endDate,

        guests: bookingInfo.numberOfPeople,

        special_requests: bookingInfo.notes,

        user_id: bookingInfo.customerPhone,

        phone: bookingInfo.customerPhone

      };



      await mysqlConnector.createBooking(bookingData);

      console.log(' Booking saved to database');



      // Send waiting message first

      const waitingMessage = " **Our team is currently gathering the best vendor quotes for your trip.**\n\n" +

        "You will receive the pricing details shortly. Please wait for our message with the travel quotes.\n\n" +

        "Thank you for your patience! ";



      console.log(` Waiting message to ${msg.from}: ${waitingMessage}`);

      await sendMessage(msg.from, waitingMessage);



      // Save the finalize command and waiting response to conversation history

      conversationManager.addMessage(msg.from, msg.body, false); // User message

      conversationManager.addMessage(msg.from, waitingMessage, true); // Bot waiting message



      // Send booking data to backend for day-wise vendor price analysis and WAIT for response

      console.log(' About to send daywise booking email with data:', JSON.stringify(bookingInfo, null, 2));

      const emailSent = await apiConnector.sendDaywiseBookingEmail(bookingInfo);

      console.log(' Email send result:', emailSent);



      if (emailSent) {

        // HARDCODED SUCCESS MESSAGE - Send only after backend confirms processing

        const successMessage = " **BOOKING FINALIZED!**\n\n" +

          " Your booking request has been successfully processed!\n" +

          " All vendor emails have been sent and our team will review your details.\n" +

          " We will contact you soon to confirm availability and process payment.\n\n" +

          "Thank you for choosing **Unravel Experience**! \n\n" +

          "*Please keep this chat open for updates.*";



        console.log(` Final confirmation to ${msg.from}: ${successMessage}`);

        await sendMessage(msg.from, successMessage);



        // Save the final confirmation to conversation history

        conversationManager.addMessage(msg.from, successMessage, true); // Bot final message



      } else {

        console.error(' Failed to send booking data to backend');



        // HARDCODED ERROR MESSAGE - No AI processing

        const errorMessage = " **BOOKING ERROR**\n\n" +

          "Sorry, there was an issue processing your booking request.\n" +

          "Please try again in a few minutes or contact our support team.\n\n" +

          ` Support: ${config.SUPPORT_PHONE}`;



        console.log(` Error response to ${msg.from}: ${errorMessage}`);

        await sendMessage(msg.from, errorMessage);



        // Save error to conversation history

        conversationManager.addMessage(msg.from, errorMessage, true);

      }

    } catch (error) {

      console.error('Error handling finalize command:', error);



      // HARDCODED ERROR MESSAGE - No AI processing

      const errorMessage = " **SYSTEM ERROR**\n\n" +

        "Sorry, there was an error processing your finalize request.\n" +

        "Please try again or contact our support team.\n\n" +

        ` Support: ${config.SUPPORT_PHONE}`;



      console.log(` Error response to ${msg.from}: ${errorMessage}`);

      await sendMessage(msg.from, errorMessage);



      // Save error to conversation history

      conversationManager.addMessage(msg.from, msg.body, false);

      conversationManager.addMessage(msg.from, errorMessage, true);

    }

  }



  async handleBookingInfo(msg, customerData) {

    try {

      // Send response asking for name first

      const phoneNumber = msg.from.replace('@c.us', '');

      const responseMessage = "Great! I'd be happy to help you book your Bali trip! 🌴\n\n" +

        "Let's start with your booking details.\n\n" +

        "Please provide your *full name*:";

      

      await sendMessage(phoneNumber, responseMessage);

      conversationManager.addMessage(msg.from, msg.body, false);

      conversationManager.addMessage(msg.from, responseMessage, true);

      

      // Set booking flow state to collect name first

      conversationManager.storeBookingState(msg.from, { bookingStep: 'collectName' });

      

    } catch (error) {

      console.error('Error handling booking info:', error);

    }

  }



  extractBookingInfo(message, userId) {

    // This function will extract booking information from user messages

    const bookingInfo = {

      customerPhone: userId.replace('@c.us', ''),

      customerName: '',

      package: '',

      destination: '',

      startDate: '',

      endDate: '',

      numberOfPeople: '',

      totalPrice: '',

      status: 'Pending',

      notes: message

    };



    const lowerMessage = message.toLowerCase();



    // Extract customer name with improved patterns

    const namePatterns = [

      // "my name is John Doe" or "I am John Doe"

      /(?:my name is|i am|this is|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,

      // "John Doe here" or "John Doe booking"

      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,

      // "booking for John Doe" or "for John Doe"

      /(?:booking for|for|traveling as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i

    ];



    for (const pattern of namePatterns) {

      const nameMatch = message.match(pattern);

      if (nameMatch) {

        const extractedName = nameMatch[1].trim();

        // Validate that it's likely a name (contains at least one space or is a common name)

        if (extractedName.length >= 2 && extractedName.length <= 50) {

          bookingInfo.customerName = extractedName;

          break;

        }

      }

    }



    // Extract package information with improved pattern matching

    if (lowerMessage.includes('bali') || lowerMessage.includes('p001') || lowerMessage.includes('explorer')) {

      bookingInfo.package = 'Bali Explorer (P001)';

      bookingInfo.destination = 'Bali';

    }



    // Extract number of people with improved patterns

    const peoplePatterns = [

      /(\d+)\s*(person|people|pax|traveller|traveler|adult|guest)/i,

      /(\d+)\s*(of us|travellers|travelers)/i,

      /(we are|there are)\s+(\d+)/i,

      /(party of|group of)\s+(\d+)/i

    ];



    for (const pattern of peoplePatterns) {

      const peopleMatch = message.match(pattern);

      if (peopleMatch) {

        const num = peopleMatch[1] || peopleMatch[2];

        if (num && parseInt(num) > 0 && parseInt(num) <= 20) {

          bookingInfo.numberOfPeople = num;

          break;

        }

      }

    }



    // Extract dates with improved pattern matching

    const datePatterns = [

      // dd/mm/yyyy or dd-mm-yyyy

      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/g,

      // dd month yyyy (e.g., 15 Aug 2026)

      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi,

      // month dd, yyyy

      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/gi

    ];



    const extractedDates = [];

    for (const pattern of datePatterns) {

      const matches = message.match(pattern);

      if (matches) {

        extractedDates.push(...matches);

      }

    }



    // Normalize and validate dates

    const normalizedDates = this.normalizeDates(extractedDates);

    if (normalizedDates.length >= 2) {

      bookingInfo.startDate = normalizedDates[0];

      bookingInfo.endDate = normalizedDates[1];

    } else if (normalizedDates.length === 1) {

      bookingInfo.startDate = normalizedDates[0];

    }



    // Extract price/budget information

    const pricePatterns = [

      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(rs|rupees|usd|dollars|\$|₹)/i,

      /(?:budget|price|cost|rate).{0,20}(\d+(?:,\d{3})*(?:\.\d{2})?)/i,

      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:per person|total|for all)/i

    ];



    for (const pattern of pricePatterns) {

      const priceMatch = message.match(pattern);

      if (priceMatch) {

        const price = priceMatch[1] || priceMatch[2];

        if (price) {

          bookingInfo.totalPrice = price.replace(/,/g, '');

          break;

        }

      }

    }



    return bookingInfo;

  }



  extractBookingFromConversation(conversationHistory, userId) {

    // Extract booking information from the entire conversation history

    const bookingInfo = {

      customerPhone: userId.replace('@c.us', ''),

      customerName: '',

      package: '',

      destination: '',

      startDate: '',

      endDate: '',

      numberOfPeople: '',

      totalPrice: '',

      status: 'Pending',

      notes: ''

    };



    // Combine all messages (both user and bot) to extract information

    const allMessages = conversationHistory

      .map(msg => msg.message)

      .join(' ');



    const lowerCombinedMessage = allMessages.toLowerCase();

    bookingInfo.notes = allMessages;



    // Extract customer name from entire conversation with improved patterns

    const namePatterns = [

      // "my name is John Doe" or "I am John Doe"

      /(?:my name is|i am|this is|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,

      // "John Doe here" or "John Doe booking"

      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,

      // "booking for John Doe" or "for John Doe"

      /(?:booking for|for|traveling as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,

      // Bot responses like "Hello John Doe" or "Thank you John"

      /(?:hello|hi|thank you|welcome)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,

      // "Customer: John Doe" or "Name: John Doe"

      /(?:customer|name|passenger|traveler)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,

      // "Test Customer" from backend data

      /(test customer)/i

    ];



    const knownPackages = ['Bali Explorer', 'Paris Explorer', 'London Explorer'];



    for (const pattern of namePatterns) {

      const nameMatch = allMessages.match(pattern);

      if (nameMatch) {

        const extractedName = nameMatch[1].trim();

        // Validate that it's likely a name (contains at least one space or is a common name)

        if (extractedName.length >= 2 && extractedName.length <= 50 && !knownPackages.some(pkg => extractedName.includes(pkg))) {

          bookingInfo.customerName = extractedName;

          break;

        }

      }

    }



    // Extract package information with improved detection

    if (lowerCombinedMessage.includes('bali explorer') || lowerCombinedMessage.includes('p001') || lowerCombinedMessage.includes('bali')) {

      bookingInfo.package = 'P001'; // Send just the package ID to backend

      bookingInfo.destination = 'Bali';

    }



    // Extract number of people with comprehensive patterns

    const peoplePatterns = [

      /(\d+)\s*(person|people|pax|traveller|traveler|adult|guest)/i,

      /(\d+)\s*(of us|travellers|travelers)/i,

      /(we are|there are|party of|group of)\s+(\d+)/i,

      /(?:for|with)\s+(\d+)\s+(?:person|people|guest|traveler)/i,

      // Specific patterns from logs: "3 guests", "3 people"

      /(\d+)\s+guests?/i,

      // Ordinal numbers: "3rd person", but extract the number

      /(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+(?:person|people|guest|traveler)/i

    ];



    for (const pattern of peoplePatterns) {

      const peopleMatch = allMessages.match(pattern);

      if (peopleMatch) {

        const num = peopleMatch[1] || peopleMatch[2];

        if (num && parseInt(num) > 0 && parseInt(num) <= 20) {

          bookingInfo.numberOfPeople = num;

          break;

        }

      }

    }



    // Extract dates with comprehensive pattern matching

    const datePatterns = [

      // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy

      /(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})/g,

      // dd month yyyy (e.g., 15 Aug 2026, 12th May 2026)

      /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi,

      // month dd, yyyy (e.g., Aug 15, 2026)

      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi,

      // yyyy-mm-dd format

      /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g

    ];



    const extractedDates = [];

    for (const pattern of datePatterns) {

      const matches = allMessages.match(pattern);

      if (matches) {

        extractedDates.push(...matches);

      }

    }



    // Normalize and validate dates using existing helper function

    const normalizedDates = this.normalizeDates(extractedDates);

    if (normalizedDates.length >= 2) {

      // Convert to YYYY-MM-DD format for backend

      bookingInfo.startDate = this.convertToBackendDateFormat(normalizedDates[0]);

      bookingInfo.endDate = this.convertToBackendDateFormat(normalizedDates[1]);

    } else if (normalizedDates.length === 1) {

      bookingInfo.startDate = this.convertToBackendDateFormat(normalizedDates[0]);

    }



    // Extract price/budget information

    const pricePatterns = [

      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(rs|rupees|usd|dollars|\$|₹)/i,

      /(?:budget|price|cost|rate).{0,20}(\d+(?:,\d{3})*(?:\.\d{2})?)/i,

      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:per person|total|for all)/i,

      // Look for numbers that might be prices in context

      /(?:rs|rupees|usd|dollars|\$|₹)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i

    ];



    for (const pattern of pricePatterns) {

      const priceMatch = allMessages.match(pattern);

      if (priceMatch) {

        const price = priceMatch[1] || priceMatch[2];

        if (price) {

          bookingInfo.totalPrice = price.replace(/,/g, '');

          break;

        }

      }

    }



    return bookingInfo;

  }



  async handleBookMyTripCommand(msg, customerData) {

    try {

      // Get conversation history and quote data

      const conversationHistory = conversationManager.getConversationHistory(msg.from);

      console.log(' DEBUG - handleBookMyTripCommand userId:', msg.from);

      console.log(' DEBUG - handleBookMyTripCommand conversationHistory length:', conversationHistory.length);

      console.log(' DEBUG - conversationHistory sample:', conversationHistory.slice(0, 2));

      

      const customerPhone = msg.from.replace('@c.us', '');

      const quoteData = conversationManager.getQuoteData(msg.from);

      

      console.log(' DEBUG - Quote data retrieved:', quoteData ? 'YES' : 'NO');

      if (quoteData) {

        console.log(' DEBUG - Has quotes array:', quoteData.quotes ? 'YES' : 'NO');

        console.log(' DEBUG - Has grand_total:', quoteData.grand_total ? quoteData.grand_total : 'NO');

      }



      // Extract comprehensive customer information

      const customerInfo = this.extractCustomerInfo(conversationHistory, customerPhone, customerData);



      // Get booking state to merge additional details

      const bookingState = conversationManager.getBookingState(msg.from);

      console.log(' DEBUG - Booking state retrieved:', bookingState ? 'YES' : 'NO');

      if (bookingState && bookingState.customerName) {

        customerInfo.name = bookingState.customerName;

        customerInfo.numberOfPeople = bookingState.numberOfTravelers;

        customerInfo.startDate = bookingState.startDate;

        customerInfo.endDate = this.calculateEndDate(bookingState.startDate);

        customerInfo.specialRequests = bookingState.specialRequirements;

        customerInfo.destination = 'Bali'; // Set destination for booking state

      }



      // Add quote information if available

      if (quoteData && quoteData.quotes) {

        customerInfo.vendorQuotes = quoteData.quotes;

        customerInfo.destination = quoteData.destination;

        

        // Use grand_total from backend if available (already in INR)

        if (quoteData.grand_total) {

          customerInfo.grandTotal = Number(quoteData.grand_total);

          customerInfo.grandTotalINR = Number(quoteData.grand_total);

        } else {

          // Fallback: sum individual quote prices

          customerInfo.grandTotal = quoteData.quotes.reduce((sum, quote) => sum + Number(quote.final_price), 0);

        }

      }



      // Build safe fields with fallbacks

      const custName = customerInfo.name || 'Customer';

      const destination = customerInfo.destination || 'Not specified';

      const travelers = customerInfo.numberOfPeople || '1';

      const startDate = customerInfo.startDate || (customerInfo.dates ? customerInfo.dates.split(' to ')[0] : new Date().toISOString().split('T')[0]);

      const endDate = customerInfo.endDate || (customerInfo.dates ? customerInfo.dates.split(' to ')[1] || this.calculateEndDate(startDate) : this.calculateEndDate(new Date().toISOString().split('T')[0]));

      const requirements = customerInfo.specialRequests || 'Not provided';

      

      // Format total amount - check if it's already in INR or needs conversion

      let totalAmount = 'TBD';

      if (typeof customerInfo.grandTotal === 'number' && customerInfo.grandTotal > 0) {

        if (customerInfo.grandTotalINR) {

          // Already in INR from backend

          totalAmount = `₹${Math.round(customerInfo.grandTotalINR)}`;

        } else {

          // Assume USD, convert to INR

          totalAmount = `$${customerInfo.grandTotal.toFixed(2)} (₹${Math.round(customerInfo.grandTotal * 90)})`;

        }

      }

      

      console.log(' DEBUG - Final calculated amount:', totalAmount);

      console.log(' DEBUG - customerInfo.grandTotal:', customerInfo.grandTotal);

      console.log(' DEBUG - customerInfo.grandTotalINR:', customerInfo.grandTotalINR);



      // Send booking confirmation directly to customer (executive will be notified via backend)

      const customerConfirmation = " **BOOKING REQUEST RECEIVED!**\n\n" +

        " **Your Booking Summary:**\n" +

        ` Name: ${custName}\n` +

        ` Phone: ${customerPhone}\n` +

        ` Destination: ${destination}\n` +

        ` Start Date: ${this.formatDateForDisplay(startDate)}\n` +

        ` End Date: ${this.formatDateForDisplay(endDate)}\n` +

        ` No. of People: ${travelers}\n` +

        ` Requirements: ${requirements}\n` +

        (customerInfo.vendorQuotes ? ` Total Amount: ${totalAmount}\n` : '') +

        "\n **Next Steps:**\n" +

        "• Our executive team has been notified\n" +

        "• You will receive a call within 24 hours\n" +

        "• Payment and final details will be confirmed\n\n" +

        "Thank you for choosing **Unravel Experience**! ";

      

      await sendMessage(customerPhone, customerConfirmation);

      

      // Save booking request to MySQL database

      const bookingData = {

        name: custName,

        destination,

        travel_date: this.convertToBackendDateFormat(startDate) || new Date().toISOString().split('T')[0],

        end_date: this.convertToBackendDateFormat(endDate) || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

        guests: travelers,

        special_requests: `Requirements: ${requirements}${typeof customerInfo.grandTotal === 'number' ? ` | Total: $${customerInfo.grandTotal.toFixed(2)}` : ''}`,

        user_id: customerPhone,

        phone: customerPhone

      };

      

      await mysqlConnector.createBooking(bookingData);

      

      // Build executive message using formatter (always includes customer details)

      const executiveMessage = this.formatExecutiveMessage({

        ...customerInfo,

        name: custName,

        destination,

        numberOfPeople: travelers,

        startDate,

        endDate,

        specialRequests: requirements

      });

      

      const executivePhone = process.env.EXECUTIVE_PHONE;

      if (executivePhone) {

        await sendMessage(executivePhone, executiveMessage);

        console.log(` Executive notified at ${executivePhone}`);

      }

      

      console.log('🚨 NEW BOOKING REQUEST logged');



      // Clear booking state now that booking request has been submitted

      conversationManager.storeBookingState(msg.from, null);



    } catch (error) {

      console.error('Error handling book my trip command:', error);

      await this.sendErrorNotification(msg.from, 'Booking failed. Please try again or contact support.');

    }

  }



  async handleBookMyTripNowCommand(msg, customerData) {

    try {

      // Check if quotes have been received for this customer

      const quoteData = conversationManager.getQuoteData(msg.from);



      if (!quoteData) {

        const errorMessage = " **QUOTES NOT RECEIVED**\n\n" +

          "You can only use 'book my trip now' after receiving travel quotes.\n" +

          "Please wait for our team to send you pricing options, then reply with this command.\n\n" +

          "Thank you for your patience! ";

        await sendMessage(msg.from, errorMessage);

        return;

      }



      // Get conversation history to extract all customer details

      const conversationHistory = conversationManager.getConversationHistory(msg.from);

      const customerPhone = msg.from.replace('@c.us', '');



      // Extract comprehensive customer information

      const customerInfo = this.extractCustomerInfo(conversationHistory, customerPhone, customerData);



      // Get booking state to merge additional details

      const bookingState = conversationManager.getBookingState(msg.from);

      if (bookingState && bookingState.customerName) {

        customerInfo.name = bookingState.customerName;

        customerInfo.numberOfPeople = bookingState.numberOfTravelers;

        customerInfo.startDate = bookingState.startDate;

        customerInfo.endDate = this.calculateEndDate(bookingState.startDate);

        customerInfo.specialRequests = bookingState.specialRequirements;

        customerInfo.destination = 'Bali'; // Set destination for booking state

      }



      // Add quote information

      if (quoteData && quoteData.quotes) {

        customerInfo.vendorQuotes = quoteData.quotes;

        customerInfo.destination = quoteData.destination;

        

        // Use grand_total from backend if available (already in INR)

        if (quoteData.grand_total) {

          customerInfo.grandTotal = Number(quoteData.grand_total);

          customerInfo.grandTotalINR = Number(quoteData.grand_total);

        } else {

          // Fallback: sum individual quote prices

          customerInfo.grandTotal = quoteData.quotes.reduce((sum, quote) => sum + Number(quote.final_price), 0);

        }

      }



      // Build safe fields

      const custName = customerInfo.name || 'Customer';

      const destination = customerInfo.destination || 'Not specified';

      const travelers = customerInfo.numberOfPeople || '1';

      const startDate = customerInfo.startDate || (customerInfo.dates ? customerInfo.dates.split(' to ')[0] : new Date().toISOString().split('T')[0]);

      const endDate = customerInfo.endDate || (customerInfo.dates ? customerInfo.dates.split(' to ')[1] || this.calculateEndDate(startDate) : this.calculateEndDate(new Date().toISOString().split('T')[0]));

      const requirements = customerInfo.specialRequests || 'Not provided';

      

      // Format total amount - check if it's already in INR or needs conversion

      let totalAmount = 'TBD';

      if (typeof customerInfo.grandTotal === 'number' && customerInfo.grandTotal > 0) {

        if (customerInfo.grandTotalINR) {

          // Already in INR from backend

          totalAmount = `₹${Math.round(customerInfo.grandTotalINR)}`;

        } else {

          // Assume USD, convert to INR

          totalAmount = `$${customerInfo.grandTotal.toFixed(2)} (₹${Math.round(customerInfo.grandTotal * 90)})`;

        }

      }



      // Send booking confirmation directly to customer

      const customerConfirmation = " **BOOKING REQUEST RECEIVED!**\n\n" +

        " **Your Booking Summary:**\n" +

        ` Name: ${custName}\n` +

        ` Phone: ${customerPhone}\n` +

        ` Destination: ${destination}\n` +

        ` Start Date: ${this.formatDateForDisplay(startDate)}\n` +

        ` End Date: ${this.formatDateForDisplay(endDate)}\n` +

        ` No. of People: ${travelers}\n` +

        ` Requirements: ${requirements}\n` +

        (customerInfo.vendorQuotes ? ` Total Amount: ${totalAmount}\n` : '') +

        "\n **Next Steps:**\n" +

        "• Our executive team has been notified\n" +

        "• You will receive a call within 24 hours\n" +

        "• Payment and final details will be confirmed\n\n" +

        " **Contact Info:** +91-9886174621\n\n" +

        "Thank you for choosing **Unravel Experience**! ";

      

      await sendMessage(customerPhone, customerConfirmation);

      

      // Save urgent booking request to MySQL database

      const bookingData = {

        name: custName,

        destination,

        travel_date: this.convertToBackendDateFormat(startDate) || new Date().toISOString().split('T')[0],

        end_date: this.convertToBackendDateFormat(endDate) || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

        guests: travelers,

        special_requests: `URGENT booking. Requirements: ${requirements}${typeof customerInfo.grandTotal === 'number' ? ` | Total: $${customerInfo.grandTotal.toFixed(2)}` : ''}`,

        user_id: customerPhone

      };

      

      await mysqlConnector.createBooking(bookingData);

      

      // Send notification to executive with detailed info

      const executiveMessage = this.formatExecutiveMessage({

        ...customerInfo,

        name: custName,

        destination,

        numberOfPeople: travelers,

        startDate,

        endDate,

        specialRequests: requirements

      });

      

      const executivePhone = process.env.EXECUTIVE_PHONE;

      if (executivePhone) {

        await sendMessage(executivePhone, executiveMessage);

        console.log(` Executive notified at ${executivePhone}`);

      }

      

      console.log('🚨 URGENT BOOKING REQUEST logged');



    } catch (error) {

      console.error('Error handling book my trip now command:', error);

      await this.sendErrorNotification(msg.from, 'Urgent booking failed. Please try again or contact support.');

    }

  }



  async handleReadyForThisPackageCommand(msg, customerData) {

    try {

      const nameRequest = "Great! I'd be happy to help you book your trip! 🌴\n\n" +

        "Let's start with your booking details.\n\n" +

        "Please provide your *full name*:";

      await sendMessage(msg.from, nameRequest);

      conversationManager.addMessage(msg.from, msg.body, false);

      conversationManager.addMessage(msg.from, nameRequest, true);



      conversationManager.storeBookingState(msg.from, { bookingStep: 'collectName' });



    } catch (error) {

      console.error('Error handling ready for this package command:', error);

      await this.sendErrorNotification(msg.from, 'Failed to start booking. Please try "ready for this package" again.');

    }

  }



  async sendErrorNotification(userId, errorMsg) {

    try {

      const message = ` **ERROR**\n\n${errorMsg}\n\nNeed help? Contact support.`;

      await sendMessage(userId, message);

    } catch (e) {

      console.error('Failed to send error notification:', e);

    }

  }



  async handleIncomingMessage(msg) {

    if (msg.fromMe) return;



    // Create comprehensive unique identifier for duplicate detection

    const messageId = msg.id || `${msg.from}_${msg.timestamp}_${msg.body.substring(0, 50)}`;

    

    // Check for duplicate message processing

    if (this.processedMessageIds.has(messageId)) {

      console.log(`🔄 DUPLICATE MESSAGE: Skipping already processed message ID ${messageId} from ${msg.from}`);

      return;

    }



    // Add message ID to processed set BEFORE processing

    this.processedMessageIds.add(messageId);



    // Limit set size to prevent memory leaks (keep last 1000 message IDs)

    if (this.processedMessageIds.size > 1000) {

      const tempArray = Array.from(this.processedMessageIds).slice(-500);

      this.processedMessageIds.clear();

      tempArray.forEach(id => this.processedMessageIds.add(id));

    }



    // Serialize message processing per user to avoid race conditions

    const userId = msg.from;



    const previousPromise = this.userMessageQueues.get(userId) || Promise.resolve();



    const newPromise = previousPromise.then(() => this.processMessage(msg)).catch((err) => {

      console.error('Error processing message for user', userId, err);

    });



    this.userMessageQueues.set(userId, newPromise);



    // Clean up the queue map when done

    newPromise.finally(() => {

      if (this.userMessageQueues.get(userId) === newPromise) {

        this.userMessageQueues.delete(userId);

      }

    });



    return newPromise;

  }



  async processMessage(msg) {

    console.log(` Processing: ${msg.body}`);



    // Extract phone number for customer lookup

    const phoneNumber = msg.from.replace('@c.us', '');



    // Skip customer data lookup - not needed for bot functionality

    const customerData = null;

    

    // Clear booking state only on explicit reset commands

    const lowerText = msg.body.toLowerCase().trim();

    if (lowerText === 'reset' || lowerText === 'start over' || lowerText === 'restart') {

      conversationManager.storeBookingState(msg.from, null);

    }



    // Check if user is in booking details collection flow

    const bookingState = conversationManager.getBookingState(msg.from);

    if (bookingState && bookingState.bookingStep && bookingState.bookingStep !== 'completed') {

      console.log(` Booking flow: ${bookingState.bookingStep}`);

      await this.handleBookingDetailsFlow(msg, customerData, bookingState);

      return;

    }



    // If booking is completed but user sent a non-booking message, handle it normally

    if (bookingState && bookingState.bookingStep === 'completed') {

      const lowerMsg = msg.body.toLowerCase().trim();

      

      // Only stay in booking flow for specific commands

      if (lowerMsg === 'finalize' || lowerMsg === 'finialize' || lowerMsg === 'finalise' ||

          this.isBookMyTripCommand(msg.body) || this.isBookMyTripNowCommand(msg.body)) {

        console.log(` Booking flow: completed - handling booking command`);

        await this.handleBookingDetailsFlow(msg, customerData, bookingState);

        return;

      }

      

      // For any other message, process normally (greeting, questions, etc.)

      console.log(` Booking completed but processing non-booking message normally`);

      // Fall through to normal processing

    }



    // Check if message is a greeting and send hardcoded response

    if (this.isGreeting(msg.body)) {

      // Rate limiting for greetings

      const now = Date.now();

      const lastGreetingTime = this.userLastGreetingTime.get(msg.from) || 0;

      if (now - lastGreetingTime < this.GREETING_RATE_LIMIT) {

        console.log(`⏱️ Greeting rate limited for ${msg.from}`);

        return;

      }

      

      this.userLastGreetingTime.set(msg.from, now);

      

      const phoneNumber = msg.from.replace('@c.us', '');

      const greetingMessage = config.GREETING_MESSAGE;

      try {

        await sendMessage(phoneNumber, greetingMessage);

        conversationManager.addMessage(msg.from, msg.body, false);

        conversationManager.addMessage(msg.from, greetingMessage, true);

        return;

      } catch (error) {

        console.error('Greeting send failed:', error.message);

        // Continue to AI response if greeting fails

      }

    }



    // Handle price inquiry

    if (this.isPriceInquiry(msg.body)) {

      await this.handlePriceInquiry(msg, customerData);

      return;

    }



    // Check if message is next steps inquiry

    if (this.isNextStepsInquiry(msg.body)) {

      await this.handleNextStepsInquiry(msg, customerData);

      return;

    }



    // Check if message is package selection

    if (this.isPackageSelection(msg.body)) {

      try {

        await this.handlePackageSelection(msg, customerData);

        return;

      } catch (error) {

        console.error('Package selection failed, using AI fallback:', error.message);

        // Continue to AI response if package selection fails

      }

    }



    // Check if message is "Ready for this package" command - MUST be early in the flow

    if (this.isReadyForThisPackageCommand(msg.body)) {

      await this.handleReadyForThisPackageCommand(msg, customerData);

      return;

    }



    // Check if message is "Finalize" command

    if (this.isFinalizeCommand(msg.body)) {

      await this.handleFinalizeCommand(msg, customerData);

      return;

    }



    // Check if message is "Book My Trip" command

    if (this.isBookMyTripCommand(msg.body)) {

      await this.handleBookMyTripCommand(msg, customerData);

      return;

    }



    // Check if message is "Book My Trip Now" command (only after quotes received)

    if (this.isBookMyTripNowCommand(msg.body)) {

      await this.handleBookMyTripNowCommand(msg, customerData);

      return;

    }



    // Check if message contains booking information

    if (this.containsBookingInfo(msg.body)) {

      console.log(` Message contains booking info, handling...`);

      // Do not send confirmation message after saving booking info

      await this.handleBookingInfo(msg, customerData);

      return;

    }



    // Use AI service to generate response with conversation history

    console.log(` Generating AI response`);

    const conversationHistory = conversationManager.getConversationContext(msg.from);

    // Check if quotes have been sent to this customer

    const hasQuotesBeenSent = conversationManager.getQuoteData(msg.from) ? true : false;



    let aiReply = null;

    try {

      aiReply = await aiService.getAIResponse(msg.body, msg.from, conversationHistory, hasQuotesBeenSent);

    } catch (err) {

      console.error('Error getting general AI response:', err.message || err);

      // Provide a safe fallback reply so user gets a response even if AI fails

      aiReply = "Sorry, I'm having trouble generating a reply right now — please try again later.";

    }



    // Save user message and bot reply to conversation history

    conversationManager.addMessage(msg.from, msg.body, false);

    conversationManager.addMessage(msg.from, aiReply, true);



    const phoneNumberForSend = msg.from;

    try {

      await sendMessage(phoneNumberForSend, aiReply);

    } catch (err) {

      console.error('Error sending reply to', phoneNumberForSend, err.message || err);

    }

  }



  async handleBookingDetailsFlow(msg, customerData, bookingState) {

    const step = bookingState.bookingStep;



    if (step === 'collectName') {

      // Validate name (basic check)

      const name = msg.body.trim();

      if (name.length < 2) {

        const errorMsg = " Name is required and should be at least 2 characters. Please provide your full name.";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save name and move to next step

      bookingState.customerName = name;

      bookingState.bookingStep = 'collectTravelers';

      conversationManager.storeBookingState(msg.from, bookingState);



      const nextMsg = " How many travelers will be joining this trip? (e.g., 2)";

      await sendMessage(msg.from, nextMsg);

      return;

    }



    if (step === 'collectTravelers') {

      // Validate number of travelers (basic check)

      const numTravelers = msg.body.trim();

      const numPattern = /^\d+$/;

      if (!numPattern.test(numTravelers) || parseInt(numTravelers) < 1) {

        const errorMsg = " Please provide a valid number of travelers (e.g., 2).";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save number of travelers and move to next step

      bookingState.numberOfTravelers = numTravelers;

      bookingState.bookingStep = 'collectDate';

      conversationManager.storeBookingState(msg.from, bookingState);



      const nextMsg = " What's your preferred travel date? (e.g., 15/08/2026)";

      await sendMessage(msg.from, nextMsg);

      return;

    }



    if (step === 'collectDate') {

      // Validate date format (basic check)

      const travelDate = msg.body.trim();

      const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i;

      if (!datePattern.test(travelDate)) {

        const errorMsg = " Invalid date format. Please provide date in format: 15/08/2026";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Validate if the date is actually valid

      if (!this.isValidDate(travelDate)) {

        const errorMsg = " Invalid date. Please provide a valid date (e.g., 15/08/2026). Make sure the day and month are correct.";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save travel date and move to next step

      bookingState.startDate = travelDate;

      bookingState.bookingStep = 'collectRequirements';

      conversationManager.storeBookingState(msg.from, bookingState);



      const nextMsg = " Any special requirements or preferences? (or type 'none' if no special requirements)";

      await sendMessage(msg.from, nextMsg);

      return;

    }



    if (step === 'collectRequirements') {

      // Save special requirements

      bookingState.specialRequirements = msg.body.trim();

      bookingState.bookingStep = 'completed';

      conversationManager.storeBookingState(msg.from, bookingState);



      const completionMsg = ` **BOOKING SUMMARY**\n\n` +

        ` Name: ${bookingState.customerName}\n` +

        ` Travelers: ${bookingState.numberOfTravelers}\n` +

        ` Travel Date: ${bookingState.startDate}\n` +

        ` Requirements: ${bookingState.specialRequirements}\n` +

        ` Package: Bali Explorer\n\n` +

        ` All details collected! Reply with 'finalize' to confirm your booking.\n\n` +

        `Thank you for choosing Unravel Experience! `;

      await sendMessage(msg.from, completionMsg);

      return;

    }



    if (step === 'startDate') {

      // Validate start date format (basic check)

      const startDate = msg.body.trim();

      const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i;

      if (!datePattern.test(startDate)) {

        const errorMsg = " Invalid date format. Please provide start date in the format: 15/08/2026 or 15/08/26.";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save start date and move to next step

      bookingState.startDate = startDate;

      bookingState.bookingStep = 'numberOfTravelers';

      conversationManager.storeBookingState(msg.from, bookingState);



      const nextMsg = " Please provide the *Number of Travelers* (e.g., 2 people).";

      await sendMessage(msg.from, nextMsg);

      return;

    }



    if (step === 'numberOfTravelers') {

      // Validate number of travelers (basic check)

      const numTravelers = msg.body.trim();

      const numPattern = /^\d+$/;

      if (!numPattern.test(numTravelers)) {

        const errorMsg = " Invalid number format. Please provide the number of travelers as a number (e.g., 2).";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save number of travelers and move to next step

      bookingState.numberOfTravelers = numTravelers;

      bookingState.bookingStep = 'customerName';

      conversationManager.storeBookingState(msg.from, bookingState);



      const nextMsg = " Please provide your *Full Name* (required).";

      await sendMessage(msg.from, nextMsg);

      return;

    }



    if (step === 'customerName') {

      // Validate name (basic check)

      const name = msg.body.trim();

      if (name.length < 2) {

        const errorMsg = " Name is required and should be at least 2 characters. Please provide your full name.";

        await sendMessage(msg.from, errorMsg);

        return;

      }



      // Save name and complete booking details collection

      bookingState.customerName = name;

      bookingState.bookingStep = 'completed';

      conversationManager.storeBookingState(msg.from, bookingState);



      // Calculate end date (start date + 5 days)

      const startDateObj = new Date(bookingState.startDate.split('/').reverse().join('-'));

      const endDateObj = new Date(startDateObj);

      endDateObj.setDate(startDateObj.getDate() + 5);

      const endDate = endDateObj.toLocaleDateString('en-GB').replace(/\//g, '/');



      const completionMsg = ` **BOOKING SUMMARY**\n\n` +

        ` Name: ${bookingState.customerName}\n` +

        ` Start Date: ${bookingState.startDate}\n` +

        ` End Date: ${endDate}\n` +

        ` No. of Persons: ${bookingState.numberOfTravelers}\n` +

        ` Trip Name: Bali Explorer\n\n` +

        ` Thank you! Pricing will be provided after we receive your message\n\n` +

        `Once you provide the details, reply with 'finalize' to confirm your booking.\n\n` +

        `Thank you for choosing Unravel Experience! `;

      await sendMessage(msg.from, completionMsg);

      return;

    }



    if (step === 'completed') {

      // Check if user sent 'finalize' command (including common misspellings)

      const lowerText = msg.body.toLowerCase().trim();

      if (lowerText === 'finalize' || lowerText === 'finialize' || lowerText === 'finalise') {

        // Convert booking state data to backend format

        const bookingInfo = {

          customerPhone: this.normalizePhoneNumber(msg.from),

          customerName: bookingState.customerName,

          package: 'P001',

          destination: 'Bali',

          startDate: this.convertToBackendDateFormat(bookingState.startDate),

          endDate: this.calculateEndDate(bookingState.startDate),

          numberOfPeople: bookingState.numberOfTravelers,

          totalPrice: '',

          status: 'Pending',

          notes: `Booking for ${bookingState.customerName}, ${bookingState.numberOfTravelers} travelers, from ${bookingState.startDate}. Requirements: ${bookingState.specialRequirements || 'none'}`

        };



        // Save booking to MySQL database first

        const bookingData = {

          name: bookingInfo.customerName,

          destination: bookingInfo.destination,

          travel_date: bookingInfo.startDate,

          end_date: bookingInfo.endDate,

          guests: bookingInfo.numberOfPeople,

          special_requests: bookingInfo.notes,

          user_id: bookingInfo.customerPhone

        };



        await mysqlConnector.createBooking(bookingData);

        console.log(' Booking saved to database');



        // Send waiting message first

        const waitingMessage = " **Our team is currently gathering the best vendor quotes for your trip.**\n\n" +

          "You will receive the pricing details shortly. Please wait for our message with the travel quotes.\n\n" +

          "Thank you for your patience! ";



        await sendMessage(msg.from, waitingMessage);

        conversationManager.addMessage(msg.from, waitingMessage, true);



        console.log(' Sending booking data to backend:', bookingInfo);



        // Send booking data to backend for vendor emails

        const emailSent = await apiConnector.sendDaywiseBookingEmail(bookingInfo);

        console.log(' Email send result:', emailSent);



        if (emailSent || true) { // Always send success since booking is saved

          const successMessage = " **BOOKING FINALIZED!**\n\n" +

            " Your booking request has been successfully submitted!\n" +

            " Our team will review your details and send you the final pricing within 24 hours.\n" +

            " we will contact you soon to confirm availability and process .\n\n" +

            "Thank you for choosing **Unravel Experience**! \n\n" +

            "*Please keep this chat open for updates.*";



          await sendMessage(msg.from, successMessage);



          // Do NOT clear booking state here; we still need it when the user sends

          // "book my trip". We'll clear it after booking request is submitted.

        } else {

          const errorMessage = " **BOOKING ERROR**\n\n" +

            "Sorry, there was an issue processing your booking request.\n" +

            "Please try again or contact our support team.";



          await sendMessage(msg.from, errorMessage);

        }

        return;

      }



      // If user is done providing details and says 'book my trip', proceed to booking

      if (this.isBookMyTripCommand(msg.body)) {

        await this.handleBookMyTripCommand(msg, customerData);

        return;

      }



      // Allow immediate booking with quotes

      if (this.isBookMyTripNowCommand(msg.body)) {

        await this.handleBookMyTripNowCommand(msg, customerData);

        return;

      }



      // If not a booking command, exit booking flow and let normal message processing handle it

      // This allows greetings, questions, etc. to be processed normally

      console.log(' Exiting completed booking flow, processing message normally');

      // Don't return here - fall through to normal processing below

    }

  }



  extractCustomerInfo(conversationHistory, customerPhone, customerData) {

    console.log(' DEBUG - extractCustomerInfo called with conversationHistory length:', conversationHistory.length);

    

    // Combine only user messages to extract info (exclude bot messages to avoid wrong extraction)

    const userMessages = conversationHistory.filter(msg => !msg.isBot).map(msg => msg.message).join(' ');

    const lowerMessages = userMessages.toLowerCase();



    console.log(' DEBUG - userMessages length:', userMessages.length);

    console.log(' DEBUG - userMessages:', userMessages.substring(0, 100) + '...');



    // Get quote data from backend if available

    const quoteData = conversationManager.getQuoteData(`${customerPhone}@c.us`);



    const customerInfo = {

      phone: customerPhone,

      name: '',

      package: '',

      destination: '',

      numberOfPeople: '',

      dates: '',

      startDate: '',

      endDate: '',

      budget: '',

      specialRequests: '',

      conversationSummary: userMessages || 'No conversation history available for this customer',

      vendorQuotes: quoteData ? quoteData.quotes : null

    };



    // Get name from backend data if available

    if (customerData && customerData.length > 0) {

      customerInfo.name = customerData[0].name;

    }



    // Extract package and destination

    if (lowerMessages.includes('bali') || lowerMessages.includes('p001')) {

      customerInfo.package = 'Bali Explorer (P001)';

      customerInfo.destination = 'Bali, Indonesia';



    }



    // Extract number of people

    const peopleMatch = userMessages.match(/(\d+)\s*(person|people|pax|traveller|adult)/i);

    if (peopleMatch) {

      customerInfo.numberOfPeople = peopleMatch[1];

    }



    // Extract dates and compute start/end (support 2-digit and 4-digit years)

    const dateMatch = userMessages.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g);

    if (dateMatch) {

      // Normalize and sort dates, then set start/end

      const normalized = this.normalizeDates(dateMatch);

      if (normalized.length > 0) {

        customerInfo.startDate = normalized[0];

        customerInfo.endDate = normalized[1] || this.calculateEndDate(normalized[0]);

        customerInfo.dates = `${customerInfo.startDate} to ${customerInfo.endDate}`;

      }

    }



    // Extract budget/price mentions

    const budgetMatch = userMessages.match(/(\d+)\s*(rs|rupees|usd|dollars|\$|budget)/i);

    if (budgetMatch) {

      customerInfo.budget = budgetMatch[0];

    }



    // Extract simple requirements from phrases like "requirements:", "need", "looking for"

    const reqMatch = userMessages.match(/(?:requirements?|need|looking for|preferences?)[:\-\s]+([^\n\.]{5,200})/i);

    if (reqMatch) {

      customerInfo.specialRequests = reqMatch[1].trim();

    }



    return customerInfo;

  }



  // Helper function to normalize and validate dates

  normalizeDates(extractedDates) {

    const monthMap = {

      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',

      'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',

      'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',

      'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'

    };



    const normalizedDates = [];



    for (const dateStr of extractedDates) {

      let normalized = dateStr;



      // Handle "dd month yyyy" format (e.g., "15 Aug 2026")

      const monthDateYearMatch = dateStr.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);

      if (monthDateYearMatch) {

        const [, day, month, year] = monthDateYearMatch;

        const monthNum = monthMap[month.toLowerCase()];

        normalized = `${day.padStart(2, '0')}/${monthNum}/${year}`;

      }



      // Handle "month dd, yyyy" format (e.g., "Aug 15, 2026")

      const monthDayYearMatch = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);

      if (monthDayYearMatch) {

        const [, month, day, year] = monthDayYearMatch;

        const monthNum = monthMap[month.toLowerCase()];

        normalized = `${day.padStart(2, '0')}/${monthNum}/${year}`;

      }



      // Validate the normalized date

      if (this.isValidDate(normalized)) {

        normalizedDates.push(normalized);

      }

    }



    // Convert to YYYY-MM-DD for proper sorting, then back to dd/mm/yyyy

    const ymdDates = normalizedDates.map(date => this.convertToBackendDateFormat(date));

    const sortedYmd = [...new Set(ymdDates)].sort();

    return sortedYmd.map(ymd => {

      const [year, month, day] = ymd.split('-');

      return `${day}/${month}/${year}`;

    });

  }



  // Helper function to validate date format

  isValidDate(dateString) {

    const dateRegex = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/;

    const match = dateString.match(dateRegex);



    if (!match) return false;



    const [, day, month, year] = match;

    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);



    return date.getFullYear() == year &&

           date.getMonth() + 1 == parseInt(month) &&

           date.getDate() == parseInt(day) &&

           year >= 2024 && year <= 2030; // Reasonable year range

  }



  // Helper function to convert date to backend format (YYYY-MM-DD)

  convertToBackendDateFormat(dateString) {

    // Input format: dd/mm/yyyy or dd-mm-yyyy or dd/mm/yy

    // Output format: yyyy-mm-dd

    const dateRegex = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/;

    const match = dateString.match(dateRegex);



    if (!match) return dateString; // Return original if format doesn't match



    let [, day, month, year] = match;



    // Convert 2-digit year to 4-digit year

    if (year.length === 2) {

      year = `20${year}`;

    }



    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  }



  // Helper function to calculate end date (start date + 5 days)

  calculateEndDate(startDateString) {

    const startDate = this.convertToBackendDateFormat(startDateString);

    const dateObj = new Date(startDate);

    dateObj.setDate(dateObj.getDate() + 5);

    return dateObj.toISOString().split('T')[0]; // Return YYYY-MM-DD format

  }



  // Helper function to format date to DD/MM/YYYY

  formatDateForDisplay(dateString) {

    if (!dateString) return dateString;

    // If already in DD/MM/YYYY format, return as is

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {

      return dateString;

    }

    // If in YYYY-MM-DD format, convert to DD/MM/YYYY

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {

      const [year, month, day] = dateString.split('-');

      return `${day}/${month}/${year}`;

    }

    return dateString; // Return original if format doesn't match

  }



  formatExecutiveMessage(customerInfo) {

    const timestamp = new Date().toLocaleString();



    let message = `🚨 **NEW BOOKING REQUEST**\n`;

    message += `⏰ Time: ${timestamp}\n\n`;

    message += ` **CUSTOMER DETAILS:**\n`;

    message += ` Phone: ${customerInfo.phone}\n`;



    if (customerInfo.name) {

      message += ` Name: ${customerInfo.name}\n`;

    }



    message += `\n **TRIP DETAILS:**\n`;



    if (customerInfo.destination) {

      message += ` Destination: ${customerInfo.destination}\n`;

    }



    if (customerInfo.package) {

      message += `📦 Package: ${customerInfo.package}\n`;

    }



    if (customerInfo.numberOfPeople) {

      message += ` Travelers: ${customerInfo.numberOfPeople} person(s)\n`;

    }



    // Prefer explicit start/end dates; fallback to combined dates string

    if (customerInfo.startDate || customerInfo.endDate) {

      if (customerInfo.startDate) message += ` Start Date: ${customerInfo.startDate}\n`;

      if (customerInfo.endDate) message += ` End Date: ${customerInfo.endDate}\n`;

    } else if (customerInfo.dates) {

      message += ` Dates: ${customerInfo.dates}\n`;

    }



    if (customerInfo.specialRequests) {

      message += ` Requirements: ${customerInfo.specialRequests}\n`;

    }



    // Add total price if available

    if (customerInfo.grandTotal || customerInfo.grandTotalINR) {

      message += `\n **PRICING:**\n`;

      if (customerInfo.grandTotalINR) {

        // Already in INR from backend

        message += ` Total Price: ₹${Math.round(customerInfo.grandTotalINR)}\n`;

      } else if (customerInfo.grandTotal) {

        // Assume USD, show both

        message += ` Total Price: $${customerInfo.grandTotal.toFixed(2)} (₹${Math.round(customerInfo.grandTotal * config.USD_TO_INR_RATE)})\n`;

      }

    }



    // Add vendor quotes if available

    if (customerInfo.vendorQuotes && customerInfo.vendorQuotes.length > 0) {

      message += `\n **VENDOR QUOTES:**\n`;

      customerInfo.vendorQuotes.forEach((quote, index) => {

        const usdPrice = parseFloat(quote.final_price);

        const inrPrice = Math.round(usdPrice * config.USD_TO_INR_RATE);

        message += `${index + 1}. ${quote.vendor_name}: $${usdPrice.toFixed(2)} (₹${inrPrice})\n`;

        if (quote.quote_details) {

          message += `   Details: ${quote.quote_details}\n`;

        }

      });

      if (customerInfo.grandTotal && !customerInfo.grandTotalINR) {

        const usdTotal = parseFloat(customerInfo.grandTotal);

        const inrTotal = Math.round(usdTotal * config.USD_TO_INR_RATE);

        message += `\n **Grand Total: $${usdTotal.toFixed(2)} (₹${inrTotal})**\n`;

      }

    }



    message += `\n **CONVERSATION SUMMARY:**\n`;

    message += `${customerInfo.conversationSummary.substring(0, 300)}${customerInfo.conversationSummary.length > 300 ? '...' : ''}\n\n`;

    message += `⚡ **ACTION REQUIRED:** Please contact this customer at ${customerInfo.phone} to finalize booking details and payment.`;

    return message;

  }

}



const messageHandlerInstance = new MessageHandler();
module.exports = messageHandlerInstance;
module.exports.sendMessage = sendMessage;
module.exports.MessageHandler = MessageHandler;

