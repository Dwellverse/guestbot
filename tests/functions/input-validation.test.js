/**
 * Input Validation Tests
 *
 * Tests for input validation in Cloud Functions
 */

describe('Input Validation', () => {
  describe('Phone Number Validation', () => {
    const phoneRegex = /^\d{4}$/;

    it('should accept valid 4-digit phone last four', () => {
      expect(phoneRegex.test('1234')).toBe(true);
      expect(phoneRegex.test('0000')).toBe(true);
      expect(phoneRegex.test('9999')).toBe(true);
    });

    it('should reject less than 4 digits', () => {
      expect(phoneRegex.test('123')).toBe(false);
      expect(phoneRegex.test('1')).toBe(false);
      expect(phoneRegex.test('')).toBe(false);
    });

    it('should reject more than 4 digits', () => {
      expect(phoneRegex.test('12345')).toBe(false);
      expect(phoneRegex.test('123456789')).toBe(false);
    });

    it('should reject non-numeric characters', () => {
      expect(phoneRegex.test('abcd')).toBe(false);
      expect(phoneRegex.test('12ab')).toBe(false);
      expect(phoneRegex.test('12-4')).toBe(false);
      expect(phoneRegex.test('12 4')).toBe(false);
    });
  });

  describe('Question Length Validation', () => {
    const MAX_QUESTION_LENGTH = 500;

    function isValidQuestion(question) {
      return (
        typeof question === 'string' &&
        question.length > 0 &&
        question.length <= MAX_QUESTION_LENGTH
      );
    }

    it('should accept valid questions', () => {
      expect(isValidQuestion('What is the WiFi password?')).toBe(true);
      expect(isValidQuestion('a')).toBe(true);
      expect(isValidQuestion('a'.repeat(500))).toBe(true);
    });

    it('should reject empty questions', () => {
      expect(isValidQuestion('')).toBe(false);
    });

    it('should reject questions over 500 characters', () => {
      expect(isValidQuestion('a'.repeat(501))).toBe(false);
      expect(isValidQuestion('a'.repeat(1000))).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidQuestion(null)).toBe(false);
      expect(isValidQuestion(undefined)).toBe(false);
      expect(isValidQuestion(123)).toBe(false);
      expect(isValidQuestion({ text: 'hello' })).toBe(false);
    });
  });

  describe('Property ID Validation', () => {
    function isValidPropertyId(propertyId) {
      return typeof propertyId === 'string' && propertyId.length > 0;
    }

    it('should accept valid property IDs', () => {
      expect(isValidPropertyId('abc123')).toBe(true);
      expect(isValidPropertyId('property-id-123')).toBe(true);
      expect(isValidPropertyId('a')).toBe(true);
    });

    it('should reject empty property IDs', () => {
      expect(isValidPropertyId('')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidPropertyId(null)).toBe(false);
      expect(isValidPropertyId(undefined)).toBe(false);
      expect(isValidPropertyId(123)).toBe(false);
    });
  });

  describe('Context Validation', () => {
    const validContexts = [
      'kitchen',
      'tv',
      'thermostat',
      'bathroom',
      'pool',
      'checkout',
      'general',
    ];

    function getValidContext(context) {
      return validContexts.includes(context) ? context : 'general';
    }

    it('should accept valid contexts', () => {
      validContexts.forEach((ctx) => {
        expect(getValidContext(ctx)).toBe(ctx);
      });
    });

    it('should default to general for invalid contexts', () => {
      expect(getValidContext('invalid')).toBe('general');
      expect(getValidContext('')).toBe('general');
      expect(getValidContext(null)).toBe('general');
      expect(getValidContext(undefined)).toBe('general');
    });
  });
});
