'use strict';

/**
 * Context Detector for GuestBot AI
 * Auto-detects the most relevant context from the guest's question,
 * overriding the QR code context when appropriate.
 */

const CONTEXT_KEYWORDS = {
  kitchen: [
    'kitchen',
    'cook',
    'cooking',
    'oven',
    'stove',
    'microwave',
    'fridge',
    'refrigerator',
    'freezer',
    'dishwasher',
    'coffee',
    'toaster',
    'blender',
    'utensil',
    'plate',
    'cup',
    'glass',
    'pot',
    'pan',
    'trash',
    'recycling',
    'garbage',
    'disposal',
    'sink',
    'ice',
    'water filter',
  ],
  tv: [
    'tv',
    'television',
    'remote',
    'netflix',
    'hulu',
    'streaming',
    'roku',
    'apple tv',
    'fire stick',
    'chromecast',
    'hdmi',
    'speaker',
    'sound',
    'volume',
    'surround',
    'soundbar',
    'movie',
    'channel',
    'cable',
    'bluetooth',
    'airplay',
  ],
  thermostat: [
    'thermostat',
    'temperature',
    'ac',
    'a/c',
    'air conditioning',
    'heating',
    'heat',
    'cold',
    'warm',
    'cool',
    'fan',
    'hvac',
    'climate',
    'furnace',
    'heater',
  ],
  bathroom: [
    'bathroom',
    'shower',
    'bath',
    'tub',
    'bathtub',
    'hot water',
    'towel',
    'toilet',
    'shampoo',
    'soap',
    'toiletries',
    'hair dryer',
    'drain',
  ],
  pool: [
    'pool',
    'hot tub',
    'jacuzzi',
    'spa',
    'swim',
    'swimming',
    'sauna',
    'pool heater',
    'pool cover',
    'chlorine',
  ],
  checkout: [
    'checkout',
    'check-out',
    'check out',
    'leaving',
    'departure',
    'depart',
    'key return',
    'final',
    'last day',
    'vacate',
    'clean up before',
    'strip the bed',
    'take out trash',
  ],
};

/**
 * Detect the best context for a question based on keyword matching.
 * Returns the detected context or null if no strong match.
 * @param {string} question - The guest's question
 * @returns {{ detected: string|null, confidence: number }}
 */
function detectContext(question) {
  const lower = question.toLowerCase();
  let bestContext = null;
  let bestScore = 0;

  for (const [context, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        // Longer keywords get more weight (more specific)
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestContext = context;
    }
  }

  // Require a minimum confidence threshold (at least one keyword match)
  if (bestScore < 2) {
    return { detected: null, confidence: 0 };
  }

  // Normalize confidence to 0-1 range (cap at reasonable max)
  const confidence = Math.min(bestScore / 20, 1);
  return { detected: bestContext, confidence };
}

/**
 * Resolve the effective context: use detected context if confident,
 * otherwise fall back to the QR code context.
 * @param {string} question - The guest's question
 * @param {string} qrContext - The QR code context from the URL
 * @returns {{ context: string, source: string }}
 */
function resolveContext(question, qrContext) {
  const { detected, confidence } = detectContext(question);

  // Use detected context if confidence is high enough
  if (detected && confidence >= 0.3) {
    return { context: detected, source: 'detected' };
  }

  return { context: qrContext || 'general', source: 'qr' };
}

module.exports = {
  detectContext,
  resolveContext,
  CONTEXT_KEYWORDS,
};
