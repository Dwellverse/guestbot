'use strict';

/**
 * Input Sanitizer for GuestBot AI
 * Strips prompt injection patterns, control characters, and enforces length limits
 */

// Patterns commonly used in prompt injection attacks
// Patterns commonly used in prompt injection attacks
// NOTE: All \s quantifiers are bounded to {1,20} to prevent ReDoS via catastrophic backtracking
const INJECTION_PATTERNS = [
  /ignore\s{1,20}(?:all\s{1,20})?previous\s{1,20}instructions/i,
  /ignore\s{1,20}(?:all\s{1,20})?above\s{1,20}instructions/i,
  /disregard\s{1,20}(?:all\s{1,20})?previous/i,
  /forget\s{1,20}(?:all\s{1,20})?previous/i,
  /override\s{1,20}(?:all\s{1,20})?instructions/i,
  /new\s{1,20}instructions?\s{0,5}:/i,
  /system\s{0,10}prompt/i,
  /you\s{1,20}are\s{1,20}now/i,
  /pretend\s{1,20}(?:you\s{1,20}are|to\s{1,20}be)/i,
  /act\s{1,20}as\s{1,20}(?:a|an|if)/i,
  /roleplay\s{1,20}as/i,
  /jailbreak/i,
  /DAN\s{1,20}mode/i,
  /developer\s{1,20}mode/i,
  /do\s{1,20}anything\s{1,20}now/i,
  /bypass\s{1,20}(?:your|the|all)\s{1,20}(?:rules|restrictions|filters|safety)/i,
  /reveal\s{1,20}(?:your|the)\s{1,20}(?:system|initial|original)\s{1,20}(?:prompt|instructions|message)/i,
  /what\s{1,20}(?:are|is)\s{1,20}your\s{1,20}(?:system\s{1,20})?instructions/i,
  /show\s{1,20}(?:me\s{1,20})?(?:your|the)\s{1,20}(?:system\s{1,20})?prompt/i,
  /repeat\s{1,20}(?:your|the)\s{1,20}(?:system\s{1,20})?(?:prompt|instructions)/i,
  /print\s{1,20}(?:your|the)\s{1,20}(?:system\s{1,20})?(?:prompt|instructions)/i,
  /output\s{1,20}(?:your|the)\s{1,20}(?:system\s{1,20})?(?:prompt|instructions)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<\/?system>/i,
  /\bhuman\s{0,5}:/i,
  /\bassistant\s{0,5}:/i,
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
