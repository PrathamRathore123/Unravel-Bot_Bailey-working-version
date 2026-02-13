const axios = require('axios');

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.quotaExceeded = false;
    this.quotaExceededTime = null;
  }

  async generateResponse(prompt) {
    // Check if quota was exceeded and reset after 10 minutes
    if (this.quotaExceeded && this.quotaExceededTime) {
      const timeSinceExceeded = Date.now() - this.quotaExceededTime;
      if (timeSinceExceeded > 10 * 60 * 1000) { // 10 minutes
        console.log('[QUOTA] Resetting quota flag after 10 minutes');
        this.quotaExceeded = false;
        this.quotaExceededTime = null;
      }
    }

    if (this.quotaExceeded) {
      throw new Error('API quota exceeded');
    }

    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      // Add explicit instruction to not echo user messages
      const enhancedPrompt = prompt + '\n\nIMPORTANT: Do NOT repeat or echo the user\'s message back to them. Provide a unique, helpful response that answers their question or provides relevant information.';

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'openai/gpt-3.5-turbo-16k', // Use the correct model name
        messages: [
          {
            role: 'system',
            content: 'You are a helpful travel assistant for Unravel Experience. Always provide unique, helpful responses. Never repeat or echo the user\'s message.'
          },
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://unravel-experience.com',
          'X-Title': 'Unravel Experience Bot'
        }
      });

      const text = response.data.choices[0]?.message?.content;

      if (text && text.trim().length > 0) {
        // Less strict echo detection - only reject exact matches
        const userMessageMatch = prompt.match(/Customer message: "([^"]+)"/);
        if (userMessageMatch) {
          const userMessage = userMessageMatch[1].toLowerCase().trim();
          const responseLower = text.toLowerCase().trim();

          // Only reject if it's an exact match or very similar (90%+ similarity)
          if (responseLower === userMessage || 
              (userMessage.length > 20 && this.calculateSimilarity(responseLower, userMessage) > 0.9)) {
            console.warn('OpenRouter response appears to be echoing user message, rejecting');
            throw new Error('Response appears to be echoing user message');
          }
        }

        return text;
      } else {
        throw new Error('Empty response from OpenRouter API');
      }
    } catch (error) {
      if (error.response?.status === 429 || error.message?.includes('quota') || error.message?.includes('limit')) {
        if (!this.quotaExceeded) {
          console.error('OpenRouter API quota exceeded. Please upgrade your plan.');
          this.quotaExceeded = true;
          this.quotaExceededTime = Date.now();
        }
      } else if (!this.quotaExceeded) {
        console.error('Error calling OpenRouter API:', error.message);
        if (error.response?.data) {
          console.error('API Response:', JSON.stringify(error.response.data, null, 2));
        }
      }
      throw new Error('Failed to generate response from OpenRouter');
    }
  }
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

module.exports = new OpenRouterService();
