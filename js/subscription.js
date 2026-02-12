/**
 * Client-side Subscription Module
 *
 * Handles checkout sessions, portal sessions, subscription state,
 * and real-time subscription status listeners.
 */

/**
 * Get the user's active subscription from Firestore (Stripe extension collection).
 * @param {object} db - Firestore instance
 * @param {string} uid - Firebase Auth user ID
 * @param {object} firestore - Firestore module with query helpers
 * @returns {Promise<{active: boolean, status: string, trialEnd: Date|null, currentPeriodEnd: Date|null, cancelAtPeriodEnd: boolean, priceId: string|null}>}
 */
export async function getSubscription(db, uid, firestore) {
  const { collection, query, where, getDocs } = firestore;
  const result = {
    active: false,
    status: 'none',
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    priceId: null,
  };

  try {
    const subsRef = collection(db, 'customers', uid, 'subscriptions');
    const q = query(subsRef, where('status', 'in', ['active', 'trialing']));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return result;

    // Pick the best subscription
    let bestSub = null;
    snapshot.forEach((doc) => {
      const sub = doc.data();
      if (!bestSub || (sub.status === 'active' && bestSub.status !== 'active')) {
        bestSub = sub;
      }
    });

    if (!bestSub) return result;

    result.active = true;
    result.status = bestSub.status;
    result.cancelAtPeriodEnd = bestSub.cancel_at_period_end || false;

    if (bestSub.trial_end) {
      result.trialEnd = bestSub.trial_end.toDate
        ? bestSub.trial_end.toDate()
        : new Date(bestSub.trial_end.seconds * 1000);
    }

    if (bestSub.current_period_end) {
      result.currentPeriodEnd = bestSub.current_period_end.toDate
        ? bestSub.current_period_end.toDate()
        : new Date(bestSub.current_period_end.seconds * 1000);
    }

    if (bestSub.items && bestSub.items.length > 0) {
      result.priceId = bestSub.items[0].price?.id || null;
    }

    return result;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return result;
  }
}

/**
 * Listen to subscription changes in real-time.
 * @param {object} db - Firestore instance
 * @param {string} uid - Firebase Auth user ID
 * @param {function} callback - Called with subscription data on each change
 * @param {object} firestore - Firestore module with onSnapshot
 * @returns {function} Unsubscribe function
 */
export function onSubscriptionChange(db, uid, callback, firestore) {
  const { collection, query, where, onSnapshot } = firestore;
  const subsRef = collection(db, 'customers', uid, 'subscriptions');
  const q = query(subsRef, where('status', 'in', ['active', 'trialing', 'past_due', 'canceled']));

  return onSnapshot(q, (snapshot) => {
    let bestSub = null;
    const priority = { active: 4, trialing: 3, past_due: 2, canceled: 1 };

    snapshot.forEach((doc) => {
      const sub = doc.data();
      if (!bestSub || (priority[sub.status] || 0) > (priority[bestSub.status] || 0)) {
        bestSub = sub;
      }
    });

    if (!bestSub) {
      callback({
        active: false,
        status: 'none',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        priceId: null,
      });
      return;
    }

    callback({
      active: ['active', 'trialing'].includes(bestSub.status),
      status: bestSub.status,
      cancelAtPeriodEnd: bestSub.cancel_at_period_end || false,
      trialEnd: bestSub.trial_end?.toDate ? bestSub.trial_end.toDate() : null,
      currentPeriodEnd: bestSub.current_period_end?.toDate
        ? bestSub.current_period_end.toDate()
        : null,
      priceId: bestSub.items?.[0]?.price?.id || null,
    });
  });
}

/**
 * Create a Stripe Checkout Session by writing to the extension's collection.
 * The extension creates the session and writes back the URL.
 * @param {object} db - Firestore instance
 * @param {string} uid - Firebase Auth user ID
 * @param {string} priceId - Stripe Price ID
 * @param {object} firestore - Firestore module
 * @returns {Promise<string>} Checkout session URL
 */
export function createCheckoutSession(db, uid, priceId, firestore) {
  const { collection, addDoc, onSnapshot } = firestore;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Checkout session timed out')), 30000);

    const sessionData = {
      price: priceId,
      success_url: `${window.location.origin}/app?checkout=success`,
      cancel_url: `${window.location.origin}/app?checkout=cancel`,
      allow_promotion_codes: true,
      trial_settings: {
        end_behavior: { missing_payment_method: 'cancel' },
      },
      payment_method_collection: 'if_required',
    };

    addDoc(collection(db, 'customers', uid, 'checkout_sessions'), sessionData)
      .then((docRef) => {
        const unsubscribe = onSnapshot(docRef, (snap) => {
          const data = snap.data();
          if (data?.error) {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error(data.error.message || 'Checkout failed'));
          }
          if (data?.url) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(data.url);
          }
        });
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Get the Stripe Customer Portal URL (static link).
 * @returns {string} Portal URL
 */
export function getPortalUrl() {
  return 'https://billing.stripe.com/p/login/fZueVe5rGdrf4W198EfQI00';
}

/**
 * Get the number of trial days remaining.
 * @param {Date|null} trialEnd
 * @returns {number}
 */
export function getTrialDaysRemaining(trialEnd) {
  if (!trialEnd) return 0;
  const now = new Date();
  const diff = trialEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// Stripe Price IDs
const PRICE_IDS = {
  monthly: 'price_1T0796J3hrfTsAPk4WYZrxYD',
  annual: 'price_1T078PJ3hrfTsAPkiNBdy0G5',
};

/**
 * Get the Stripe Price ID for a given plan.
 * @param {object} _db - Unused (kept for API compatibility)
 * @param {string} plan - 'monthly' or 'annual'
 * @returns {string} Price ID
 */
export function getPriceId(_db, plan) {
  const priceId = PRICE_IDS[plan];
  if (!priceId) throw new Error(`Unknown plan: ${plan}`);
  return priceId;
}
