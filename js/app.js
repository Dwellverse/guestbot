import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyA0wGXqNLsW9IoimyvlQQg4GTSoZIy9Wkk',
  authDomain: 'guestbot-7029e.firebaseapp.com',
  projectId: 'guestbot-7029e',
  storageBucket: 'guestbot-7029e.firebasestorage.app',
  messagingSenderId: '501713945904',
  appId: '1:501713945904:web:cbf7c09c9e04fca905f4f5',
});

const auth = getAuth(app);
const db = getFirestore(app);

// HTML escape utility to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// State
let currentUser = null;
let properties = [];
let isSignUp = false;

// DOM Elements
const authScreen = document.getElementById('authScreen');
const appEl = document.getElementById('app');
const authForm = document.getElementById('authForm');
const authError = document.getElementById('authError');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authBtn = document.getElementById('authBtn');
const authToggleText = document.getElementById('authToggleText');
const authToggleLink = document.getElementById('authToggleLink');
const nameGroup = document.getElementById('nameGroup');
const propertiesGrid = document.getElementById('propertiesGrid');
const emptyState = document.getElementById('emptyState');
const propertyModal = document.getElementById('propertyModal');
const bookingModal = document.getElementById('bookingModal');

// Auth state
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userAvatar').textContent = (user.email || 'U')[0].toUpperCase();
    authScreen.style.display = 'none';
    appEl.classList.add('active');
    // Load properties in background - UI is immediately usable
    loadProperties();
  } else {
    currentUser = null;
    authScreen.style.display = 'flex';
    appEl.classList.remove('active');
  }
});

// Toggle sign up / sign in
authToggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUp = !isSignUp;
  if (isSignUp) {
    authTitle.textContent = 'Create account';
    authSubtitle.textContent = 'Sign up to start using GuestBot';
    authBtn.textContent = 'Sign Up';
    authToggleText.textContent = 'Already have an account?';
    authToggleLink.textContent = 'Sign in';
    nameGroup.classList.remove('hidden');
  } else {
    authTitle.textContent = 'Welcome back';
    authSubtitle.textContent = 'Sign in to manage your properties';
    authBtn.textContent = 'Sign In';
    authToggleText.textContent = "Don't have an account?";
    authToggleLink.textContent = 'Sign up';
    nameGroup.classList.add('hidden');
  }
  authError.classList.remove('show');
});

