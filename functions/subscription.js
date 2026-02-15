'use strict';

/**
 * Subscription Validation Helper
 *
 * Server-side subscription status checker.
 * Queries the Stripe extension's `customers/{uid}/subscriptions` subcollection
 * and returns the active subscription status.
 */

const { getFirestore } = require('firebase-admin/firestore');
const { defaultLogger: logger } = require('./lib/logger');

const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * Check if a user has an active subscription.
 * Reads from the Stripe extension's `customers/{uid}/subscriptions` collection.
 *
 * @param {string} uid - Firebase Auth user ID
 * @returns {Promise<{active: boolean, status: string|null, trialEnd: Date|null, currentPeriodEnd: Date|null, cancelAtPeriodEnd: boolean, priceId: string|null}>}
 */
async function checkSubscription(uid) {
  const result = {
    active: false,
    status: null,
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    priceId: null,
  };

  if (!uid) return result;

  try {
    const db = getFirestore();
    const subsSnapshot = await db
      .collection('customers')
      .doc(uid)
      .collection('subscriptions')
      .where('status', 'in', ['active', 'trialing', 'past_due'])
      .get();

    if (subsSnapshot.empty) return result;

    // Find the best subscription (prefer active > trialing > past_due)
    let bestSub = null;
    for (const doc of subsSnapshot.docs) {
      const sub = doc.data();
      if (!bestSub) {
        bestSub = sub;
        continue;
      }
      // Prefer active over trialing, trialing over past_due
      const priority = { active: 3, trialing: 2, past_due: 1 };
      if ((priority[sub.status] || 0) > (priority[bestSub.status] || 0)) {
        bestSub = sub;
      }
    }

    if (!bestSub) return result;

    result.status = bestSub.status;
    result.active = ACTIVE_STATUSES.includes(bestSub.status);
    result.cancelAtPeriodEnd = bestSub.cancel_at_period_end || false;

    if (bestSub.trial_end) {
      result.trialEnd = bestSub.trial_end.toDate
        ? bestSub.trial_end.toDate()
        : new Date(bestSub.trial_end._seconds * 1000);
    }

    if (bestSub.current_period_end) {
      result.currentPeriodEnd = bestSub.current_period_end.toDate
        ? bestSub.current_period_end.toDate()
        : new Date(bestSub.current_period_end._seconds * 1000);
    }

    // Get price ID from the subscription items
    if (bestSub.items && bestSub.items.length > 0) {
      result.priceId = bestSub.items[0].price?.id || null;
    } else if (bestSub.price?.id) {
      result.priceId = bestSub.price.id;
    }

    return result;
  } catch (error) {
    logger.error('Subscription check error', error);
    return result;
  }
}

module.exports = { checkSubscription, ACTIVE_STATUSES };
