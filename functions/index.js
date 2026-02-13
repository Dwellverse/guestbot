const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { VertexAI, HarmCategory, HarmBlockThreshold } = require('@google-cloud/vertexai');
const crypto = require('crypto');
const dns = require('dns').promises;
const ICAL = require('ical.js');
const { getAuth } = require('firebase-admin/auth');
const { checkRateLimit, recordFailedAttempt, checkBruteForce } = require('./rate-limiter');
const { sanitizeQuestion } = require('./input-sanitizer');
const { buildPrompt } = require('./ai-prompt');
const { filterOutput } = require('./output-filter');
const { validateResponse } = require('./response-validator');
const { checkSubscription } = require('./subscription');
const { syncSubscriptionToUser } = require('./subscription-sync');

initializeApp();
const db = getFirestore();

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

    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);

      // 10.0.0.0/8
      if (a === 10) return true;

      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;

      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;

      // 169.254.0.0/16 (link-local / cloud metadata)
      if (a === 169 && b === 254) return true;

      // 0.0.0.0
      if (a === 0 && b === 0 && c === 0 && d === 0) return true;
    }

    // Block IPv6 private ranges
    // Remove brackets for IPv6 addresses
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');

    // IPv6 unique local (fc00::/7)
    if (/^fc[0-9a-f]{2}:/i.test(cleanHostname) || /^fd[0-9a-f]{2}:/i.test(cleanHostname)) {
      return true;
    }

    // IPv6 link-local (fe80::/10)
    if (/^fe[89ab][0-9a-f]:/i.test(cleanHostname)) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (/^::ffff:/i.test(cleanHostname)) {
      return true;
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return true;
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

/**
 * Check if an IP address is private/internal
 */
function isPrivateIP(ip) {
  const match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return true; // Non-IPv4, be cautious
  const [, a, b] = match.map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Resolve hostname and check if it points to a private IP (DNS rebinding protection)
 */
async function resolvesToPrivateIP(hostname) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false; // IP literals checked by isPrivateUrl
  try {
    const { address } = await dns.lookup(hostname);
    return isPrivateIP(address);
  } catch {
    return true; // DNS resolution failed, block
  }
}

/**
 * Safe fetch with SSRF protection: validates URL, checks DNS resolution,
 * and handles redirects safely (up to 3 hops).
 */
async function safeFetch(urlString, options = {}, maxRedirects = 3) {
  let currentUrl = urlString;
  for (let i = 0; i <= maxRedirects; i++) {
    if (isPrivateUrl(currentUrl)) {
      throw new Error('Blocked: private URL');
    }
    const parsed = new URL(currentUrl);
    if (await resolvesToPrivateIP(parsed.hostname)) {
      throw new Error('Blocked: resolves to private IP');
    }
    const response = await fetch(currentUrl, { ...options, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location header');
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects');
}

// ============================================
// Lazy-load VertexAI with safety settings
// ============================================
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

let _vertexAI = null;
function getVertexAI() {
  if (!_vertexAI) {
    const PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GCLOUD_PROJECT;
    const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  }
  return _vertexAI;
}

/**
 * Get a generative model with dynamic temperature.
 * @param {number} temperature - Temperature for this request (0.0-1.0)
 */
function getModel(temperature = 0.5) {
  return getVertexAI().preview.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      maxOutputTokens: 1024,
      temperature,
    },
    safetySettings: SAFETY_SETTINGS,
  });
}

// ============================================
// CORS middleware with security headers
// ============================================
const cors = (req, res) => {
  const allowedOrigins = [
    'https://guestbot.io',
    'https://www.guestbot.io',
    'https://guestbot-ai.web.app',
    'https://guestbot-7029e.web.app',
  ];

  // Only include localhost origins when running in emulator
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    allowedOrigins.push('http://localhost:3001', 'http://localhost:5173');
  }

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  res.set('Vary', 'Origin');

  // Security headers on all responses
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');

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

/**
 * Verify Firebase Auth ID token from Authorization header
 * Returns decoded token or null
 */
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    return await getAuth().verifyIdToken(idToken);
  } catch {
    return null;
  }
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

  // Validate propertyId exists
  const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
  if (!propertyDoc.exists) {
    // Use identical message to prevent property enumeration
    return res.json({
      success: true,
      verified: false,
      message: 'No active booking found. Please check your phone number.',
    });
  }

  // Check brute force lockout
  const bruteForceCheck = await checkBruteForce(clientIP, propertyId);
  if (bruteForceCheck.locked) {
    // Use identical message to prevent lockout enumeration
    return res.json({
      success: true,
      verified: false,
      message: 'No active booking found. Please check your phone number.',
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
      // Record failed attempt for brute force protection
      await recordFailedAttempt(clientIP, propertyId);

      return res.json({
        success: true,
        verified: false,
        message: 'No active booking found. Please check your phone number.',
      });
    }

    const property = propertyDoc.data();

    // Generate a session token for authenticated API access
    const sessionToken = crypto.randomUUID();
    await db
      .collection('guestbot_sessions')
      .doc(sessionToken)
      .set({
        propertyId,
        clientIP,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000), // 30 min
      });

    res.json({
      success: true,
      verified: true,
      data: {
        guestName: matchedBooking.guestName,
        propertyName: property.name,
        sessionToken,
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

// ============================================
// Ask GuestBot AI (with streaming support)
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

  // Verify session token
  const { question, context: qrContext, history, stream: useStreaming, sessionToken } = req.body;

  if (!sessionToken) {
    return res.status(401).json({
      success: false,
      message: 'Verification required',
    });
  }

  const sessionDoc = await db.collection('guestbot_sessions').doc(sessionToken).get();
  if (!sessionDoc.exists) {
    return res.status(401).json({
      success: false,
      message: 'Invalid session',
    });
  }

  const session = sessionDoc.data();
  if (session.propertyId !== propertyId || session.expiresAt.toMillis() < Date.now()) {
    return res.status(401).json({
      success: false,
      message: 'Session expired. Please verify again.',
    });
  }

  if (!propertyId || propertyId === 'unknown' || !question) {
    return res.status(400).json({
      success: false,
      message: 'Property ID and question required',
    });
  }

  // Sanitize user input
  const sanitized = sanitizeQuestion(question);
  if (sanitized.rejected) {
    return res.status(400).json({
      success: false,
      message: 'Invalid question',
    });
  }

  if (sanitized.sanitized.length > 500) {
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

    // Verify property owner has active subscription
    const ownerSub = await checkSubscription(property.ownerId);
    if (!ownerSub.active) {
      return res.status(403).json({
        success: false,
        message: 'This property is currently unavailable. Please contact the host.',
      });
    }

    const identifier = `${clientIP}:${propertyId}`;

    // Build structured prompt with conversation history and smart context
    const { systemInstruction, contents, temperature, resolvedContext } = buildPrompt(
      property,
      sanitized.sanitized,
      qrContext || 'general',
      identifier,
      history
    );

    const model = getModel(temperature);

    if (useStreaming) {
      // SSE streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send resolved context as first event
      res.write(`data: ${JSON.stringify({ type: 'context', context: resolvedContext })}\n\n`);

      const streamResult = await model.generateContentStream({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
      });

      let fullText = '';

      for await (const chunk of streamResult.stream) {
        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (chunkText) {
          fullText += chunkText;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
        }
      }

      // Post-stream: validate and filter the complete response
      const { validated, hallucinations } = validateResponse(fullText, property);
      const { filtered, wasFiltered } = filterOutput(validated);

      if (wasFiltered || hallucinations.length > 0) {
        // Send a correction event with the filtered/validated full response
        res.write(`data: ${JSON.stringify({ type: 'replace', text: filtered })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } else {
      // Non-streaming response (backwards compatible)
      const result = await model.generateContent({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
      });

      const response = await result.response;
      const rawAnswer = response.text();

      // Validate against property data, then filter
      const { validated } = validateResponse(rawAnswer, property);
      const { filtered: answer } = filterOutput(validated);

      res.json({
        success: true,
        data: { answer, context: resolvedContext },
      });
    }
  } catch (error) {
    console.error('AI error:', error);
    // For streaming, check if headers already sent
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'Unable to process your question.' })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({
        success: false,
        message: 'Unable to process your question. Please try again.',
      });
    }
  }
});

// ============================================
// Submit Contact Form
// ============================================
exports.submitContact = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit('submitContact', `${clientIP}:contact`);
  if (!rateCheck.allowed) {
    return res
      .status(429)
      .json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  const { firstName, lastName, email, subject, message } = req.body;

  if (!firstName || !lastName || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  try {
    await db.collection('guestbot_contact').add({
      firstName: String(firstName).substring(0, 100),
      lastName: String(lastName).substring(0, 100),
      email: String(email).substring(0, 200),
      subject: String(subject).substring(0, 200),
      message: String(message).substring(0, 2000),
      ip: clientIP,
      createdAt: Timestamp.now(),
      read: false,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit. Please try again.' });
  }
});

// ============================================
// Submit Feedback (thumbs up/down on AI responses)
// ============================================
exports.submitFeedback = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit('submitFeedback', `${clientIP}:feedback`);
  if (!rateCheck.allowed) {
    return res.status(429).json({ success: false, message: 'Too many requests.' });
  }

  const { propertyId, question, rating } = req.body;

  if (!propertyId || !question || !['positive', 'negative'].includes(rating)) {
    return res.status(400).json({
      success: false,
      message: 'propertyId, question, and rating (positive/negative) required',
    });
  }

  try {
    // Verify property exists (return success regardless to prevent enumeration)
    const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
    if (!propertyDoc.exists) {
      return res.json({ success: true });
    }

    await db.collection('guestbot_feedback').add({
      propertyId,
      question: String(question).substring(0, 200), // Truncate for storage
      rating,
      createdAt: Timestamp.now(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit feedback.' });
  }
});

// ============================================
// Sync iCal Feed (requires Firebase Auth)
// ============================================
exports.syncIcal = onRequest({ cors: false }, async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Firebase Auth token
  const decodedToken = await verifyAuthToken(req);
  if (!decodedToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  // Verify active subscription
  const userSub = await checkSubscription(decodedToken.uid);
  if (!userSub.active) {
    return res.status(403).json({
      success: false,
      message: 'Active subscription required to sync calendars.',
    });
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

  // Validate platform to prevent Firestore field injection
  const ALLOWED_PLATFORMS = ['airbnb', 'vrbo', 'booking'];
  const safePlatform = ALLOWED_PLATFORMS.includes(platform) ? platform : 'other';

  // Verify the user owns this property
  const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
  if (!propertyDoc.exists) {
    return res.status(404).json({
      success: false,
      message: 'Property not found',
    });
  }

  const property = propertyDoc.data();
  if (property.ownerId !== decodedToken.uid) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to sync this property',
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

    const response = await safeFetch(icalUrl, {
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
            platform: safePlatform,
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
          platform: safePlatform,
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
          [`icalUrls.${safePlatform}`]: icalUrl,
          [`syncMetadata.${safePlatform}`]: {
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
      message: `Synced ${imported} bookings from ${safePlatform}`,
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

// ============================================
// Subscription Sync Trigger
// Fires when Stripe extension writes to customers/{uid}/subscriptions/{id}
// ============================================
exports.syncSubscriptionStatus = onDocumentWritten(
  'customers/{uid}/subscriptions/{subscriptionId}',
  async (event) => {
    const uid = event.params.uid;
    await syncSubscriptionToUser(uid);
  }
);

// Export isPrivateUrl for testing
exports._isPrivateUrl = isPrivateUrl;
exports._isPrivateIP = isPrivateIP;
exports._safeFetch = safeFetch;