// Auth form submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  const name = document.getElementById('nameInput').value;

  authBtn.disabled = true;
  authBtn.textContent = isSignUp ? 'Creating account...' : 'Signing in...';
  authError.classList.remove('show');

  try {
    if (isSignUp) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Create user doc
      await setDoc(doc(db, 'guestbot_users', cred.user.uid), {
        email,
        name,
        createdAt: Timestamp.now(),
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = err.message.replace('Firebase: ', '');
    authError.classList.add('show');
    authBtn.disabled = false;
    authBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  signOut(auth);
});

// Load properties (non-blocking - UI is usable immediately)
async function loadProperties() {
  propertiesGrid.innerHTML = '';

  try {
    const q = query(collection(db, 'guestbot_properties'), where('ownerId', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    properties = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (properties.length === 0) {
      emptyState.classList.remove('hidden');
      propertiesGrid.innerHTML = '';
    } else {
      emptyState.classList.add('hidden');
      renderProperties();
    }
  } catch (err) {
    console.error(err);
    // On error, still show empty state so user can add properties
    emptyState.classList.remove('hidden');
  }
}

// Render properties
function renderProperties() {
  const locationText = (p) => {
    const parts = [p.address, p.city, p.state].filter(Boolean);
    return parts.join(', ') || 'No address';
  };

  propertiesGrid.innerHTML =
    properties
      .map(
        (p) => `
                <div class="property-card" data-id="${escapeHtml(p.id)}">
                    <div class="property-icon">🏠</div>
                    <div class="property-info">
                        <div class="property-name">${escapeHtml(p.name || 'Unnamed Property')}</div>
                        <div class="property-address">${escapeHtml(locationText(p))}</div>
                    </div>
                    <div class="property-meta">
                        ${p.wifiName ? '<div class="property-badge">📶 WiFi</div>' : ''}
                        ${p.doorCode ? '<div class="property-badge">🔑 Code</div>' : ''}
                    </div>
                    <div class="property-arrow">›</div>
                </div>
            `
      )
      .join('') +
    `
                <div class="add-property-card" id="addPropertyCard">
                    <div class="add-property-icon">+</div>
                    <div class="add-property-text">Add new property</div>
                </div>
            `;

  // Property click handlers
  document.querySelectorAll('.property-card').forEach((card) => {
    card.addEventListener('click', () => openPropertyModal(card.dataset.id));
  });
  document
    .getElementById('addPropertyCard')
    ?.addEventListener('click', () => openPropertyModal(null));
}

// Open property modal
async function openPropertyModal(propertyId) {
  const modal = document.getElementById('propertyModal');
  const title = document.getElementById('propertyModalTitle');
  const deleteBtn = document.getElementById('deletePropertyBtn');

  // Reset form
  document.getElementById('propertyForm').reset();
  document.getElementById('propertyId').value = '';
  document.getElementById('qrCodes').innerHTML =
    '<p style="color: var(--gray-500);">Save property first to generate QR codes</p>';
  document.getElementById('bookingsList').innerHTML =
    '<div class="no-bookings">No bookings yet</div>';

  // Reset tabs
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="details"]').classList.add('active');
  document.querySelector('.tab-content[data-tab="details"]').classList.add('active');

  if (propertyId) {
    title.textContent = 'Edit Property';
    deleteBtn.classList.remove('hidden');

    const prop = properties.find((p) => p.id === propertyId);
    if (prop) {
      document.getElementById('propertyId').value = propertyId;
      document.getElementById('propName').value = prop.name || '';
      document.getElementById('propAddress').value = prop.address || '';
      document.getElementById('propCity').value = prop.city || '';
      document.getElementById('propState').value = prop.state || '';
      document.getElementById('propWifiName').value = prop.wifiName || '';
      document.getElementById('propWifiPassword').value = prop.wifiPassword || '';
      document.getElementById('propDoorCode').value = prop.doorCode || '';
      document.getElementById('propLockboxCode').value = prop.lockboxCode || '';
      document.getElementById('propLockboxLocation').value = prop.lockboxLocation || '';
      document.getElementById('propGateCode').value = prop.gateCode || '';
      document.getElementById('propGarageCode').value = prop.garageCode || '';
      document.getElementById('propCheckIn').value = prop.checkInTime || '';
      document.getElementById('propCheckOut').value = prop.checkOutTime || '';
      document.getElementById('propRules').value = prop.houseRules || '';
      document.getElementById('propCustomInfo').value = prop.customInfo || '';
      document.getElementById('propLocalTips').value = prop.localTips || '';

      // Load iCal URLs
      const icalUrls = prop.icalUrls || {};
      document.getElementById('airbnbIcalUrl').value = icalUrls.airbnb || '';
      document.getElementById('vrboIcalUrl').value = icalUrls.vrbo || '';
      document.getElementById('bookingIcalUrl').value = icalUrls.booking || '';

      // Update sync status
      ['airbnb', 'vrbo', 'booking'].forEach((platform) => {
        const statusEl = document.getElementById(`${platform}SyncStatus`);
        const syncMeta = prop.syncMetadata?.[platform];
        if (icalUrls[platform] && syncMeta?.lastSync) {
          const lastSync = syncMeta.lastSync.toDate
            ? syncMeta.lastSync.toDate()
            : new Date(syncMeta.lastSync);
          statusEl.textContent = `Last synced: ${lastSync.toLocaleDateString()} ${lastSync.toLocaleTimeString()}`;
          statusEl.className = 'sync-status success';
        } else if (icalUrls[platform]) {
          statusEl.textContent = 'URL saved - click Sync to import bookings';
          statusEl.className = 'sync-status';
        } else {
          statusEl.textContent = '';
          statusEl.className = 'sync-status';
        }
      });

      generateQRCodes(propertyId);
      loadBookings(propertyId);
    }
  } else {
    title.textContent = 'Add Property';
    deleteBtn.classList.add('hidden');
    // Clear iCal fields
    document.getElementById('airbnbIcalUrl').value = '';
    document.getElementById('vrboIcalUrl').value = '';
    document.getElementById('bookingIcalUrl').value = '';
    ['airbnb', 'vrbo', 'booking'].forEach((platform) => {
      document.getElementById(`${platform}SyncStatus`).textContent = '';
    });
  }

  modal.classList.add('active');
}

// Close property modal
function closePropertyModal() {
  propertyModal.classList.remove('active');
}

document.getElementById('propertyModalClose').addEventListener('click', closePropertyModal);
document.getElementById('cancelPropertyBtn').addEventListener('click', closePropertyModal);
propertyModal.addEventListener('click', (e) => {
  if (e.target === propertyModal) closePropertyModal();
});

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.tab-content[data-tab="${tabName}"]`).classList.add('active');
  });
});

// Save property
document.getElementById('savePropertyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('savePropertyBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const data = {
    ownerId: currentUser.uid,
    name: document.getElementById('propName').value,
    address: document.getElementById('propAddress').value,
    city: document.getElementById('propCity').value,
    state: document.getElementById('propState').value,
    wifiName: document.getElementById('propWifiName').value,
    wifiPassword: document.getElementById('propWifiPassword').value,
    doorCode: document.getElementById('propDoorCode').value,
    lockboxCode: document.getElementById('propLockboxCode').value,
    lockboxLocation: document.getElementById('propLockboxLocation').value,
    gateCode: document.getElementById('propGateCode').value,
    garageCode: document.getElementById('propGarageCode').value,
    checkInTime: document.getElementById('propCheckIn').value,
    icalUrls: {
      airbnb: document.getElementById('airbnbIcalUrl').value.trim(),
      vrbo: document.getElementById('vrboIcalUrl').value.trim(),
      booking: document.getElementById('bookingIcalUrl').value.trim(),
    },
    checkOutTime: document.getElementById('propCheckOut').value,
    houseRules: document.getElementById('propRules').value,
    customInfo: document.getElementById('propCustomInfo').value,
    localTips: document.getElementById('propLocalTips').value,
    updatedAt: Timestamp.now(),
  };

  try {
    const existingId = document.getElementById('propertyId').value;
    if (existingId) {
      await setDoc(doc(db, 'guestbot_properties', existingId), data, { merge: true });
    } else {
      data.createdAt = Timestamp.now();
      await addDoc(collection(db, 'guestbot_properties'), data);
    }

    closePropertyModal();
    await loadProperties();
  } catch (err) {
    console.error(err);
    alert('Failed to save property');
  }

  btn.disabled = false;
  btn.textContent = 'Save Property';
});

// Delete property
document.getElementById('deletePropertyBtn').addEventListener('click', async () => {
  if (!confirm('Delete this property? This cannot be undone.')) return;

  const propertyId = document.getElementById('propertyId').value;
  if (!propertyId) return;

  try {
    await deleteDoc(doc(db, 'guestbot_properties', propertyId));
    closePropertyModal();
    await loadProperties();
  } catch (err) {
    console.error(err);
    alert('Failed to delete property');
  }
});

// Add property buttons
document
  .getElementById('addFirstPropertyBtn')
  ?.addEventListener('click', () => openPropertyModal(null));

// Generate QR codes
function generateQRCodes(propertyId) {
  const container = document.getElementById('qrCodes');
  const contexts = [
    { id: 'general', label: 'General' },
    { id: 'kitchen', label: 'Kitchen' },
    { id: 'tv', label: 'TV' },
    { id: 'thermostat', label: 'Thermostat' },
    { id: 'pool', label: 'Pool' },
    { id: 'checkout', label: 'Checkout' },
  ];

  container.innerHTML = contexts
    .map(
      (c) => `
                <div class="qr-item">
                    <canvas id="qr-${c.id}"></canvas>
                    <div class="qr-label">${c.label}</div>
                </div>
            `
    )
    .join('');

  contexts.forEach((c) => {
    const url = `${window.location.origin}/chat?p=${propertyId}&c=${c.id}`;
    QRCode.toCanvas(document.getElementById(`qr-${c.id}`), url, {
      width: 120,
      margin: 2,
      color: { dark: '#ffffff', light: '#111111' },
    });
  });
}

// Load bookings
async function loadBookings(propertyId) {
  const container = document.getElementById('bookingsList');

  try {
    const q = query(collection(db, 'guestbot_bookings'), where('propertyId', '==', propertyId));
    const snapshot = await getDocs(q);
    const bookings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (bookings.length === 0) {
      container.innerHTML = '<div class="no-bookings">No bookings yet</div>';
      return;
    }

    const now = new Date();
    container.innerHTML = `
                    <table class="bookings-table">
                        <thead>
                            <tr>
                                <th>Guest</th>
                                <th>Phone</th>
                                <th>Check-in</th>
                                <th>Check-out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bookings
                              .map((b) => {
                                const checkIn = b.checkIn?.toDate
                                  ? b.checkIn.toDate()
                                  : new Date(b.checkIn);
                                const checkOut = b.checkOut?.toDate
                                  ? b.checkOut.toDate()
                                  : new Date(b.checkOut);
                                let status = 'past';
                                if (now >= checkIn && now <= checkOut) status = 'active';
                                else if (now < checkIn) status = 'upcoming';

                                return `
                                    <tr>
                                        <td>${escapeHtml(b.guestName || '-')}</td>
                                        <td>${escapeHtml(b.guestPhone || '-')}</td>
                                        <td>${checkIn.toLocaleDateString()}</td>
                                        <td>${checkOut.toLocaleDateString()}</td>
                                        <td><span class="booking-status ${status}">${status}</span></td>
                                    </tr>
                                `;
                              })
                              .join('')}
                        </tbody>
                    </table>
                `;
  } catch (err) {
    console.error(err);
  }
}

// Add booking modal
document.getElementById('addBookingBtn').addEventListener('click', () => {
  document.getElementById('bookingForm').reset();
  bookingModal.classList.add('active');
});

document.getElementById('bookingModalClose').addEventListener('click', () => {
  bookingModal.classList.remove('active');
});

document.getElementById('cancelBookingBtn').addEventListener('click', () => {
  bookingModal.classList.remove('active');
});

bookingModal.addEventListener('click', (e) => {
  if (e.target === bookingModal) bookingModal.classList.remove('active');
});

// Save booking
document.getElementById('saveBookingBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveBookingBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const propertyId = document.getElementById('propertyId').value;
  if (!propertyId) {
    alert('Save property first');
    btn.disabled = false;
    btn.textContent = 'Add Booking';
    return;
  }

  const data = {
    propertyId,
    guestName: document.getElementById('bookingGuestName').value,
    guestPhone: document.getElementById('bookingGuestPhone').value.replace(/\D/g, ''),
    checkIn: new Date(document.getElementById('bookingCheckIn').value),
    checkOut: new Date(document.getElementById('bookingCheckOut').value),
    createdAt: Timestamp.now(),
  };

  try {
    await addDoc(collection(db, 'guestbot_bookings'), data);
    bookingModal.classList.remove('active');
    loadBookings(propertyId);
  } catch (err) {
    console.error(err);
    alert('Failed to save booking');
  }

  btn.disabled = false;
  btn.textContent = 'Add Booking';
});

// iCal Sync buttons
document.querySelectorAll('.sync-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;
    const urlInput = document.getElementById(`${platform}IcalUrl`);
    const statusEl = document.getElementById(`${platform}SyncStatus`);
    const url = urlInput.value.trim();

    if (!url) {
      statusEl.textContent = 'Please enter an iCal URL';
      statusEl.className = 'sync-status error';
      return;
    }

    const propertyId = document.getElementById('propertyId').value;
    if (!propertyId) {
      statusEl.textContent = 'Please save the property first';
      statusEl.className = 'sync-status error';
      return;
    }

    btn.classList.add('syncing');
    btn.textContent = 'Syncing...';
    statusEl.textContent = 'Fetching calendar...';
    statusEl.className = 'sync-status';

    try {
      // Call the Cloud Function to sync
      const response = await fetch('/api/sync-ical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
        },
        body: JSON.stringify({
          propertyId,
          platform,
          icalUrl: url,
        }),
      });

      const result = await response.json();

      if (result.success) {
        statusEl.textContent = `Synced ${result.imported || 0} bookings`;
        statusEl.className = 'sync-status success';

        // Update property with sync metadata
        await setDoc(
          doc(db, 'guestbot_properties', propertyId),
          {
            [`syncMetadata.${platform}.lastSync`]: Timestamp.now(),
            [`icalUrls.${platform}`]: url,
          },
          { merge: true }
        );

        // Reload bookings
        loadBookings(propertyId);
      } else {
        statusEl.textContent = result.message || 'Sync failed';
        statusEl.className = 'sync-status error';
      }
    } catch (err) {
      console.error('Sync error:', err);
      statusEl.textContent = 'Sync failed - check URL';
      statusEl.className = 'sync-status error';
    }

    btn.classList.remove('syncing');
    btn.textContent = 'Sync';
  });
});
