'use strict';

/**
 * Firestore-backed Rate Limiter for GuestBot
 * Uses in-memory as fast first-pass, Firestore as authoritative store
 * Includes brute force protection for verifyGuest
 */

const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// In-memory rate limit store (fast first-pass)
const rateLimitStore = new Map();

const RATE_LIMITS = {
  askGuestBot: { windowMs: 60000, maxRequests: 20 },
  verifyGuest: { windowMs: 60000, maxRequests: 10 },
  syncIcal: { windowMs: 60000, maxRequests: 5 },
  submitFeedback: { windowMs: 60000, maxRequests: 20 },
  submitContact: { windowMs: 60000, maxRequests: 3 },
};

// Brute force protection settings
const BRUTE_FORCE = {
  maxFailedPerIP: 5,
  ipLockoutMs: 30 * 60 * 1000, // 30 minutes
  maxFailedPerProperty: 20,
  propertyLockoutMs: 60 * 60 * 1000, // 1 hour
};

/**
 * In-memory rate limit check (fast path)
 */
function checkRateLimit(endpoint, identifier) {
  cleanupRateLimitStore();
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();
  const limit = RATE_LIMITS[endpoint];

  if (!limit) {
    return { allowed: true, remaining: 999 };
  }

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

/**
 * Record a failed verification attempt in Firestore for brute force protection
 */
async function recordFailedAttempt(ip, propertyId) {
  try {
    const db = getFirestore();
    const docRef = db.collection('guestbot_rate_limits').doc(`verify:${ip}`);
    const propertyRef = db.collection('guestbot_rate_limits').doc(`verify_prop:${propertyId}`);

    const now = Timestamp.now();

    // Record IP failure
    await db.runTransaction(async (transaction) => {
      const ipDoc = await transaction.get(docRef);
      if (ipDoc.exists) {
        const data = ipDoc.data();
        const lockoutExpiry = data.lockoutUntil?.toDate?.() || new Date(0);

        if (new Date() < lockoutExpiry) {
          // Already locked out, just update count
          transaction.update(docRef, {
            failedAttempts: (data.failedAttempts || 0) + 1,
            lastAttempt: now,
          });
        } else {
          // Check if window expired
          const windowStart = data.windowStart?.toDate?.() || new Date(0);
          const windowAge = Date.now() - windowStart.getTime();

          if (windowAge > BRUTE_FORCE.ipLockoutMs) {
            // Reset window
            transaction.update(docRef, {
              failedAttempts: 1,
              windowStart: now,
              lastAttempt: now,
              lockoutUntil: null,
            });
          } else {
            const newCount = (data.failedAttempts || 0) + 1;
            const updates = {
              failedAttempts: newCount,
              lastAttempt: now,
            };

            // Lock out if threshold reached
            if (newCount >= BRUTE_FORCE.maxFailedPerIP) {
              updates.lockoutUntil = Timestamp.fromMillis(Date.now() + BRUTE_FORCE.ipLockoutMs);
            }

            transaction.update(docRef, updates);
          }
        }
      } else {
        transaction.set(docRef, {
          failedAttempts: 1,
          windowStart: now,
          lastAttempt: now,
          lockoutUntil: null,
          type: 'ip',
        });
      }
    });

    // Record property failure (separate transaction)
    await db.runTransaction(async (transaction) => {
      const propDoc = await transaction.get(propertyRef);
      if (propDoc.exists) {
        const data = propDoc.data();
        const windowStart = data.windowStart?.toDate?.() || new Date(0);
        const windowAge = Date.now() - windowStart.getTime();

        if (windowAge > BRUTE_FORCE.propertyLockoutMs) {
          transaction.update(propertyRef, {
            failedAttempts: 1,
            windowStart: now,
            lastAttempt: now,
            lockoutUntil: null,
          });
        } else {
          const newCount = (data.failedAttempts || 0) + 1;
          const updates = {
            failedAttempts: newCount,
            lastAttempt: now,
          };

          if (newCount >= BRUTE_FORCE.maxFailedPerProperty) {
            updates.lockoutUntil = Timestamp.fromMillis(Date.now() + BRUTE_FORCE.propertyLockoutMs);
          }

          transaction.update(propertyRef, updates);
        }
      } else {
        transaction.set(propertyRef, {
          failedAttempts: 1,
          windowStart: now,
          lastAttempt: now,
          lockoutUntil: null,
          type: 'property',
        });
      }
    });
  } catch (error) {
    // Don't let rate limiting errors break the main flow
    console.error('Rate limiter error:', error);
  }
}

/**
 * Check if IP or property is locked out from brute force protection
 * Returns identical error message regardless of reason (prevents enumeration)
 */
async function checkBruteForce(ip, propertyId) {
  try {
    const db = getFirestore();
    const now = new Date();

    // Check IP lockout
    const ipDoc = await db.collection('guestbot_rate_limits').doc(`verify:${ip}`).get();
    if (ipDoc.exists) {
      const data = ipDoc.data();
      const lockoutUntil = data.lockoutUntil?.toDate?.();
      if (lockoutUntil && now < lockoutUntil) {
        return { locked: true };
      }
    }

    // Check property lockout
    const propDoc = await db
      .collection('guestbot_rate_limits')
      .doc(`verify_prop:${propertyId}`)
      .get();
    if (propDoc.exists) {
      const data = propDoc.data();
      const lockoutUntil = data.lockoutUntil?.toDate?.();
      if (lockoutUntil && now < lockoutUntil) {
        return { locked: true };
      }
    }

    return { locked: false };
  } catch (error) {
    console.error('Brute force check error:', error);
    // Fail open - don't block legitimate users due to DB errors
    return { locked: false };
  }
}

// Clean up old in-memory entries (called inline, not via setInterval which is unreliable in Cloud Functions)
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > 300000) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Firestore-backed rate limit check (works across Cloud Function instances).
 * Use for critical endpoints where in-memory alone is insufficient.
 */
async function checkRateLimitFirestore(endpoint, identifier, customLimit) {
  const limit = customLimit || RATE_LIMITS[endpoint];
  if (!limit) return { allowed: true, remaining: 999 };

  try {
    const db = getFirestore();
    const key = `ratelimit:${endpoint}:${identifier}`.substring(0, 500);
    const docRef = db.collection('guestbot_rate_limits').doc(key);

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const now = Date.now();

      if (!doc.exists) {
        transaction.set(docRef, {
          count: 1,
          windowStart: Timestamp.fromMillis(now),
          type: 'rate_limit',
        });
        return { allowed: true, remaining: limit.maxRequests - 1 };
      }

      const data = doc.data();
      const windowStart = data.windowStart?.toMillis?.() || 0;

      if (now - windowStart > limit.windowMs) {
        transaction.update(docRef, {
          count: 1,
          windowStart: Timestamp.fromMillis(now),
        });
        return { allowed: true, remaining: limit.maxRequests - 1 };
      }

      if (data.count >= limit.maxRequests) {
        return { allowed: false, remaining: 0 };
      }

      transaction.update(docRef, { count: data.count + 1 });
      return { allowed: true, remaining: limit.maxRequests - (data.count + 1) };
    });

    return result;
  } catch (error) {
    console.error('Firestore rate limit error:', error);
    return { allowed: true, remaining: 1 }; // Fail open
  }
}

module.exports = {
  checkRateLimit,
  checkRateLimitFirestore,
  recordFailedAttempt,
  checkBruteForce,
  RATE_LIMITS,
  BRUTE_FORCE,
};
