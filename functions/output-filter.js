'use strict';

/**
 * Output Filter for GuestBot AI
 * Catches system prompt leaks and prevents bulk access code disclosure
 */

const MAX_OUTPUT_LENGTH = 2000;

// Patterns that indicate the AI is leaking its system prompt
const SYSTEM_LEAK_PATTERNS = [
  /you\s+are\s+guestbot,?\s+an?\s+ai\s+concierge/i,
  /IMPORTANT\s*[-–—:]\s*MULTI[-\s]?LANGUAGE/i,
  /PROPERTY\s+INFO\s*:/i,
  /CONTEXT\s*:\s*(Focus on|Provide general)/i,
  /LOCATION\s+AWARENESS\s*:/i,
  /SECURITY\s+RULES?\s*:/i,
  /ANTI[-\s]?JAILBREAK/i,
  /system\s*instruction/i,
  /systemInstruction/i,
];

// Patterns for access codes (to count how many are being disclosed)
const ACCESS_CODE_PATTERNS = [
  /(?:door|entry)\s*code\s*[:=]\s*\S+/gi,
  /(?:lock\s*box|lockbox)\s*code\s*[:=]\s*\S+/gi,
  /(?:gate)\s*code\s*[:=]\s*\S+/gi,
  /(?:garage)\s*code\s*[:=]\s*\S+/gi,
  /(?:wifi|wi-fi)\s*password\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
];

/**
 * Filter AI response before returning to client
 * @param {string} response - Raw AI response text
 * @returns {{ filtered: string, wasFiltered: boolean, reason: string|null }}
 */
function filterOutput(response) {
  if (!response || typeof response !== 'string') {
    return {
      filtered: "I'm sorry, I couldn't generate a response. Please try again.",
      wasFiltered: true,
      reason: 'empty_response',
    };
  }

  // Check for system prompt leaks
  for (const pattern of SYSTEM_LEAK_PATTERNS) {
    if (pattern.test(response)) {
      return {
        filtered:
          "I'm here to help with questions about your stay! What would you like to know about the property?",
        wasFiltered: true,
        reason: 'system_prompt_leak',
      };
    }
  }

  // Count access codes in response - block if dumping 3+ at once
  let totalCodeMatches = 0;
  for (const pattern of ACCESS_CODE_PATTERNS) {
    const matches = response.match(pattern);
    if (matches) {
      totalCodeMatches += matches.length;
    }
  }

  if (totalCodeMatches >= 3) {
    return {
      filtered:
        "For security, I can only share one or two access codes at a time. Please ask about a specific code (e.g., 'What's the WiFi password?' or 'What's the door code?').",
      wasFiltered: true,
      reason: 'bulk_code_disclosure',
    };
  }

  // Truncate overly long responses
  let filtered = response;
  if (filtered.length > MAX_OUTPUT_LENGTH) {
    // Try to truncate at a sentence boundary
    const truncated = filtered.substring(0, MAX_OUTPUT_LENGTH);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );

    if (lastSentenceEnd > MAX_OUTPUT_LENGTH * 0.7) {
      filtered = truncated.substring(0, lastSentenceEnd + 1);
    } else {
      filtered = truncated + '...';
    }
  }

  return {
    filtered,
    wasFiltered: filtered !== response,
    reason: filtered !== response ? 'truncated' : null,
  };
}

module.exports = {
  filterOutput,
  MAX_OUTPUT_LENGTH,
};
