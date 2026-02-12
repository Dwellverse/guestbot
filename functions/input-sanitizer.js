'use strict';

/**
 * Input Sanitizer for GuestBot AI
 * Strips prompt injection patterns, control characters, and enforces length limits
 */

// Patterns commonly used in prompt injection attacks
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous/i,
  /override\s+(all\s+)?instructions/i,
  /new\s+instructions?\s*:/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(a|an|if)/i,
  /roleplay\s+as/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /developer\s+mode/i,
  /do\s+anything\s+now/i,
  /bypass\s+(your|the|all)\s+(rules|restrictions|filters|safety)/i,
  /reveal\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions|message)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
  /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /output\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<\/?system>/i,
  /\bhuman\s*:/i,
  /\bassistant\s*:/i,
];

const MAX_QUESTION_LENGTH = 500;

/**
 * Remove control characters (except standard whitespace)
 */
function removeControlChars(str) {
  // Keep tabs, newlines, carriage returns; remove other control chars
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}

/**
 * Check if input contains injection patterns
 * Returns { safe: boolean, flagged: string[] }
 */
function detectInjection(input) {
  const flagged = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      flagged.push(pattern.source);
    }
  }
  return {
    safe: flagged.length === 0,
    flagged,
  };
}

/**
 * Sanitize user question input
 * Returns { sanitized: string, wasModified: boolean, rejected: boolean }
 */
function sanitizeQuestion(question) {
  if (!question || typeof question !== 'string') {
    return { sanitized: '', wasModified: false, rejected: true };
  }

  let sanitized = question.trim();

  // Remove control characters
  const afterControlChars = removeControlChars(sanitized);
  const wasControlCharsRemoved = afterControlChars !== sanitized;
  sanitized = afterControlChars;

  // Truncate to max length
  const wasTruncated = sanitized.length > MAX_QUESTION_LENGTH;
  if (wasTruncated) {
    sanitized = sanitized.substring(0, MAX_QUESTION_LENGTH);
  }

  // Check for injection patterns
  const injection = detectInjection(sanitized);
  if (!injection.safe) {
    // Reject the input when injection patterns are detected
    return {
      sanitized,
      wasModified: wasControlCharsRemoved || wasTruncated,
      rejected: true,
      injectionDetected: true,
      flaggedPatterns: injection.flagged,
    };
  }

  return {
    sanitized,
    wasModified: wasControlCharsRemoved || wasTruncated,
    rejected: false,
    injectionDetected: false,
  };
}

module.exports = {
  sanitizeQuestion,
  detectInjection,
  removeControlChars,
  MAX_QUESTION_LENGTH,
};
