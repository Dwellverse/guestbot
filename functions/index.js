const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { VertexAI } = require('@google-cloud/vertexai');
const fetch = require('node-fetch');
const ICAL = require('ical.js');

initializeApp();
const db = getFirestore();

// ============================================
// RATE LIMITING (In-memory, resets on cold start)
// For production at scale, use Redis or Firestore
// ============================================
const rateLimitStore = new Map();

const RATE_LIMITS = {
  askGuestBot: { windowMs: 60000, maxRequests: 20 }, // 20 requests per minute
  verifyGuest: { windowMs: 60000, maxRequests: 10 }, // 10 attempts per minute
  syncIcal: { windowMs: 60000, maxRequests: 5 }, // 5 syncs per minute
};

function checkRateLimit(endpoint, identifier) {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();
  const limit = RATE_LIMITS[endpoint];

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit.maxRequests - 1 };
  }

  const record = rateLimitStore.get(key);

  // Reset window if expired
  if (now - record.windowStart > limit.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit.maxRequests - 1 };
  }

  // Check if over limit
  if (record.count >= limit.maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  // Increment counter
  record.count++;
  return { allowed: true, remaining: limit.maxRequests - record.count };
}

// Clean up old entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > 300000) {
      // 5 minutes
      rateLimitStore.delete(key);
    }
  }
}, 60000);

// ============================================
// SSRF PROTECTION - Block private/internal IPs
// ============================================
function isPrivateUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block localhost (including IPv6)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return true;
    }

    // Block private IP ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);

      // 10.0.0.0/8
      if (a === 10) return true;

      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;

      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;

      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return true;

      // 0.0.0.0
      if (a === 0 && b === 0 && c === 0 && d === 0) return true;
    }

    // Block internal hostnames
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return true;
    }

    // Only allow http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true;
    }

    return false;
  } catch {
    return true; // Invalid URL
  }
}

// ============================================
// Lazy-load VertexAI
// ============================================
let _model = null;
function getModel() {
  if (!_model) {
    const PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GCLOUD_PROJECT;
    const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    _model = vertexAI.preview.getGenerativeModel({ model: 'gemini-pro' });
  }
  return _model;
}

