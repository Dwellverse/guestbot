import { t, initI18n } from './i18n.js';

// Initialize i18n
await initI18n();

const API_BASE = '';

// State
const state = {
  propertyId: null,
  context: null,
  phoneLastFour: null,
  isVerified: false,
  guestName: null,
  sessionToken: null,
  history: [], // Conversation history: [{ role: 'user'|'model', text: '...' }]
};

// Session storage key prefix
const SESSION_KEY = 'guestbot_session';

// DOM elements
const verifyScreen = document.getElementById('verifyScreen');
const chatScreen = document.getElementById('chatScreen');
const phoneInput = document.getElementById('phoneInput');
const verifyBtn = document.getElementById('verifyBtn');
const verifyError = document.getElementById('verifyError');
const contextBadge = document.getElementById('contextBadge');
const chatContainer = document.getElementById('chatContainer');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

const CONTEXT_LABELS = {
  general: () => t('chat.context_general'),
  kitchen: () => t('chat.context_kitchen'),
  tv: () => t('chat.context_tv'),
  thermostat: () => t('chat.context_thermostat'),
  bathroom: () => t('chat.context_bathroom'),
  pool: () => t('chat.context_pool'),
  checkout: () => t('chat.context_checkout'),
};

// Parse URL params and restore session
function init() {
  const params = new URLSearchParams(window.location.search);
  state.propertyId = params.get('p') || params.get('propertyId');
  state.context = params.get('c') || params.get('context') || 'general';

  contextBadge.textContent = (CONTEXT_LABELS[state.context] || CONTEXT_LABELS.general)();

  if (!state.propertyId) {
    verifyError.textContent = t('chat.verify_error_invalid');
    phoneInput.disabled = true;
    verifyBtn.disabled = true;
    return;
  }

  // Try to restore session from sessionStorage
  if (restoreSession()) {
    return;
  }
}

// ============================================
// Session Persistence
// ============================================
function saveSession() {
  try {
    const sessionData = {
      propertyId: state.propertyId,
      context: state.context,
      isVerified: state.isVerified,
      guestName: state.guestName,
      sessionToken: state.sessionToken,
      history: state.history,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch {
    // sessionStorage not available or full — silently ignore
  }
}

function restoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;

    const session = JSON.parse(raw);

    // Validate session: must match current propertyId and be less than 30 min old
    if (
      session.propertyId !== state.propertyId ||
      !session.isVerified ||
      !session.sessionToken ||
      Date.now() - session.savedAt > 30 * 60 * 1000
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }

    // Restore state
    state.isVerified = session.isVerified;
    state.guestName = session.guestName;
    state.sessionToken = session.sessionToken || null;
    state.history = session.history || [];
    state.context = session.context || state.context;

    // Restore UI
    verifyScreen.classList.add('hidden');
    chatScreen.classList.add('active');
    contextBadge.textContent = (CONTEXT_LABELS[state.context] || CONTEXT_LABELS.general)();

    // Restore chat messages from history
    const welcomeMsg = chatContainer.querySelector('.message');
    welcomeMsg.textContent = state.guestName
      ? t('chat.welcome_name').replace('{name}', state.guestName.split(' ')[0])
      : t('chat.welcome');

    for (const msg of state.history) {
      const div = document.createElement('div');
      div.className = `message ${msg.role === 'user' ? 'user' : 'bot'}`;
      div.textContent = msg.text;
      if (msg.role === 'model') {
        addFeedbackButtons(div, msg.text);
      }
      chatContainer.appendChild(div);
    }

    // Hide quick actions if there's history
    if (state.history.length > 0) {
      document.getElementById('quickActions').classList.add('hidden');
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageInput.focus();
    return true;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return false;
  }
}

// ============================================
// Verify guest
// ============================================
verifyBtn.addEventListener('click', async () => {
  const code = phoneInput.value.trim();
  if (code.length !== 4) {
    verifyError.textContent = t('chat.verify_error_digits');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = t('chat.verifying');
  verifyError.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: state.propertyId,
        phoneLastFour: code,
      }),
    });

    const data = await res.json();

    if (data.success && data.verified) {
      state.phoneLastFour = code;
      state.isVerified = true;
      state.guestName = data.data?.guestName || 'Guest';
      state.sessionToken = data.data?.sessionToken || null;

      verifyScreen.classList.add('hidden');
      chatScreen.classList.add('active');

      // Welcome message
      const welcomeMsg = state.guestName
        ? t('chat.welcome_name').replace('{name}', state.guestName.split(' ')[0])
        : t('chat.welcome');
      chatContainer.querySelector('.message').textContent = welcomeMsg;

      saveSession();
      messageInput.focus();
    } else {
      verifyError.textContent = data.message || t('chat.verify_error_not_found');
      verifyBtn.disabled = false;
      verifyBtn.textContent = t('chat.verify_btn');
    }
  } catch (err) {
    verifyError.textContent = t('chat.verify_error_connection');
    verifyBtn.disabled = false;
    verifyBtn.textContent = t('chat.verify_btn');
  }
});

