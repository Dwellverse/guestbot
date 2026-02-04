/**
 * SSRF Protection Tests
 *
 * Tests for the URL validation that prevents Server-Side Request Forgery
 */

describe('SSRF Protection', () => {
  function isPrivateUrl(urlString) {
    try {
      const url = new URL(urlString);
      const hostname = url.hostname.toLowerCase();

      // Block localhost (including IPv6)
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]'
      ) {
        return true;
      }

      // Block private IP ranges
      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const [, a, b, c, d] = ipv4Match.map(Number);

        // 10.0.0.0/8
        if (a === 10) return true;

        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;

        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;

        // 169.254.0.0/16 (link-local)
        if (a === 169 && b === 254) return true;

        // 0.0.0.0
        if (a === 0 && b === 0 && c === 0 && d === 0) return true;
      }

      // Block internal hostnames
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return true;
      }

      // Only allow http/https
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  describe('isPrivateUrl', () => {
    describe('should block localhost', () => {
      it('blocks localhost', () => {
        expect(isPrivateUrl('http://localhost/calendar.ics')).toBe(true);
      });

      it('blocks 127.0.0.1', () => {
        expect(isPrivateUrl('http://127.0.0.1/calendar.ics')).toBe(true);
      });

      it('blocks ::1', () => {
        expect(isPrivateUrl('http://[::1]/calendar.ics')).toBe(true);
      });
    });

    describe('should block private IP ranges', () => {
      it('blocks 10.x.x.x', () => {
        expect(isPrivateUrl('http://10.0.0.1/calendar.ics')).toBe(true);
        expect(isPrivateUrl('http://10.255.255.255/calendar.ics')).toBe(true);
      });

      it('blocks 172.16-31.x.x', () => {
        expect(isPrivateUrl('http://172.16.0.1/calendar.ics')).toBe(true);
        expect(isPrivateUrl('http://172.31.255.255/calendar.ics')).toBe(true);
        expect(isPrivateUrl('http://172.15.0.1/calendar.ics')).toBe(false); // Not private
        expect(isPrivateUrl('http://172.32.0.1/calendar.ics')).toBe(false); // Not private
      });

      it('blocks 192.168.x.x', () => {
        expect(isPrivateUrl('http://192.168.0.1/calendar.ics')).toBe(true);
        expect(isPrivateUrl('http://192.168.255.255/calendar.ics')).toBe(true);
      });

      it('blocks link-local 169.254.x.x', () => {
        expect(isPrivateUrl('http://169.254.0.1/calendar.ics')).toBe(true);
      });

      it('blocks 0.0.0.0', () => {
        expect(isPrivateUrl('http://0.0.0.0/calendar.ics')).toBe(true);
      });
    });

    describe('should block internal hostnames', () => {
      it('blocks .local domains', () => {
        expect(isPrivateUrl('http://server.local/calendar.ics')).toBe(true);
      });

      it('blocks .internal domains', () => {
        expect(isPrivateUrl('http://api.internal/calendar.ics')).toBe(true);
      });
    });

    describe('should block non-http protocols', () => {
      it('blocks file://', () => {
        expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
      });

      it('blocks ftp://', () => {
        expect(isPrivateUrl('ftp://example.com/calendar.ics')).toBe(true);
      });

      it('blocks gopher://', () => {
        expect(isPrivateUrl('gopher://example.com/')).toBe(true);
      });
    });

    describe('should allow valid public URLs', () => {
      it('allows Airbnb calendar URLs', () => {
        expect(isPrivateUrl('https://www.airbnb.com/calendar/ical/123456.ics?s=abc123')).toBe(
          false
        );
      });

      it('allows VRBO calendar URLs', () => {
        expect(isPrivateUrl('https://www.vrbo.com/icalendar/abc123.ics')).toBe(false);
      });

      it('allows Booking.com calendar URLs', () => {
        expect(isPrivateUrl('https://admin.booking.com/hotel/hoteladmin/ical.html')).toBe(false);
      });

      it('allows public IP addresses', () => {
        expect(isPrivateUrl('https://8.8.8.8/calendar.ics')).toBe(false);
      });
    });

    describe('should handle invalid URLs', () => {
      it('blocks invalid URL format', () => {
        expect(isPrivateUrl('not-a-url')).toBe(true);
      });

      it('blocks empty string', () => {
        expect(isPrivateUrl('')).toBe(true);
      });
    });
  });
});
