# GuestBot — Agent Instructions

## Project Overview

GuestBot is an AI-powered guest concierge for vacation rentals. Hosts place context-aware QR codes
around their property (kitchen, TV, thermostat, bathroom, pool, checkout). Guests scan a code and
chat with an AI that knows the property — Wi-Fi passwords, appliance instructions, local
recommendations, checkout procedures.

## Tech Stack

- **Frontend**: Vanilla JS (ES Modules), Vite 5, no framework
- **Backend**: Node.js 22, Firebase Cloud Functions v2 (HTTP triggers)
- **AI**: Google Vertex AI — Gemini 2.0 Flash (`us-central1`)
- **Database**: Cloud Firestore
- **Auth**: Firebase Authentication (owners), session tokens (guests)
- **Hosting**: Firebase Hosting
- **CI/CD**: GitHub Actions
- **Payments**: Stripe via Firebase "Run Payments with Stripe" extension
- **Testing**: Jest with 70% coverage threshold
- **Linting**: ESLint + Prettier, enforced via Husky pre-commit hooks
- **Firebase Project**: `guestbot-7029e`

## Key Commands

```bash
npm run dev              # Vite dev server
npm run build            # Production build
npm test                 # Jest with coverage
npm run test:watch       # Jest watch mode
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format all files
npm run validate         # lint + test (use before commits)
npm run emulators        # Firebase emulators (full local stack)
npm run deploy           # Build + deploy hosting
npm run deploy:all       # Build + deploy everything
npm run deploy:functions # Deploy Cloud Functions only
npm run deploy:rules     # Deploy Firestore rules only
```

## Project Structure

```
index.html              → Marketing landing page
app.html                → Property owner dashboard
chat.html               → Guest chat interface
terms.html / privacy.html → Legal pages

js/                     → ES module source files (bundled by Vite)
  app.js                → Dashboard SPA (Firebase Auth, property CRUD, booking management, subscription UI)
  chat.js               → Guest chat (phone verification, AI interaction, SSE streaming)
  index.js              → Landing page (analytics, ROI calc, FAQ, pricing)
  i18n.js               → Internationalization system
  subscription.js       → Client-side Stripe subscription module (checkout, portal, status)

public/js/              → Non-module scripts (copied as-is to dist)
  cookie-consent.js     → GDPR cookie banner
  feature-bot.js        → Landing page bot demo
public/locales/*.json   → 8 language files (en, es, fr, de, pt, it, ja, zh)

functions/              → See functions/CLAUDE.md for backend details
tests/                  → Jest test suites
.github/workflows/      → CI, staging deploy, production deploy
```

## Code Conventions

- Semicolons: always
- Quotes: single
- Indentation: 2 spaces
- Trailing commas: ES5
- Line width: 100 chars (120 for HTML)
- All user-facing strings MUST use the i18n system (`data-i18n` attributes +
  `public/locales/*.json`)
- When adding new i18n strings, update ALL 8 locale files
- HTML escape all user/AI content before DOM insertion (XSS prevention)
- No framework dependencies on the frontend — keep it vanilla JS

## Branching

- `master` → production (auto-deploys)
- `develop` → staging (auto-deploys to Firebase preview channel)
- `feature/*` and `fix/*` → merge into `develop` via PR

## Firestore Collections

- `guestbot_users` — User profiles (owner read/write own)
- `guestbot_properties` — Property data, amenities, access codes (owner CRUD)
- `guestbot_bookings` — Guest bookings (owner via property ownership)
- `guestbot_sessions` — Guest session tokens (server only)
- `guestbot_rate_limits` — Rate limit counters + lockouts (server only)
- `guestbot_feedback` — Guest feedback (server write, owner read)
- `guestbot_metrics` — Daily API usage per property (server only)
- `products` — Stripe products/prices (public read, extension-managed)
- `customers` — Stripe customers/subscriptions/checkout sessions (user read own, extension-managed)

## API Endpoints

| Endpoint                     | Method | Auth          | Rate Limit         | Purpose                   |
| ---------------------------- | ------ | ------------- | ------------------ | ------------------------- |
| `/api/verify`                | POST   | None          | 10/min/IP          | Guest phone verification  |
| `/api/ask`                   | POST   | Session token | 20/min/IP:property | AI chat question          |
| `/api/sync-ical`             | POST   | Firebase Auth | 5/min/IP           | Booking import from iCal  |
| `/api/feedback`              | POST   | None          | 20/min/IP          | Guest feedback submission |
| `/api/create-portal-session` | POST   | Firebase Auth | 5/min/IP           | Stripe billing portal     |

## Security — Do NOT Weaken

These security controls are critical. Never bypass, disable, or weaken them:

- **Rate limiting** — Per-endpoint limits + brute force lockouts (IP: 30min/5 failures, property:
  1hr/20 failures)
- **Input sanitization** — Prompt injection detection (20+ patterns), 500-char limit, control char
  removal
- **Output filtering** — System prompt leak detection, bulk code disclosure prevention (3+ codes
  blocked), 2000-char truncation
- **Hallucination validation** — AI-generated codes checked against actual property data
- **SSRF protection** — Private IPs, cloud metadata, .local/.internal domains blocked; DNS rebinding
  check; 3 redirect max
- **Sensitive data** — Access codes only included in AI prompt when question is relevant (45+
  keyword match); rate-limited to 5 lookups/10min
- **Session tokens** — 30-minute expiry, server-validated, stored in sessionStorage
- **Identical error messages** on verification failure (prevents enumeration)
- **CORS** — Restricted to `guestbot.io` and `*.web.app`
- **Security headers** — CSP, HSTS, X-Frame-Options: DENY, nosniff, strict referrer

## Deployment

- Automated via GitHub Actions on push to `master` (production) or `develop` (staging)
- Production deploy: builds frontend, deploys hosting + functions + Firestore rules
- Staging deploy: builds frontend, deploys to Firebase preview channel + functions
- Manual deploy: `npm run deploy:all`
- Version tags (`v*`) trigger GitHub Release creation
- Required GitHub secrets: `FIREBASE_SERVICE_ACCOUNT`, `CODECOV_TOKEN`
- Rollback hosting via Firebase Console > Release History
