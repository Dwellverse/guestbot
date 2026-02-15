import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import {
  onSubscriptionChange,
  createCheckoutSession,
  getPortalUrl,
  getTrialDaysRemaining,
  getPriceId,
} from './subscription.js';

const app = initializeApp({
  apiKey: 'AIzaSyA0wGXqNLsW9IoimyvlQQg4GTSoZIy9Wkk',
  authDomain: 'guestbot.io',
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

// Firestore helpers bundle for passing to subscription module
const firestoreHelpers = { collection, query, where, getDocs, addDoc, onSnapshot, doc };

// State
let currentUser = null;
let properties = [];
let isSignUp = false;
let currentSubscription = {
  active: false,
  status: 'none',
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  priceId: null,
};
let unsubscribeSubscription = null;

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
    document.getElementById('userEmail').textContent = user.displayName || user.email;
    document.getElementById('userAvatar').textContent = (user.displayName ||
      user.email ||
      'U')[0].toUpperCase();
    authScreen.style.display = 'none';
    appEl.classList.add('active');

    // Start subscription listener
    if (unsubscribeSubscription) unsubscribeSubscription();
    unsubscribeSubscription = onSubscriptionChange(
      db,
      user.uid,
      (sub) => {
        currentSubscription = sub;
        updateSubscriptionUI(sub);
        updateFeatureGating(sub);
      },
      firestoreHelpers
    );

    // Load properties in background - UI is immediately usable
    loadProperties();

    // Handle URL params for checkout flow
    handleCheckoutReturn();
    handlePlanParam();
  } else {
    currentUser = null;
    currentSubscription = {
      active: false,
      status: 'none',
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      priceId: null,
    };
    if (unsubscribeSubscription) {
      unsubscribeSubscription();
      unsubscribeSubscription = null;
    }
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

// Forgot password
document.getElementById('forgotPasswordLink')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('emailInput').value;
  const authSuccess = document.getElementById('authSuccess');
  authError.classList.remove('show');
  authSuccess.classList.remove('show');

  if (!email) {
    authError.textContent = 'Please enter your email address first.';
    authError.classList.add('show');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    authSuccess.textContent = 'Password reset email sent! Check your inbox.';
    authSuccess.classList.add('show');
  } catch (err) {
    authError.textContent = err.message.replace('Firebase: ', '');
    authError.classList.add('show');
  }
});

// Google sign-in
const googleProvider = new GoogleAuthProvider();
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function createUserDocIfNew(user) {
  const userDoc = await getDoc(doc(db, 'guestbot_users', user.uid));
  if (!userDoc.exists()) {
    await setDoc(doc(db, 'guestbot_users', user.uid), {
      email: user.email,
      name: user.displayName || '',
      createdAt: Timestamp.now(),
    });
  }
}

// Handle redirect result (for mobile)
getRedirectResult(auth)
  .then((result) => {
    if (result?.user) createUserDocIfNew(result.user);
  })
  .catch(() => {});

document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
  authError.classList.remove('show');
  if (isMobile) {
    signInWithRedirect(auth, googleProvider);
  } else {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserDocIfNew(result.user);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        authError.textContent = err.message.replace('Firebase: ', '');
        authError.classList.add('show');
      }
    }
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

// Property search/filter
document.getElementById('propertySearch')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.property-card').forEach((card) => {
    const name = card.querySelector('.property-name')?.textContent.toLowerCase() || '';
    const address = card.querySelector('.property-address')?.textContent.toLowerCase() || '';
    card.style.display = name.includes(q) || address.includes(q) ? '' : 'none';
  });
});

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
      document.getElementById('propBedroomInfo').value = prop.bedroomInfo || '';
      document.getElementById('propParkingInfo').value = prop.parkingInfo || '';
      document.getElementById('propAmenitiesInfo').value = prop.amenitiesInfo || '';
      document.getElementById('propPetPolicy').value = prop.petPolicy || '';
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

    // Lazy-load analytics when tab is clicked
    if (tabName === 'analytics') {
      const propertyId = document.getElementById('propertyId').value;
      if (propertyId) loadAnalytics(propertyId);
    }
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
    bedroomInfo: document.getElementById('propBedroomInfo').value,
    parkingInfo: document.getElementById('propParkingInfo').value,
    amenitiesInfo: document.getElementById('propAmenitiesInfo').value,
    petPolicy: document.getElementById('propPetPolicy').value,
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
    showToast('Failed to save property');
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
    showToast('Failed to delete property');
  }
});

