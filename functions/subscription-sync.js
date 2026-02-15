'use strict';

/**
 * Subscription Sync — Firestore Trigger
 *
 * Triggered when the Stripe extension writes/updates a subscription document
 * in `customers/{uid}/subscriptions/{id}`.
 *
 * Denormalizes subscription status to `guestbot_users/{uid}` so that:
 * 1. Firestore security rules can check subscription without subcollection reads
 * 2. Client-side code can read status from the user doc directly
 */

const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { checkSubscription } = require('./subscription');
const { defaultLogger: logger } = require('./lib/logger');

/**
 * Sync subscription status to the user document.
 * Called by the Firestore trigger in index.js.
 *
 * @param {string} uid - Firebase Auth user ID
 */
async function syncSubscriptionToUser(uid) {
  if (!uid) return;

  try {
    const db = getFirestore();
    const sub = await checkSubscription(uid);

    const update = {
      subscriptionStatus: sub.status || 'none',
      subscriptionActive: sub.active,
      subscriptionTrialEnd: sub.trialEnd ? Timestamp.fromDate(sub.trialEnd) : null,
      subscriptionCurrentPeriodEnd: sub.currentPeriodEnd
        ? Timestamp.fromDate(sub.currentPeriodEnd)
        : null,
      subscriptionCancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      subscriptionPriceId: sub.priceId || null,
      subscriptionUpdatedAt: Timestamp.now(),
    };

    await db.collection('guestbot_users').doc(uid).set(update, { merge: true });
  } catch (error) {
    logger.error('Subscription sync error', error);
  }
}

module.exports = { syncSubscriptionToUser };