// ============================================
// CORS middleware
// ============================================
const cors = (req, res) => {
  const allowedOrigins = [
    'https://guestbot.ai',
    'https://www.guestbot.ai',
    'https://guestbot-ai.web.app',
    'https://guestbot-7029e.web.app',
    'http://localhost:3001',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

// Helper to get client IP
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

// ============================================
// Verify Guest
// ============================================
exports.verifyGuest = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit('verifyGuest', clientIP);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait a minute and try again.',
    });
  }

  const { propertyId, phoneLastFour } = req.body;

  if (!propertyId || !phoneLastFour) {
    return res.status(400).json({
      success: false,
      message: 'Property ID and phone last 4 digits required',
    });
  }

  if (!/^\d{4}$/.test(phoneLastFour)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter exactly 4 digits',
    });
  }

  try {
    const now = new Date();

    // Get bookings for this property
    const bookingsSnapshot = await db
      .collection('guestbot_bookings')
      .where('propertyId', '==', propertyId)
      .get();

    let matchedBooking = null;
    for (const doc of bookingsSnapshot.docs) {
      const booking = doc.data();
      const guestPhone = (booking.guestPhone || '').toString();

      if (guestPhone.slice(-4) === phoneLastFour) {
        const checkIn = booking.checkIn?.toDate
          ? booking.checkIn.toDate()
          : new Date(booking.checkIn);
        const checkOut = booking.checkOut?.toDate
          ? booking.checkOut.toDate()
          : new Date(booking.checkOut);

        if (now >= checkIn && now <= checkOut) {
          matchedBooking = booking;
          break;
        }
      }
    }

    if (!matchedBooking) {
      return res.json({
        success: true,
        verified: false,
        message: 'No active booking found. Please check your phone number.',
      });
    }

    const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
    const property = propertyDoc.exists ? propertyDoc.data() : {};

    res.json({
      success: true,
      verified: true,
      data: {
        guestName: matchedBooking.guestName,
        propertyName: property.name,
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

// ============================================
// Ask GuestBot AI
// ============================================
exports.askGuestBot = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting by IP + propertyId
  const clientIP = getClientIP(req);
  const propertyId = req.body.propertyId || 'unknown';
  const rateCheck = checkRateLimit('askGuestBot', `${clientIP}:${propertyId}`);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment before asking another question.',
    });
  }

  const { question, context: qrContext } = req.body;

  if (!propertyId || !question) {
    return res.status(400).json({
      success: false,
      message: 'Property ID and question required',
    });
  }

  if (question.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Question too long',
    });
  }

  try {
    const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
    if (!propertyDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const property = propertyDoc.data();

    // Context-specific prompts
    const contextPrompts = {
      kitchen: `Focus on: coffee machine, appliances, cooking supplies, trash/recycling, kitchen rules.`,
      tv: `Focus on: TV operation, streaming services, sound system, WiFi for streaming.`,
      thermostat: `Focus on: temperature adjustment, AC/heating, recommended settings.`,
      bathroom: `Focus on: shower/tub operation, towels, toiletries location.`,
      pool: `Focus on: pool/hot tub hours, rules, temperature controls, safety.`,
      checkout: `Focus on: checkout time, departure tasks, key return, final cleanup.`,
      general: `Provide general assistance about the property.`,
    };

    const contextInstruction = contextPrompts[qrContext] || contextPrompts.general;

    const location =
      property.city && property.state
        ? `${property.city}, ${property.state}`
        : property.city || property.state || 'the area';

    const prompt = `You are GuestBot, an AI concierge for vacation rental guests. Be friendly, helpful, and concise.

IMPORTANT - MULTI-LANGUAGE SUPPORT:
- Detect the language of the guest's question
- ALWAYS respond in the SAME LANGUAGE the guest used
- If the guest writes in Spanish, respond in Spanish
- If the guest writes in French, respond in French
- If the guest writes in German, respond in German
- And so on for any language
- Keep property-specific terms (like WiFi network names, addresses) in their original form

CONTEXT: ${contextInstruction}

PROPERTY INFO:
- Name: ${property.name || 'Vacation Rental'}
- Location: ${location}
- Address: ${property.address || 'Not provided'}
- WiFi: ${property.wifiName ? `Network: ${property.wifiName}, Password: ${property.wifiPassword || 'Ask host'}` : 'Not provided'}
- Door Code: ${property.doorCode || 'Not provided'}
- Lockbox: ${property.lockboxCode ? `Code: ${property.lockboxCode}${property.lockboxLocation ? `, Location: ${property.lockboxLocation}` : ''}` : 'Not provided'}
- Gate Code: ${property.gateCode || 'Not provided'}
- Check-in: ${property.checkInTime || 'Not specified'}
- Check-out: ${property.checkOutTime || 'Not specified'}
- House Rules: ${property.houseRules || 'Standard vacation rental rules'}
- Additional Property Info: ${property.customInfo || 'None'}
- Host's Local Recommendations: ${property.localTips || 'None provided'}

LOCATION AWARENESS:
You are knowledgeable about ${location} and the surrounding area. When guests ask about local attractions, restaurants, activities, or services, provide helpful recommendations based on your knowledge of this location. Include:
- Restaurants and dining options
- Outdoor activities, parks, hiking, beaches, nature spots
- Family-friendly and kid activities
- Local events and entertainment venues
- Shopping areas
- Nearby attractions and points of interest

If the host has provided local recommendations above, prioritize those. Otherwise, use your knowledge of ${location} to suggest popular and well-regarded options.

Guest Question: ${question}

Provide a helpful, friendly response in the SAME LANGUAGE as the guest's question. For local recommendations, try to include specific names of places when possible. Keep responses concise but informative.`;

    const result = await getModel().generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    res.json({
      success: true,
      data: { answer },
    });
  } catch (error) {
    console.error('AI error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to process your question. Please try again.',
    });
  }
});

