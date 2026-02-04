const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { VertexAI } = require('@google-cloud/vertexai');

initializeApp();
const db = getFirestore();

// Lazy-load VertexAI
let _model = null;
function getModel() {
    if (!_model) {
        const PROJECT_ID = process.env.VERTEX_PROJECT_ID || 'guestbot-7029e';
        const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
        const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
        _model = vertexAI.preview.getGenerativeModel({ model: 'gemini-pro' });
    }
    return _model;
}

// CORS middleware
const cors = (req, res) => {
    const allowedOrigins = [
        'https://guestbot-ai.web.app',
        'http://localhost:3001',
        'http://localhost:5173'
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

// Verify Guest
exports.verifyGuest = onRequest({ cors: false }, async (req, res) => {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { propertyId, phoneLastFour } = req.body;

    if (!propertyId || !phoneLastFour) {
        return res.status(400).json({
            success: false,
            message: 'Property ID and phone last 4 digits required'
        });
    }

    if (!/^\d{4}$/.test(phoneLastFour)) {
        return res.status(400).json({
            success: false,
            message: 'Please enter exactly 4 digits'
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
                const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
                const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);

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
                message: 'No active booking found. Please check your phone number.'
            });
        }

        const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
        const property = propertyDoc.exists ? propertyDoc.data() : {};

        res.json({
            success: true,
            verified: true,
            data: {
                guestName: matchedBooking.guestName,
                propertyName: property.name
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Ask GuestBot AI
exports.askGuestBot = onRequest({ cors: false }, async (req, res) => {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { propertyId, question, context: qrContext } = req.body;

    if (!propertyId || !question) {
        return res.status(400).json({
            success: false,
            message: 'Property ID and question required'
        });
    }

    if (question.length > 500) {
        return res.status(400).json({
            success: false,
            message: 'Question too long'
        });
    }

    try {
        const propertyDoc = await db.collection('guestbot_properties').doc(propertyId).get();
        if (!propertyDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Property not found'
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
            general: `Provide general assistance about the property.`
        };

        const contextInstruction = contextPrompts[qrContext] || contextPrompts.general;

        const prompt = `You are GuestBot, an AI concierge for vacation rental guests. Be friendly and concise.

CONTEXT: ${contextInstruction}

PROPERTY INFO:
- Name: ${property.name || 'Vacation Rental'}
- Location: ${property.city || ''}${property.city && property.state ? ', ' : ''}${property.state || ''}
- WiFi: ${property.wifiName ? `Network: ${property.wifiName}, Password: ${property.wifiPassword || 'Ask host'}` : 'Not provided'}
- Door Code: ${property.doorCode || 'Not provided'}
- Lockbox: ${property.lockboxCode || 'Not provided'}
- Gate Code: ${property.gateCode || 'Not provided'}
- Check-in: ${property.checkInTime || 'Not specified'}
- Check-out: ${property.checkOutTime || 'Not specified'}
- House Rules: ${property.houseRules || 'Standard vacation rental rules'}
- Additional Info: ${property.customInfo || 'None'}

Guest Question: ${question}

Provide a helpful, friendly response. Keep it concise.`;

        const result = await getModel().generateContent(prompt);
        const response = await result.response;
        const answer = response.text();

        res.json({
            success: true,
            data: { answer }
        });
    } catch (error) {
        console.error('AI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get response. Please try again.'
        });
    }
});
