# Cloud Functions — Agent Instructions

## Overview

All backend logic lives here. Node.js 22, Firebase Cloud Functions v2 with HTTP triggers. AI powered
by Vertex AI Gemini 2.0 Flash.

## Module Map

| File                        | Purpose                                                        | Key Details                                                                                                      |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `index.js`                  | HTTP endpoints, routing, CORS, response handling               | ~2400 lines. All 4 API endpoints defined here.                                                                   |
| `ai-prompt.js`              | Builds Vertex AI prompt from property data + context + history | Dynamic temperature: 0.3 (factual) to 0.7 (recommendations)                                                      |
| `rate-limiter.js`           | Two-tier rate limiting (in-memory + Firestore)                 | Per-endpoint limits. Brute force lockouts.                                                                       |
| `input-sanitizer.js`        | Prompt injection detection + input validation                  | 20+ injection patterns. 500-char limit. Control char removal.                                                    |
| `output-filter.js`          | AI response security filtering                                 | Blocks system prompt leaks. Prevents 3+ code disclosure. 2000-char max.                                          |
| `response-validator.js`     | Hallucination detection                                        | Compares AI-generated codes against actual property data in Firestore.                                           |
| `context-detector.js`       | Maps question keywords to property contexts                    | Contexts: kitchen, tv, thermostat, bathroom, pool, checkout, general. Min 0.3 confidence to override QR context. |
| `sensitive-data-handler.js` | Conditional access code inclusion                              | 45+ keywords trigger inclusion. Max 5 lookups/10min. Default: placeholder.                                       |
| `lib/metrics.js`            | Usage tracking                                                 | Daily counters per property. Function execution timers.                                                          |
| `lib/logger.js`             | Structured logging                                             | Redacts tokens, phone numbers, access codes.                                                                     |
| `lib/error-handler.js`      | Error response formatting                                      | Maps internal errors to safe client messages. Never exposes stack traces.                                        |

## Request Processing Pipeline (askGuestBot)

```
Request → Rate Limiter → Input Sanitizer → Context Detector
       → Sensitive Data Handler → AI Prompt Builder → Vertex AI
       → Output Filter → Response Validator → SSE Stream to Client
```

## Dependencies

```json
{
  "@google-cloud/vertexai": "^1.1.0", // Gemini 2.0 Flash
  "firebase-admin": "^13.6.1", // Firestore, Auth
  "firebase-functions": "^7.0.5", // HTTP triggers
  "ical.js": "^1.5.0" // iCal parsing for booking sync
}
```

## Conventions

- **One concern per file** — Don't add rate limiting logic to `index.js`, keep it in
  `rate-limiter.js`
- **Security is non-negotiable** — Every endpoint gets rate limiting. All input is sanitized. All AI
  output is filtered.
- **No secrets in logs** — Use `lib/logger.js` which redacts sensitive fields. Never `console.log`
  tokens, phone numbers, or access codes.
- **Consistent errors** — Use `lib/error-handler.js`. Never expose internal errors, stack traces, or
  Firestore paths to clients.
- **Identical verification errors** — All failures in `verifyGuest` must return the same error
  message to prevent enumeration.

## Guest Verification Flow

1. Guest sends `{ propertyId, phoneLast4 }` to `/api/verify`
2. Rate limiter checks IP limits (10/min) and brute force lockouts
3. Query `guestbot_bookings` for active bookings matching property + phone last 4
4. Check booking dates (must be within check-in to check-out)
5. On match: generate UUID session token, store in `guestbot_sessions` with 30min TTL
6. On failure: increment failure counter, same error message regardless of reason

## iCal Sync Flow

1. Owner sends `{ propertyId, platform, icalUrl }` with Firebase Auth token
2. Verify ownership of property
3. SSRF-validate the iCal URL (private IPs, metadata, DNS rebinding)
4. Fetch with 30s timeout, 5MB limit, max 3 redirects
5. Parse with ical.js
6. Deduplicate by UID against existing bookings
7. Upsert bookings in Firestore

## SSRF Protection (safeFetch)

When fetching external URLs (iCal sync), these are blocked:

- `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- `fc00::/7`, `fd00::/8`, `fe80::/10`, `::ffff:` mapped IPv6
- `169.254.169.254`, `metadata.google.internal`
- `.local`, `.internal` domains
- DNS rebinding: hostname resolved → IP validated before fetch

## Testing

Tests are in `tests/functions/`. Run from project root:

```bash
npm test                    # All tests with coverage
npm run test:watch          # Watch mode
```

Current test files:

- `ssrf-protection.test.js` — URL validation, IP blocking
- `rate-limit.test.js` — Rate limiting, brute force lockouts
- `ai-prompt.test.js` — Prompt building, temperature calculation
- `input-validation.test.js` — Prompt injection detection

When adding a new module, add a matching test file. Coverage threshold is 70% (65% for branches).

## Deploy

```bash
npm run deploy:functions    # From project root
```

Functions deploy to `us-central1` on project `guestbot-7029e`.
