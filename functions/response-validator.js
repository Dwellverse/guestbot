'use strict';

/**
 * Response Validator for GuestBot AI
 * Verifies AI responses against property data to catch hallucinations.
 * If the AI invents codes, times, or addresses that don't match the property record,
 * those values are flagged or stripped.
 */

/**
 * Extract code-like values from AI response text
 * @param {string} text
 * @returns {Array<{ type: string, value: string }>}
 */
function extractMentionedValues(text) {
  const found = [];

  // WiFi password mentions
  const wifiPatterns = [
    /(?:wifi|wi-fi|wireless)\s*password\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
    /password\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
  ];
  for (const pattern of wifiPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      found.push({ type: 'wifiPassword', value: match[1] });
    }
  }

  // WiFi network name mentions
  const ssidPatterns = [/(?:network|wifi|wi-fi|ssid)\s*(?:name|is|:)\s*["""]?([^\s""",]+)/gi];
  for (const pattern of ssidPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      found.push({ type: 'wifiName', value: match[1] });
    }
  }

  // Door/gate/lockbox/garage code mentions
  const codePatterns = [
    /(?:door|entry)\s*code\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
    /(?:gate)\s*code\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
    /(?:lockbox|lock\s*box)\s*code\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
    /(?:garage)\s*code\s*(?:is|:)\s*["""]?(\S+?)["""]?(?:\s|[.,!]|$)/gi,
  ];
  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const type = pattern.source.includes('door')
        ? 'doorCode'
        : pattern.source.includes('gate')
          ? 'gateCode'
          : pattern.source.includes('lockbox')
            ? 'lockboxCode'
            : pattern.source.includes('garage')
              ? 'garageCode'
              : 'doorCode';
      found.push({ type, value: match[1] });
    }
  }

  // Check-in/check-out time mentions
  const timePatterns = [
    /check[-\s]?in\s*(?:time\s*)?(?:is|:)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/gi,
    /check[-\s]?out\s*(?:time\s*)?(?:is|:)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/gi,
  ];
  for (const pattern of timePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const type = pattern.source.includes('check[-\\s]?in') ? 'checkInTime' : 'checkOutTime';
      found.push({ type, value: match[1] });
    }
  }

  return found;
}

/**
 * Normalize a value for comparison (lowercase, trim, remove surrounding quotes)
 */
function normalize(val) {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .trim()
    .replace(/^["'"]+|["'"]+$/g, '');
}

/**
 * Validate AI response against known property data.
 * Returns the response with hallucinated values flagged.
 *
 * @param {string} response - The AI's response text
 * @param {object} property - The Firestore property data
 * @returns {{ validated: string, hallucinations: Array<{ type: string, mentioned: string, actual: string }> }}
 */
function validateResponse(response, property) {
  const mentioned = extractMentionedValues(response);
  const hallucinations = [];

  // Map of property field names to check
  const fieldMap = {
    wifiPassword: property.wifiPassword,
    wifiName: property.wifiName,
    doorCode: property.doorCode,
    gateCode: property.gateCode,
    garageCode: property.garageCode,
    lockboxCode: property.lockboxCode,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
  };

  for (const item of mentioned) {
    const actual = fieldMap[item.type];
    // Only flag if the property has a value set AND the AI's value doesn't match
    if (actual && normalize(item.value) !== normalize(actual)) {
      hallucinations.push({
        type: item.type,
        mentioned: item.value,
        actual: actual,
      });
    }
  }

  // If hallucinations found, redact the incorrect values instead of inserting real ones
  let validated = response;
  for (const h of hallucinations) {
    validated = validated.replace(
      new RegExp(h.mentioned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '[please ask me specifically for this information]'
    );
  }

  return { validated, hallucinations };
}

module.exports = {
  validateResponse,
  extractMentionedValues,
};