// ============================================
// Sync iCal Feed
// ============================================
exports.syncIcal = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit('syncIcal', clientIP);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: 'Too many sync requests. Please wait a minute.',
    });
  }

  const { propertyId, platform, icalUrl } = req.body;

  if (!propertyId || !icalUrl) {
    return res.status(400).json({
      success: false,
      message: 'Property ID and iCal URL required',
    });
  }

  // SSRF Protection - block private/internal URLs
  if (isPrivateUrl(icalUrl)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid calendar URL',
    });
  }

  // Validate URL format
  try {
    const url = new URL(icalUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid calendar URL protocol',
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      message: 'Invalid calendar URL format',
    });
  }

  try {
    // Fetch the iCal feed with timeout and size limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(icalUrl, {
      headers: {
        'User-Agent': 'GuestBot/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch calendar. Check the URL.',
      });
    }

    // Limit response size (5MB max)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Calendar file too large',
      });
    }

    const icalData = await response.text();

    // Additional size check for chunked responses
    if (icalData.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Calendar file too large',
      });
    }

    // Parse iCal data
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    let imported = 0;
    let skipped = 0;

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      const summary = event.summary || '';
      const dtstart = event.startDate;
      const dtend = event.endDate;
      const uid = event.uid;

      // Skip if no dates
      if (!dtstart || !dtend) {
        skipped++;
        continue;
      }

      const checkIn = dtstart.toJSDate();
      const checkOut = dtend.toJSDate();

      // Parse guest name from summary (Airbnb format: "John S - Reserved")
      let guestName = summary;
      if (summary.includes(' - ')) {
        guestName = summary.split(' - ')[0].trim();
      }
      if (
        summary.toLowerCase().includes('blocked') ||
        summary.toLowerCase().includes('not available')
      ) {
        skipped++;
        continue;
      }

      // Check if booking already exists (by UID)
      const existingQuery = await db
        .collection('guestbot_bookings')
        .where('propertyId', '==', propertyId)
        .where('icalUid', '==', uid)
        .get();

      if (!existingQuery.empty) {
        // Update existing booking
        const docId = existingQuery.docs[0].id;
        await db
          .collection('guestbot_bookings')
          .doc(docId)
          .update({
            guestName,
            checkIn: Timestamp.fromDate(checkIn),
            checkOut: Timestamp.fromDate(checkOut),
            platform: platform || 'ical',
            updatedAt: Timestamp.now(),
          });
      } else {
        // Create new booking
        await db.collection('guestbot_bookings').add({
          propertyId,
          guestName,
          guestPhone: '', // iCal doesn't include phone
          checkIn: Timestamp.fromDate(checkIn),
          checkOut: Timestamp.fromDate(checkOut),
          platform: platform || 'ical',
          icalUid: uid,
          source: 'ical',
          createdAt: Timestamp.now(),
        });
      }

      imported++;
    }

    // Update property sync metadata
    await db
      .collection('guestbot_properties')
      .doc(propertyId)
      .set(
        {
          [`icalUrls.${platform}`]: icalUrl,
          [`syncMetadata.${platform}`]: {
            lastSync: Timestamp.now(),
            eventsImported: imported,
          },
        },
        { merge: true }
      );

    res.json({
      success: true,
      imported,
      skipped,
      message: `Synced ${imported} bookings from ${platform || 'calendar'}`,
    });
  } catch (error) {
    console.error('iCal sync error:', error);

    // Generic error message (don't expose internal details)
    if (error.name === 'AbortError') {
      return res.status(400).json({
        success: false,
        message: 'Calendar fetch timed out. Please try again.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync calendar. Please check the URL and try again.',
    });
  }
});
