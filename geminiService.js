const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    this.quotaExceeded = false;
  }

  async generateResponse(prompt) {
    if (this.quotaExceeded) {
      throw new Error('API quota exceeded');
    }

    if (!this.apiKey) 
      {
         throw new Error('Gemini API key not configured');
    }

    try {
      // Add explicit instruction to not echo user messages
      const enhancedPrompt = prompt + '\n\nIMPORTANT: Do NOT repeat or echo the user\'s message back to them. Provide a unique, helpful response that answers their question or provides relevant information.';

      const result = await this.model.generateContent(enhancedPrompt);
      const response = await result.response;
      const text = response.text();

      if (text && text.trim().length > 0) {
        // Additional check to prevent echoing
        const userMessageMatch = prompt.match(/Customer message: "([^"]+)"/);
        if (userMessageMatch) {
          const userMessage = userMessageMatch[1].toLowerCase().trim();
          const responseLower = text.toLowerCase().trim();

          // If the response is too similar to the user's message, reject it
          if (responseLower === userMessage || responseLower.includes(userMessage) && userMessage.length > 10) {
            console.warn('Gemini response appears to be echoing user message, rejecting');
            throw new Error('Response appears to be echoing user message');
          }
        }

        return text;
      } else {
        throw new Error('Empty response from Gemini API');
      }
    } catch (error) {
      if (error.message?.includes('quota') || error.message?.includes('limit')) {
        if (!this.quotaExceeded) {
          console.error('Gemini API quota exceeded. Please upgrade your plan.');
          this.quotaExceeded = true;
        }
      } else if (!this.quotaExceeded) {
        console.error('Error calling Gemini API:', error.message);
      }
      throw new Error('Failed to generate response from Gemini');
    }
  }
}

module.exports = new GeminiService();
