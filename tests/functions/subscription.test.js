/**
 * Subscription Validation Tests
 *
 * Tests for subscription-related utility logic.
 * Tests pure functions without requiring Firestore.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { ACTIVE_STATUSES } = require('../../functions/subscription');

describe('Subscription Validation', () => {
  describe('ACTIVE_STATUSES', () => {
    it('includes active and trialing', () => {
      expect(ACTIVE_STATUSES).toContain('active');
      expect(ACTIVE_STATUSES).toContain('trialing');
    });

    it('does not include past_due', () => {
      expect(ACTIVE_STATUSES).not.toContain('past_due');
    });

    it('does not include canceled', () => {
      expect(ACTIVE_STATUSES).not.toContain('canceled');
    });

    it('does not include unpaid', () => {
      expect(ACTIVE_STATUSES).not.toContain('unpaid');
    });

    it('has exactly 2 statuses', () => {
      expect(ACTIVE_STATUSES).toHaveLength(2);
    });
  });

  describe('checkSubscription export', () => {
    it('is a function', () => {
      const { checkSubscription } = require('../../functions/subscription');
      expect(typeof checkSubscription).toBe('function');
    });
  });
});

describe('Subscription Sync', () => {
  describe('syncSubscriptionToUser export', () => {
    it('is a function', () => {
      const { syncSubscriptionToUser } = require('../../functions/subscription-sync');
      expect(typeof syncSubscriptionToUser).toBe('function');
    });
  });
});

describe('Rate Limiter — Endpoints', () => {
  const { RATE_LIMITS } = require('../../functions/rate-limiter');

  it('has all expected endpoints configured', () => {
    expect(RATE_LIMITS.askGuestBot).toBeDefined();
    expect(RATE_LIMITS.verifyGuest).toBeDefined();
    expect(RATE_LIMITS.syncIcal).toBeDefined();
    expect(RATE_LIMITS.submitFeedback).toBeDefined();
  });
});
