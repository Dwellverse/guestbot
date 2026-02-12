/**
 * GuestBot Feature Chatbot
 * Interactive bot to explain features to visitors
 */

(function () {
  'use strict';

  const BOT_NAME = 'GuestBot Assistant';

  // Knowledge base for the bot
  const responses = {
    greeting: {
      message:
        "Hi! I'm the GuestBot assistant. I can help you learn about how GuestBot works. What would you like to know?",
      suggestions: ['What is GuestBot?', 'How does it work?', 'Pricing', 'Key features'],
    },
    'what is guestbot': {
      message:
        "GuestBot is an AI-powered concierge for vacation rentals. You place QR codes around your property, and guests scan them to chat with an AI that knows everything about your place — WiFi, house rules, local recommendations, and more. It's like having a 24/7 concierge without the cost!",
      suggestions: ['How does it work?', 'What can guests ask?', 'Pricing'],
    },
    'how does it work': {
      message:
        "It's super simple:\n\n1. **Add your property** — Enter details like WiFi, check-in instructions, house rules\n2. **Print QR codes** — Place them around your property (kitchen, TV, entrance)\n3. **Guests scan & chat** — They get instant AI answers, no app needed!\n\nSetup takes about 5 minutes.",
      suggestions: ['What are QR codes for?', 'Show me features', 'Start free trial'],
    },
    pricing: {
      message:
        'GuestBot is just **$4.99/month** for everything:\n\n- Unlimited properties\n- Unlimited QR codes\n- AI-powered chat\n- iCal sync (Airbnb, VRBO)\n- Local recommendations\n- Guest verification\n\nStart with a free trial, no credit card required!',
      suggestions: ['Start free trial', "What's included?", 'How does it work?'],
    },
    features: {
      message:
        "Here's what makes GuestBot special:\n\n**AI Chat** — Guests get instant, accurate answers 24/7\n**Smart QR Codes** — Context-aware (kitchen QR knows about appliances)\n**Calendar Sync** — Auto-import bookings from Airbnb/VRBO\n**Local Tips** — AI recommends restaurants, activities nearby\n**Guest Verification** — Only verified guests access property info",
      suggestions: ['Tell me about QR codes', 'How does AI work?', 'Pricing'],
    },
    'qr codes': {
      message:
        'Our QR codes are **context-aware**! Place different codes in different spots:\n\n- **Kitchen** — Coffee machine, appliances, trash info\n- **TV area** — Streaming logins, remote instructions\n- **Entrance** — WiFi, door codes, house rules\n- **Pool/Patio** — Pool hours, safety rules\n\nWhen guests scan, the AI knows exactly what they need help with!',
      suggestions: ['How does AI work?', 'Show me features', 'Pricing'],
    },
    ai: {
      message:
        'GuestBot uses advanced AI (Google\'s Gemini) to understand natural language. Guests can ask questions like:\n\n- "What\'s the WiFi password?"\n- "How do I work the coffee machine?"\n- "Any good Italian restaurants nearby?"\n- "What time is checkout?"\n\nThe AI gives friendly, accurate responses based on your property info!',
      suggestions: ['What can guests ask?', 'Is it accurate?', 'Features'],
    },
    'guests ask': {
      message:
        'Guests can ask anything about your property:\n\n**Property Info** — WiFi, door codes, parking, checkout time\n**How-To** — TV, thermostat, appliances, pool\n**Local Area** — Restaurants, beaches, activities, grocery stores\n**Rules** — Quiet hours, pet policy, smoking, trash\n\nThe more info you add, the smarter GuestBot gets!',
      suggestions: ['Is it accurate?', 'How does AI work?', 'Start free trial'],
    },
    accurate: {
      message:
        "GuestBot only answers based on the information you provide — it won't make things up! For local recommendations, it uses its knowledge of your area to suggest popular spots.\n\nYou can always update your property info, and GuestBot instantly gets smarter.",
      suggestions: ['How do I add info?', 'Features', 'Pricing'],
    },
    calendar: {
      message:
        'GuestBot syncs with your booking calendars automatically!\n\n**Supported platforms:**\n- Airbnb\n- VRBO\n- Booking.com\n- Any iCal feed\n\nJust paste your iCal URL and bookings import automatically. Guest names and dates stay up to date!',
      suggestions: ['How does verification work?', 'Features', 'Pricing'],
    },
    verification: {
      message:
        'Guest verification keeps your property info secure:\n\n1. Guest scans QR code\n2. Enters last 4 digits of their phone number\n3. GuestBot checks against your bookings\n4. Verified guests get full access!\n\nOnly people with active reservations can see sensitive info like door codes.',
      suggestions: ['Is my data secure?', 'Features', 'Pricing'],
    },
    security: {
      message:
        'Security is a top priority:\n\n- **Encrypted data** — TLS 1.3 in transit, AES-256 at rest\n- **Guest verification** — Only active guests access property info\n- **No data selling** — We never sell your data\n- **GDPR compliant** — Full data protection compliance\n- **Auto-deletion** — Guest chat data deleted after checkout',
      suggestions: ['Privacy policy', 'Features', 'Pricing'],
    },
    trial: {
      message:
        "Ready to try GuestBot? Here's how to start:\n\n1. Click **'Start Free Trial'**\n2. Create your account (Google sign-in available)\n3. Add your first property\n4. Print QR codes and you're live!\n\nNo credit card required. Full features included.",
      suggestions: ['Start free trial', 'Pricing', 'How does it work?'],
    },
    default: {
      message:
        "I'm not sure about that specific question, but I'd love to help! Here are some things I can tell you about:",
      suggestions: ['What is GuestBot?', 'How does it work?', 'Pricing', 'Features'],
    },
  };

  // Match user input to response
  function getResponse(input) {
    const lower = input.toLowerCase().trim();

    // Direct matches
    if (lower.includes('what is') && lower.includes('guestbot'))
      return responses['what is guestbot'];
    if (lower.includes('how') && (lower.includes('work') || lower.includes('does it')))
      return responses['how does it work'];
    if (
      lower.includes('price') ||
      lower.includes('cost') ||
      lower.includes('pricing') ||
      lower.includes('how much')
    )
      return responses['pricing'];
    if (lower.includes('feature') || lower.includes('what can') || lower.includes('included'))
      return responses['features'];
    if (lower.includes('qr') || lower.includes('code')) return responses['qr codes'];
    if (lower.includes('ai') || lower.includes('artificial') || lower.includes('intelligent'))
      return responses['ai'];
    if (lower.includes('guest') && lower.includes('ask')) return responses['guests ask'];
    if (lower.includes('accurate') || lower.includes('correct') || lower.includes('reliable'))
      return responses['accurate'];
    if (
      lower.includes('calendar') ||
      lower.includes('sync') ||
      lower.includes('ical') ||
      lower.includes('airbnb') ||
      lower.includes('vrbo')
    )
      return responses['calendar'];
    if (lower.includes('verif') || (lower.includes('secure') && lower.includes('guest')))
      return responses['verification'];
    if (
      lower.includes('security') ||
      lower.includes('safe') ||
      lower.includes('privacy') ||
      lower.includes('data')
    )
      return responses['security'];
    if (
      lower.includes('trial') ||
      lower.includes('start') ||
      lower.includes('sign up') ||
      lower.includes('try')
    )
      return responses['trial'];
    if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey'))
      return responses['greeting'];

    return responses['default'];
  }

  // Create chat widget HTML
  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'feature-bot-widget';
    widget.innerHTML = `
            <button class="fb-toggle" id="fb-toggle" aria-label="Open chat">
                <span class="fb-toggle-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </span>
                <span class="fb-toggle-close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </span>
                <span class="fb-badge">1</span>
            </button>
            <div class="fb-window" id="fb-window">
                <div class="fb-header">
                    <div class="fb-header-info">
                        <div class="fb-avatar">
                            <span>🤖</span>
                        </div>
                        <div class="fb-header-text">
                            <strong>${BOT_NAME}</strong>
                            <span class="fb-status"><span class="fb-status-dot"></span> Online</span>
                        </div>
                    </div>
                    <button class="fb-minimize" id="fb-minimize" aria-label="Minimize">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="fb-messages" id="fb-messages"></div>
                <div class="fb-suggestions" id="fb-suggestions"></div>
                <div class="fb-input-area">
                    <input type="text" class="fb-input" id="fb-input" placeholder="Ask me anything..." maxlength="200">
                    <button class="fb-send" id="fb-send" aria-label="Send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    document.body.appendChild(widget);
    return widget;
  }

  // Add message to chat
  function addMessage(text, isBot = true, animate = true) {
    const container = document.getElementById('fb-messages');
    const msg = document.createElement('div');
    msg.className = `fb-message ${isBot ? 'fb-bot' : 'fb-user'}${animate ? ' fb-animate' : ''}`;

    if (isBot) {
      // Parse markdown-style bold for trusted bot responses only
      const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      msg.innerHTML = formatted.replace(/\n/g, '<br>');
    } else {
      // Use textContent for user messages to prevent XSS
      msg.textContent = text;
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  // Show suggestion buttons
  function showSuggestions(suggestions) {
    const container = document.getElementById('fb-suggestions');
    container.innerHTML = '';

    suggestions.forEach((text) => {
      const btn = document.createElement('button');
      btn.className = 'fb-suggestion';
      btn.textContent = text;
      btn.addEventListener('click', () => handleUserInput(text));
      container.appendChild(btn);
    });
  }

  // Handle user input
  function handleUserInput(text) {
    if (!text.trim()) return;

    // Clear input
    document.getElementById('fb-input').value = '';

    // Add user message
    addMessage(text, false);

    // Get and show bot response after delay
    setTimeout(
      () => {
        const response = getResponse(text);
        addMessage(response.message, true);
        showSuggestions(response.suggestions);
      },
      500 + Math.random() * 500
    );
  }

  // Toggle chat window
  function toggleChat() {
    const widget = document.getElementById('feature-bot-widget');
    const isOpen = widget.classList.toggle('open');

    // Hide badge when opened
    if (isOpen) {
      widget.querySelector('.fb-badge').style.display = 'none';
    }
  }

  // Initialize
  function init() {
    createWidget();

    // Event listeners
    document.getElementById('fb-toggle').addEventListener('click', toggleChat);
    document.getElementById('fb-minimize').addEventListener('click', toggleChat);

    document.getElementById('fb-send').addEventListener('click', () => {
      handleUserInput(document.getElementById('fb-input').value);
    });

    document.getElementById('fb-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleUserInput(e.target.value);
      }
    });

    // Handle suggestion clicks that are CTAs
    document.getElementById('fb-suggestions').addEventListener('click', (e) => {
      if (e.target.textContent === 'Start free trial') {
        window.location.href = '/app';
      }
    });

    // Show initial greeting after delay
    setTimeout(() => {
      const greeting = responses.greeting;
      addMessage(greeting.message, true, false);
      showSuggestions(greeting.suggestions);
    }, 100);
  }

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
