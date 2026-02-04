const admin = require('firebase-admin');

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or default service account)
admin.initializeApp({
    projectId: 'guestbot-7029e'
});

const db = admin.firestore();
const auth = admin.auth();

async function addMockProperty() {
    const email = 'dwellverse.io@gmail.com';

    try {
        // Get user by email
        const user = await auth.getUserByEmail(email);
        console.log('Found user:', user.uid);

        // Create mock property
        const mockProperty = {
            ownerId: user.uid,
            name: 'Oceanview Beach House',
            address: '742 Coastal Highway',
            city: 'Miami Beach',
            state: 'FL',
            wifiName: 'BeachHouse_5G',
            wifiPassword: 'sunset2024',
            doorCode: '1234',
            lockboxCode: '5678',
            gateCode: '',
            checkInTime: '4:00 PM',
            checkOutTime: '11:00 AM',
            houseRules: 'No smoking. No parties. Quiet hours 10pm-8am. Max 6 guests. Pets allowed with prior approval.',
            customInfo: 'The beach is a 2-minute walk. Beach chairs and umbrellas are in the garage. Pool towels are in the hallway closet.',
            localTips: 'Joe\'s Stone Crab (10 min) - best seafood in town. Lummus Park Beach - right across the street. South Pointe Park - great sunset views. Publix grocery store - 5 min drive on Collins Ave.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('guestbot_properties').add(mockProperty);
        console.log('Created property with ID:', docRef.id);

        // Also add a mock booking
        const mockBooking = {
            propertyId: docRef.id,
            guestName: 'John Smith',
            guestPhone: '5551234567',
            checkIn: admin.firestore.Timestamp.fromDate(new Date('2026-02-01')),
            checkOut: admin.firestore.Timestamp.fromDate(new Date('2026-02-08')),
            platform: 'airbnb',
            source: 'manual',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('guestbot_bookings').add(mockBooking);
        console.log('Created mock booking');

        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

addMockProperty();
