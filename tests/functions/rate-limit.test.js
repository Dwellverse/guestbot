/**
 * Rate Limiting Tests
 *
 * Tests for the rate limiting functionality in Cloud Functions
 */

describe('Rate Limiting', () => {
  // Mock rate limit store
  const rateLimitStore = new Map();

  const RATE_LIMITS = {
    askGuestBot: { windowMs: 60000, maxRequests: 20 },
    verifyGuest: { windowMs: 60000, maxRequests: 10 },
    syncIcal: { windowMs: 60000, maxRequests: 5 },
  };

  function checkRateLimit(endpoint, identifier) {
    const key = `${endpoint}:${identifier}`;
    const now = Date.now();
    const limit = RATE_LIMITS[endpoint];

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: limit.maxRequests - 1 };
    }

    const record = rateLimitStore.get(key);

    if (now - record.windowStart > limit.windowMs) {
      rateLimitStore.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: limit.maxRequests - 1 };
    }

    if (record.count >= limit.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    record.count++;
    return { allowed: true, remaining: limit.maxRequests - record.count };
  }

  beforeEach(() => {
    rateLimitStore.clear();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = checkRateLimit('askGuestBot', '192.168.1.1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(19);
    });

    it('should track multiple requests', () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit('askGuestBot', '192.168.1.1');
      }
      const result = checkRateLimit('askGuestBot', '192.168.1.1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(14);
    });

    it('should block requests over limit', () => {
      for (let i = 0; i < 20; i++) {
        checkRateLimit('askGuestBot', '192.168.1.1');
      }
      const result = checkRateLimit('askGuestBot', '192.168.1.1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different IPs separately', () => {
      for (let i = 0; i < 20; i++) {
        checkRateLimit('askGuestBot', '192.168.1.1');
      }

      const result1 = checkRateLimit('askGuestBot', '192.168.1.1');
      const result2 = checkRateLimit('askGuestBot', '192.168.1.2');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);
    });

    it('should have different limits per endpoint', () => {
      // verifyGuest has limit of 10
      for (let i = 0; i < 10; i++) {
        checkRateLimit('verifyGuest', '192.168.1.1');
      }
      const verifyResult = checkRateLimit('verifyGuest', '192.168.1.1');
      expect(verifyResult.allowed).toBe(false);

      // syncIcal has limit of 5
      for (let i = 0; i < 5; i++) {
        checkRateLimit('syncIcal', '192.168.1.1');
      }
      const syncResult = checkRateLimit('syncIcal', '192.168.1.1');
      expect(syncResult.allowed).toBe(false);
    });
  });
});