// ============================================
// Send message (with streaming support)
// ============================================
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  state.history.push({ role: 'user', text: message });
  messageInput.value = '';
  sendBtn.disabled = true;

  // Create streaming bot message element
  const botEl = document.createElement('div');
  botEl.className = 'message bot';
  botEl.textContent = '';
  chatContainer.appendChild(botEl);

  // Add a blinking cursor while streaming
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  botEl.appendChild(cursor);

  try {
    const res = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: state.propertyId,
        question: message,
        context: state.context,
        history: state.history.slice(-10), // Send last 5 exchanges
        stream: true,
        sessionToken: state.sessionToken,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      cursor.remove();
      botEl.textContent = errData.message || t('chat.error_generic');
      state.history.push({ role: 'model', text: botEl.textContent });
      saveSession();
      sendBtn.disabled = false;
      messageInput.focus();
      return;
    }

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Handle SSE streaming
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'context') {
              // Update context badge if AI detected a different context
              if (event.context && event.context !== state.context) {
                state.context = event.context;
                contextBadge.textContent = (
                  CONTEXT_LABELS[event.context] || CONTEXT_LABELS.general
                )();
              }
            } else if (event.type === 'chunk') {
              fullText += event.text;
              // Remove cursor, update text, re-add cursor
              cursor.remove();
              botEl.textContent = fullText;
              botEl.appendChild(cursor);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            } else if (event.type === 'replace') {
              // Server corrected the response (hallucination fix or filter)
              fullText = event.text;
              cursor.remove();
              botEl.textContent = fullText;
              botEl.appendChild(cursor);
            } else if (event.type === 'error') {
              fullText = event.message || t('chat.error_generic');
              cursor.remove();
              botEl.textContent = fullText;
            } else if (event.type === 'done') {
              cursor.remove();
              if (!fullText) {
                botEl.textContent = t('chat.error_empty');
                fullText = botEl.textContent;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Ensure cursor is removed
      if (cursor.parentNode) cursor.remove();

      state.history.push({ role: 'model', text: fullText });
      addFeedbackButtons(botEl, message);
    } else {
      // Fallback: non-streaming JSON response
      const data = await res.json();
      cursor.remove();

      if (data.success && data.data?.answer) {
        botEl.textContent = data.data.answer;
        state.history.push({ role: 'model', text: data.data.answer });

        // Update context if server detected a different one
        if (data.data.context && data.data.context !== state.context) {
          state.context = data.data.context;
          contextBadge.textContent = (
            CONTEXT_LABELS[data.data.context] || CONTEXT_LABELS.general
          )();
        }

        addFeedbackButtons(botEl, message);
      } else {
        botEl.textContent = t('chat.error_generic');
        state.history.push({ role: 'model', text: botEl.textContent });
      }
    }
  } catch (err) {
    if (cursor.parentNode) cursor.remove();
    botEl.textContent = t('chat.error_connection');
    state.history.push({ role: 'model', text: botEl.textContent });
  }

  saveSession();
  sendBtn.disabled = false;
  chatContainer.scrollTop = chatContainer.scrollHeight;
  messageInput.focus();
});

// ============================================
// Feedback (thumbs up/down)
// ============================================
function addFeedbackButtons(messageEl, question) {
  const wrapper = document.createElement('div');
  wrapper.className = 'feedback-row';

  const upBtn = document.createElement('button');
  upBtn.className = 'feedback-btn';
  upBtn.textContent = '\u{1F44D}';
  upBtn.title = t('chat.feedback_helpful');
  upBtn.addEventListener('click', () => submitFeedback(question, 'positive', wrapper));

  const downBtn = document.createElement('button');
  downBtn.className = 'feedback-btn';
  downBtn.textContent = '\u{1F44E}';
  downBtn.title = t('chat.feedback_not_helpful');
  downBtn.addEventListener('click', () => submitFeedback(question, 'negative', wrapper));

  wrapper.appendChild(upBtn);
  wrapper.appendChild(downBtn);
  messageEl.appendChild(wrapper);
}

async function submitFeedback(question, rating, wrapper) {
  // Replace buttons with confirmation
  wrapper.textContent =
    rating === 'positive' ? t('chat.feedback_positive') : t('chat.feedback_negative');
  wrapper.classList.add('feedback-submitted');

  try {
    await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: state.propertyId,
        question: question.substring(0, 200),
        rating,
        sessionToken: state.sessionToken,
      }),
    });
  } catch {
    // Silently fail — feedback is non-critical
  }
}

// ============================================
// Utility
// ============================================
function addMessage(text, className) {
  const div = document.createElement('div');
  div.className = `message ${className}`;
  div.textContent = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

phoneInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '');
});

// Quick action buttons
const quickActions = document.getElementById('quickActions');
document.querySelectorAll('.quick-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const question = btn.dataset.question;
    if (question) {
      messageInput.value = question;
      chatForm.dispatchEvent(new Event('submit'));
      quickActions.classList.add('hidden');
    }
  });
});

// Hide quick actions after any message is sent
chatForm.addEventListener('submit', () => {
  quickActions.classList.add('hidden');
});

init();