// Add property buttons
document
  .getElementById('addFirstPropertyBtn')
  ?.addEventListener('click', () => openPropertyModal(null));

// Generate QR codes
function generateQRCodes(propertyId) {
  const container = document.getElementById('qrCodes');
  const downloadAllBtn = document.getElementById('downloadAllQrBtn');
  const contexts = [
    { id: 'general', label: 'General' },
    { id: 'kitchen', label: 'Kitchen' },
    { id: 'tv', label: 'TV' },
    { id: 'thermostat', label: 'Thermostat' },
    { id: 'pool', label: 'Pool' },
    { id: 'checkout', label: 'Checkout' },
    { id: 'bedroom', label: 'Bedroom' },
    { id: 'parking', label: 'Parking' },
    { id: 'amenities', label: 'Amenities' },
    { id: 'policies', label: 'Policies' },
  ];

  container.innerHTML = contexts
    .map(
      (c) => `
                <div class="qr-item">
                    <canvas id="qr-${c.id}"></canvas>
                    <div class="qr-label">${c.label}</div>
                    <button type="button" class="qr-download-btn" data-qr="${c.id}" data-label="${c.label}">Download</button>
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

  // Individual download buttons
  container.querySelectorAll('.qr-download-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const canvas = document.getElementById(`qr-${btn.dataset.qr}`);
      const link = document.createElement('a');
      link.download = `guestbot-qr-${btn.dataset.label.toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  });

  // Show download all button
  if (downloadAllBtn) {
    downloadAllBtn.classList.remove('hidden');
    downloadAllBtn.onclick = async () => {
      if (typeof window.JSZip !== 'undefined') {
        const zip = new window.JSZip();
        contexts.forEach((c) => {
          const canvas = document.getElementById(`qr-${c.id}`);
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          zip.file(`guestbot-qr-${c.label.toLowerCase()}.png`, base64, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.download = 'guestbot-qr-codes.zip';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        contexts.forEach((c) => {
          const canvas = document.getElementById(`qr-${c.id}`);
          const link = document.createElement('a');
          link.download = `guestbot-qr-${c.label.toLowerCase()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        });
      }
    };
  }
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
                                <th>Source</th>
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
                                const source =
                                  b.platform || (b.source === 'ical' ? 'ical' : 'manual');
                                const sourceClass = ['airbnb', 'vrbo', 'booking'].includes(source)
                                  ? source
                                  : 'manual';
                                const sourceLabel = source === 'ical' ? 'iCal' : source;

                                return `
                                    <tr>
                                        <td>${escapeHtml(b.guestName || '-')}</td>
                                        <td>${escapeHtml(b.guestPhone || '-')}</td>
                                        <td>${checkIn.toLocaleDateString()}</td>
                                        <td>${checkOut.toLocaleDateString()}</td>
                                        <td><span class="booking-source ${sourceClass}">${escapeHtml(sourceLabel)}</span></td>
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

// ============================================
// Analytics
// ============================================
async function loadAnalytics(propertyId) {
  const q7d = document.getElementById('analyticsQuestions7d');
  const q30d = document.getElementById('analyticsQuestions30d');
  const fbRatio = document.getElementById('analyticsFeedbackRatio');
  const negCount = document.getElementById('analyticsNegativeCount');
  const topCtx = document.getElementById('analyticsTopContexts');
  const negFb = document.getElementById('analyticsNegativeFeedback');

  // Set loading state
  [q7d, q30d, fbRatio, negCount].forEach((el) => (el.textContent = '...'));

  try {
    // Date strings for last 7 and 30 days
    const now = new Date();
    const dates30 = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates30.push(d.toISOString().split('T')[0]);
    }
    const dates7 = dates30.slice(0, 7);

    // Query usage docs for this property (last 30 days)
    const usageQuery = query(
      collection(db, 'guestbot_usage'),
      where('propertyId', '==', propertyId)
    );
    const usageSnap = await getDocs(usageQuery);
    const usageDocs = usageSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Calculate totals
    let total7 = 0;
    let total30 = 0;
    const contextCounts = {};

    for (const doc of usageDocs) {
      const inLast30 = dates30.includes(doc.date);
      const inLast7 = dates7.includes(doc.date);

      if (!inLast30) continue;

      // Sum up all endpoint totals
      for (const [, val] of Object.entries(doc)) {
        if (val && typeof val === 'object' && val.total) {
          total30 += val.total;
          if (inLast7) total7 += val.total;
        }
      }

      // Count ask endpoint by context (stored in doc)
      if (doc.ask?.total) {
        const ctx = doc.context || 'general';
        contextCounts[ctx] = (contextCounts[ctx] || 0) + doc.ask.total;
      }
    }

    q7d.textContent = total7.toLocaleString();
    q30d.textContent = total30.toLocaleString();

    // Top contexts bar chart
    const ctxEntries = Object.entries(contextCounts).sort((a, b) => b[1] - a[1]);
    if (ctxEntries.length > 0) {
      const maxCount = ctxEntries[0][1];
      topCtx.innerHTML = ctxEntries
        .slice(0, 6)
        .map(
          ([ctx, count]) => `
        <div class="analytics-bar-row">
          <span class="analytics-bar-label">${escapeHtml(ctx)}</span>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill" style="width:${(count / maxCount) * 100}%"></div>
          </div>
          <span class="analytics-bar-count">${count}</span>
        </div>`
        )
        .join('');
    } else {
      topCtx.innerHTML = '<span class="analytics-empty">No data yet</span>';
    }

    // Feedback stats
    const fbQuery = query(
      collection(db, 'guestbot_feedback'),
      where('propertyId', '==', propertyId)
    );
    const fbSnap = await getDocs(fbQuery);
    const feedbacks = fbSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let posCount = 0;
    let negativeCount = 0;
    const recentNegative = [];

    for (const fb of feedbacks) {
      if (fb.rating === 'positive') posCount++;
      else if (fb.rating === 'negative') {
        negativeCount++;
        recentNegative.push(fb);
      }
    }

    const totalFb = posCount + negativeCount;
    fbRatio.textContent = totalFb > 0 ? Math.round((posCount / totalFb) * 100) + '%' : '—';
    negCount.textContent = negativeCount;

    // Recent negative feedback (last 5)
    if (recentNegative.length > 0) {
      recentNegative.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
        return bTime - aTime;
      });
      negFb.innerHTML = recentNegative
        .slice(0, 5)
        .map((fb) => {
          const date = fb.createdAt?.toDate?.() ? fb.createdAt.toDate().toLocaleDateString() : '';
          return `<div class="analytics-feedback-item">
            <div class="question">"${escapeHtml((fb.question || '').substring(0, 100))}"</div>
            ${date ? `<div class="date">${date}</div>` : ''}
          </div>`;
        })
        .join('');
    } else {
      negFb.innerHTML = '<span class="analytics-empty">No negative feedback</span>';
    }
  } catch (err) {
    console.error('Analytics load error:', err);
    [q7d, q30d, fbRatio, negCount].forEach((el) => (el.textContent = '—'));
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
    showToast('Save property first');
    btn.disabled = false;
    btn.textContent = 'Add Booking';
    return;
  }

  const checkInDate = new Date(document.getElementById('bookingCheckIn').value);
  const checkOutDate = new Date(document.getElementById('bookingCheckOut').value);
  if (checkOutDate <= checkInDate) {
    showToast('Check-out date must be after check-in date');
    btn.disabled = false;
    btn.textContent = 'Add Booking';
    return;
  }

  const data = {
    propertyId,
    guestName: document.getElementById('bookingGuestName').value,
    guestPhone: document.getElementById('bookingGuestPhone').value.replace(/\D/g, ''),
    checkIn: checkInDate,
    checkOut: checkOutDate,
    createdAt: Timestamp.now(),
  };

  try {
    await addDoc(collection(db, 'guestbot_bookings'), data);
    bookingModal.classList.remove('active');
    loadBookings(propertyId);
  } catch (err) {
    console.error(err);
    showToast('Failed to save booking');
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

// ============================================
// Subscription UI
// ============================================
function updateSubscriptionUI(sub) {
  const banner = document.getElementById('subscriptionBanner');
  const bannerText = document.getElementById('subscriptionBannerText');
  const bannerAction = document.getElementById('subscriptionBannerAction');
  const badge = document.getElementById('headerPlanBadge');
  const billingBtn = document.getElementById('manageBillingBtn');

  if (!banner || !bannerText || !badge) return;

  // Show manage billing button when user has any subscription history
  if (billingBtn) {
    billingBtn.style.display = sub.status !== 'none' ? '' : 'none';
  }

  // Reset
  banner.className = 'subscription-banner';

  if (sub.status === 'trialing') {
    const daysLeft = getTrialDaysRemaining(sub.trialEnd);
    banner.classList.add('visible', daysLeft <= 3 ? 'warning' : 'trial');
    bannerText.textContent = `Free trial — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
    bannerAction.textContent = 'Subscribe Now';
    bannerAction.onclick = () => startCheckout('monthly');
    badge.textContent = 'Trial';
    badge.className = 'header-plan-badge trial';
  } else if (sub.status === 'active' && !sub.cancelAtPeriodEnd) {
    banner.classList.remove('visible');
    badge.textContent = 'Pro';
    badge.className = 'header-plan-badge pro';
  } else if (sub.status === 'active' && sub.cancelAtPeriodEnd) {
    const endDate = sub.currentPeriodEnd ? sub.currentPeriodEnd.toLocaleDateString() : 'soon';
    banner.classList.add('visible', 'warning');
    bannerText.textContent = `Subscription cancels on ${endDate}`;
    bannerAction.textContent = 'Resubscribe';
    bannerAction.onclick = () => openBillingPortal();
    badge.textContent = 'Pro';
    badge.className = 'header-plan-badge pro';
  } else {
    // No subscription or expired
    banner.classList.add('visible', 'expired');
    bannerText.textContent = 'Subscribe to manage properties and enable guest chat';
    bannerAction.textContent = 'Start Free Trial';
    bannerAction.onclick = () => startCheckout('monthly');
    badge.textContent = 'Free';
    badge.className = 'header-plan-badge free';
  }
}

function updateFeatureGating(sub) {
  const locked = !sub.active;
  const gatedElements = [
    document.getElementById('addFirstPropertyBtn'),
    document.getElementById('savePropertyBtn'),
    document.getElementById('addBookingBtn'),
  ];

  gatedElements.forEach((el) => {
    if (!el) return;
    if (locked) {
      el.dataset.originalTitle = el.textContent;
      el.disabled = true;
      el.title = 'Active subscription required';
    } else {
      el.disabled = false;
      el.title = '';
    }
  });

  // Disable add property card click when locked
  const addCards = document.querySelectorAll('.add-property-card');
  addCards.forEach((card) => {
    card.style.pointerEvents = locked ? 'none' : '';
    card.style.opacity = locked ? '0.5' : '';
  });

  // Disable sync buttons when locked
  document.querySelectorAll('.sync-btn').forEach((btn) => {
    btn.disabled = locked;
  });
}

async function startCheckout(plan) {
  try {
    const priceId = await getPriceId(db, plan, firestoreHelpers);
    const url = await createCheckoutSession(db, currentUser.uid, priceId, firestoreHelpers);
    window.location.href = url;
  } catch (err) {
    console.error('Checkout error:', err);
    showToast(err.message || 'Failed to start checkout. Please try again.');
  }
}

function openBillingPortal() {
  window.open(getPortalUrl(), '_blank');
}

function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  if (checkout === 'success') {
    showToast('Subscription activated! Welcome to GuestBot Pro.');
    // Clean URL
    window.history.replaceState({}, '', '/app');
  } else if (checkout === 'cancel') {
    window.history.replaceState({}, '', '/app');
  }
}

function handlePlanParam() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get('plan');
  if (plan === 'monthly' || plan === 'annual') {
    window.history.replaceState({}, '', '/app');
    // Small delay to let auth and subscription state settle
    setTimeout(() => {
      if (!currentSubscription.active) {
        startCheckout(plan);
      }
    }, 1500);
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// Account Settings
// ============================================
const settingsModal = document.getElementById('settingsModal');

document.getElementById('settingsBtn')?.addEventListener('click', () => {
  document.getElementById('settingsName').value = currentUser?.displayName || '';
  document.getElementById('settingsEmail').value = currentUser?.email || '';
  document.getElementById('settingsSuccess').textContent = '';
  settingsModal.classList.add('active');
});

document.getElementById('settingsModalClose')?.addEventListener('click', () => {
  settingsModal.classList.remove('active');
});

settingsModal?.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('active');
});

document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('saveSettingsBtn');
  const name = document.getElementById('settingsName').value.trim();
  const successEl = document.getElementById('settingsSuccess');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  successEl.textContent = '';

  try {
    await updateProfile(auth.currentUser, { displayName: name });
    // Also update Firestore user doc
    await setDoc(doc(db, 'guestbot_users', currentUser.uid), { name }, { merge: true });
    // Update header display
    document.getElementById('userEmail').textContent = name || currentUser.email;
    document.getElementById('userAvatar').textContent = (name ||
      currentUser.email ||
      'U')[0].toUpperCase();
    successEl.textContent = 'Settings saved!';
  } catch (err) {
    successEl.textContent = 'Failed to save: ' + err.message;
    successEl.style.color = 'var(--red)';
  }

  btn.disabled = false;
  btn.textContent = 'Save Changes';
});

document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
  const confirmed = confirm(
    'Are you sure you want to delete your account?\n\nThis will permanently remove:\n- All your properties\n- All bookings\n- All account data\n\nThis action cannot be undone.'
  );
  if (!confirmed) return;

  const doubleConfirm = confirm('This is your final warning. Delete account permanently?');
  if (!doubleConfirm) return;

  try {
    // Delete user's properties and bookings from Firestore
    const propsQuery = query(
      collection(db, 'guestbot_properties'),
      where('ownerId', '==', currentUser.uid)
    );
    const propsSnapshot = await getDocs(propsQuery);
    for (const propDoc of propsSnapshot.docs) {
      // Delete bookings for this property
      const bookingsQuery = query(
        collection(db, 'guestbot_bookings'),
        where('propertyId', '==', propDoc.id)
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);
      for (const bookingDoc of bookingsSnapshot.docs) {
        await deleteDoc(bookingDoc.ref);
      }
      await deleteDoc(propDoc.ref);
    }

    // Delete user doc
    await deleteDoc(doc(db, 'guestbot_users', currentUser.uid));

    // Delete Firebase Auth account
    await deleteUser(auth.currentUser);

    showToast('Account deleted successfully.');
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      showToast('For security, please sign out and sign back in, then try again.');
    } else {
      showToast('Failed to delete account: ' + err.message);
    }
  }
});

// Modal accessibility: Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (propertyModal.classList.contains('active')) {
      closePropertyModal();
    } else if (bookingModal.classList.contains('active')) {
      bookingModal.classList.remove('active');
    } else if (settingsModal?.classList.contains('active')) {
      settingsModal.classList.remove('active');
    }
  }
});

// Focus trap for modals
document.querySelectorAll('.modal-overlay').forEach((modal) => {
  new MutationObserver(() => {
    if (modal.classList.contains('active')) {
      const focusable = modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) focusable[0].focus();

      modal._trapHandler = (e) => {
        if (e.key !== 'Tab') return;
        const els = modal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      modal.addEventListener('keydown', modal._trapHandler);
    } else if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
      delete modal._trapHandler;
    }
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });
});

// Manage Billing button
document.getElementById('manageBillingBtn')?.addEventListener('click', openBillingPortal);

// Subscribe button in banner
document.getElementById('subscriptionBannerAction')?.addEventListener('click', () => {
  if (!currentSubscription.active) {
    startCheckout('monthly');
  }
});
