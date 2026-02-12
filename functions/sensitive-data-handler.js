'use strict';

/**
 * Sensitive Data Handler for GuestBot AI
 * Controls when access codes/passwords are included in AI context
 * Only provides sensitive data when the question is contextually relevant
 */

// Keywords that indicate the guest is asking about access-related info
const SENSITIVE_KEYWORDS = [
  'wifi',
  'wi-fi',
  'wireless',
  'internet',
  'password',
  'passcode',
  'pass code',
  'network',
  'ssid',
  'door',
  'lock',
  'lockbox',
  'lock box',
  'key',
  'entry',
  'enter',
  'get in',
  'getting in',
  'access',
  'code',
  'gate',
  'garage',
  'open',
  'unlock',
  'check in',
  'check-in',
  'checkin',
  'arrive',
  'arrival',
  'connect',
  'connecting',
  'log in',
  'login',
  'sign in',
];

// Rate limit: max sensitive lookups per window
const SENSITIVE_RATE_LIMIT = {
  maxLookups: 5,
  windowMs: 10 * 60 * 1000, // 10 minutes
};

// In-memory rate limit store for sensitive data access
const sensitiveRateStore = new Map();

/**
 * Check if question is asking about sensitive/access information
 */
function isSensitiveQuestion(question) {
  const lower = question.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Check rate limit for sensitive data access
 * Returns { allowed: boolean }
 */
function checkSensitiveRateLimit(identifier) {
  cleanupSensitiveRateStore();
  const now = Date.now();
  const key = `sensitive:${identifier}`;

  if (!sensitiveRateStore.has(key)) {
    sensitiveRateStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  const record = sensitiveRateStore.get(key);

  if (now - record.windowStart > SENSITIVE_RATE_LIMIT.windowMs) {
    sensitiveRateStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (record.count >= SENSITIVE_RATE_LIMIT.maxLookups) {
    return { allowed: false };
  }

  record.count++;
  return { allowed: true };
}

/**
 * Build property info string, conditionally including sensitive data
 * @param {object} property - Firestore property document data
 * @param {string} question - The guest's question
 * @param {string} identifier - Rate limit identifier (IP:propertyId)
 * @returns {object} { propertyInfo: string, sensitiveIncluded: boolean }
 */
function buildPropertyInfo(property, question, identifier) {
  const includeSensitive = isSensitiveQuestion(question);
  let sensitiveIncluded = false;

  const location =
    property.city && property.state
      ? `${property.city}, ${property.state}`
      : property.city || property.state || 'the area';

  const lines = [
    `- Name: ${property.name || 'Vacation Rental'}`,
    `- Location: ${location}`,
    `- Address: ${property.address || 'Not provided'}`,
  ];

  // Only include sensitive access codes when question is relevant
  if (includeSensitive) {
    const rateCheck = checkSensitiveRateLimit(identifier);
    if (rateCheck.allowed) {
      sensitiveIncluded = true;

      if (property.wifiName) {
        lines.push(
          `- WiFi: Network: ${property.wifiName}, Password: ${property.wifiPassword || 'Ask host'}`
        );
      } else {
        lines.push('- WiFi: Not provided');
      }

      lines.push(`- Door Code: ${property.doorCode || 'Not provided'}`);

      if (property.lockboxCode) {
        let lockboxInfo = `Code: ${property.lockboxCode}`;
        if (property.lockboxLocation) {
          lockboxInfo += `, Location: ${property.lockboxLocation}`;
        }
        lines.push(`- Lockbox: ${lockboxInfo}`);
      } else {
        lines.push('- Lockbox: Not provided');
      }

      lines.push(`- Gate Code: ${property.gateCode || 'Not provided'}`);
    } else {
      lines.push('- Access codes: Rate limit reached. Please try again later.');
    }
  } else {
    // For non-sensitive questions, note that codes are available but don't include them
    lines.push('- WiFi/access codes: Available (ask specifically about WiFi or door codes)');
  }

  lines.push(`- Check-in: ${property.checkInTime || 'Not specified'}`);
  lines.push(`- Check-out: ${property.checkOutTime || 'Not specified'}`);
  lines.push(`- House Rules: ${property.houseRules || 'Standard vacation rental rules'}`);
  lines.push(`- Additional Property Info: ${property.customInfo || 'None'}`);
  lines.push(`- Host's Local Recommendations: ${property.localTips || 'None provided'}`);

  return {
    propertyInfo: lines.join('\n'),
    sensitiveIncluded,
    location,
  };
}

// Clean up old entries (called inline, not via setInterval which is unreliable in Cloud Functions)
function cleanupSensitiveRateStore() {
  const now = Date.now();
  for (const [key, record] of sensitiveRateStore.entries()) {
    if (now - record.windowStart > SENSITIVE_RATE_LIMIT.windowMs * 2) {
      sensitiveRateStore.delete(key);
    }
  }
}

module.exports = {
  isSensitiveQuestion,
  checkSensitiveRateLimit,
  buildPropertyInfo,
  SENSITIVE_KEYWORDS,
};
