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
  hostEmail: null,
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
const voiceBtn = document.getElementById('voiceBtn');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const charCount = document.getElementById('charCount');
const charCurrent = document.getElementById('charCurrent');
let lastUserMessage = '';

const CONTEXT_LABELS = {
  general: () => t('chat.context_general'),
  kitchen: () => t('chat.context_kitchen'),
  tv: () => t('chat.context_tv'),
  thermostat: () => t('chat.context_thermostat'),
  bathroom: () => t('chat.context_bathroom'),
  pool: () => t('chat.context_pool'),
  checkout: () => t('chat.context_checkout'),
  bedroom: () => t('chat.context_bedroom'),
  parking: () => t('chat.context_parking'),
  amenities: () => t('chat.context_amenities'),
  policies: () => t('chat.context_policies'),
};

// ============================================
// Auto-growing textarea
// ============================================
function autoGrow() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

messageInput.addEventListener('input', autoGrow);

// Submit on Enter, newline on Shift+Enter
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// ============================================
// Character count
// ============================================
messageInput.addEventListener('input', () => {
  const len = messageInput.value.length;
  charCurrent.textContent = len;
  charCount.classList.toggle('visible', len > 0);
  charCount.classList.toggle('warning', len >= 400 && len < 475);
  charCount.classList.toggle('danger', len >= 475);
});

// ============================================
// Voice input (Web Speech API)
// ============================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    messageInput.value = transcript;
    autoGrow();
    charCurrent.textContent = transcript.length;
    charCount.classList.toggle('visible', transcript.length > 0);
  };

  recognition.onend = () => {
    voiceBtn.classList.remove('listening');
    if (messageInput.value.trim()) {
      messageInput.focus();
    }
  };

  recognition.onerror = () => {
    voiceBtn.classList.remove('listening');
  };

  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('listening')) {
      recognition.stop();
      return;
    }
    voiceBtn.classList.add('listening');
    try {
      recognition.start();
    } catch {
      voiceBtn.classList.remove('listening');
    }
  });
} else {
  // Hide voice button if not supported
  voiceBtn.classList.add('hidden');
}

// ============================================
// Scroll-to-bottom button
// ============================================
chatContainer.addEventListener('scroll', () => {
  const distFromBottom =
    chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
  scrollBottomBtn.classList.toggle('visible', distFromBottom > 150);
});

scrollBottomBtn.addEventListener('click', () => {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
});

// ============================================
// Haptic feedback (mobile)
// ============================================
function haptic(style) {
  if (!navigator.vibrate) return;
  if (style === 'light') navigator.vibrate(10);
  else if (style === 'medium') navigator.vibrate(20);
}

// ============================================
// Sound notification
// ============================================
const notifSound = null;
function playNotifSound() {
  try {
    if (!notifSound) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      return;
    }
    notifSound.currentTime = 0;
    notifSound.play();
  } catch {
    // Audio not available — silently ignore
  }
}

// ============================================
// Simple markdown rendering (safe subset)
// ============================================
function renderMarkdown(text) {
  // Escape HTML first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return (
    escaped
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text*
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Bullet lists: lines starting with - or *
      .replace(/^[-*]\s+(.+)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Numbered lists: lines starting with 1. 2. etc
      .replace(/^\d+\.\s+(.+)/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br>')
      // Clean up double BRs in lists
      .replace(/<br><\/li>/g, '</li>')
      .replace(/<br><ul>/g, '<ul>')
      .replace(/<\/ul><br>/g, '</ul>')
  );
}

// ============================================
// Typing indicator
// ============================================
function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatContainer.appendChild(indicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return indicator;
}

function removeTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

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
      hostEmail: state.hostEmail,
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
    state.hostEmail = session.hostEmail || null;
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
      if (msg.role === 'model') {
        div.innerHTML = renderMarkdown(msg.text);
      } else {
        div.textContent = msg.text;
      }
      if (msg.time) appendTimestamp(div, msg.time);
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
  haptic('light');

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
      state.hostEmail = data.data?.hostEmail || null;

      haptic('medium');
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
  lastUserMessage = message;

  haptic('light');
  addMessage(message, 'user');
  state.history.push({ role: 'user', text: message, time: Date.now() });
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCount.classList.remove('visible');
  charCurrent.textContent = '0';
  sendBtn.disabled = true;

  // Show typing indicator
  showTypingIndicator();

  try {
    // Abort fetch if server hangs (60s timeout)
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        propertyId: state.propertyId,
        question: message,
        context: state.context,
        history: state.history.slice(-10), // Send last 5 exchanges
        stream: true,
        sessionToken: state.sessionToken,
      }),
    });

    clearTimeout(fetchTimeout);

    // Remove typing indicator, create bot message
    removeTypingIndicator();

    // Create streaming bot message element
    const botEl = document.createElement('div');
    botEl.className = 'message bot streaming';
    botEl.textContent = '';
    chatContainer.appendChild(botEl);

    // Add a blinking cursor while streaming
    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    botEl.appendChild(cursor);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      cursor.remove();
      botEl.classList.remove('streaming');

      // Handle session expiration — show re-verification UI
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        state.isVerified = false;
        state.sessionToken = null;
        botEl.textContent = errData.message || t('chat.error_session_expired');
        appendTimestamp(botEl);
        // Show re-verify prompt after a short delay
        setTimeout(() => {
          chatScreen.classList.remove('active');
          verifyScreen.classList.remove('hidden');
          verifyError.textContent = t('chat.error_session_expired');
        }, 2000);
        sendBtn.disabled = false;
        return;
      }

      botEl.textContent = errData.message || t('chat.error_generic');
      appendTimestamp(botEl);
      addRetryButton(botEl);
      state.history.push({ role: 'model', text: botEl.textContent, time: Date.now() });
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
              botEl.innerHTML = renderMarkdown(fullText);
              botEl.appendChild(cursor);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            } else if (event.type === 'replace') {
              // Server corrected the response (hallucination fix or filter)
              fullText = event.text;
              cursor.remove();
              botEl.innerHTML = renderMarkdown(fullText);
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

      // Ensure cursor is removed & finalize
      if (cursor.parentNode) cursor.remove();
      botEl.classList.remove('streaming');
      botEl.innerHTML = renderMarkdown(fullText);
      appendTimestamp(botEl);

      // Play notification sound
      playNotifSound();
      haptic('light');

      state.history.push({ role: 'model', text: fullText, time: Date.now() });
      addFeedbackButtons(botEl, message);
    } else {
      // Fallback: non-streaming JSON response
      const data = await res.json();
      cursor.remove();
      botEl.classList.remove('streaming');

      if (data.success && data.data?.answer) {
        botEl.innerHTML = renderMarkdown(data.data.answer);
        appendTimestamp(botEl);
        state.history.push({ role: 'model', text: data.data.answer, time: Date.now() });

        // Update context if server detected a different one
        if (data.data.context && data.data.context !== state.context) {
          state.context = data.data.context;
          contextBadge.textContent = (
            CONTEXT_LABELS[data.data.context] || CONTEXT_LABELS.general
          )();
        }

        playNotifSound();
        haptic('light');
        addFeedbackButtons(botEl, message);
      } else {
        botEl.textContent = t('chat.error_generic');
        appendTimestamp(botEl);
        state.history.push({ role: 'model', text: botEl.textContent, time: Date.now() });
      }
    }
  } catch (err) {
    removeTypingIndicator();
    const errEl = document.createElement('div');
    errEl.className = 'message bot';
    errEl.textContent = t('chat.error_connection');
    appendTimestamp(errEl);
    addRetryButton(errEl);
    chatContainer.appendChild(errEl);
    state.history.push({ role: 'model', text: errEl.textContent, time: Date.now() });
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
  upBtn.addEventListener('click', () => {
    haptic('light');
    submitFeedback(question, 'positive', wrapper);
  });

  const downBtn = document.createElement('button');
  downBtn.className = 'feedback-btn';
  downBtn.textContent = '\u{1F44E}';
  downBtn.title = t('chat.feedback_not_helpful');
  downBtn.addEventListener('click', () => {
    haptic('light');
    submitFeedback(question, 'negative', wrapper);
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '\u{1F4CB}';
  copyBtn.title = 'Copy';
  copyBtn.addEventListener('click', () => {
    const msgText = messageEl.firstChild?.textContent || messageEl.textContent || '';
    navigator.clipboard.writeText(msgText).then(() => {
      copyBtn.textContent = '\u2713';
      haptic('light');
      setTimeout(() => {
        copyBtn.textContent = '\u{1F4CB}';
      }, 1500);
    });
  });

  wrapper.appendChild(upBtn);
  wrapper.appendChild(downBtn);
  wrapper.appendChild(copyBtn);

  // Contact host link
  if (state.hostEmail) {
    const contactLink = document.createElement('a');
    contactLink.className = 'contact-host-link';
    contactLink.href = `mailto:${state.hostEmail}?subject=${encodeURIComponent(t('chat.contact_subject') || 'Question about my stay')}`;
    contactLink.textContent = t('chat.contact_host') || 'Contact Host';
    wrapper.appendChild(contactLink);
  }

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
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function appendTimestamp(el, time) {
  const ts = document.createElement('span');
  ts.className = 'message-time';
  ts.textContent = formatTime(time || Date.now());
  el.appendChild(ts);
}

function addMessage(text, className) {
  const div = document.createElement('div');
  div.className = `message ${className}`;
  div.textContent = text;
  appendTimestamp(div);
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
      haptic('light');
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

// Retry button for failed AI responses
function addRetryButton(botEl) {
  const retryBtn = document.createElement('button');
  retryBtn.className = 'retry-btn';
  retryBtn.textContent = 'Try again';
  retryBtn.addEventListener('click', () => {
    haptic('light');
    botEl.remove();
    if (state.history.length > 0 && state.history[state.history.length - 1].role === 'model') {
      state.history.pop();
    }
    messageInput.value = lastUserMessage;
    chatForm.dispatchEvent(new Event('submit'));
  });
  botEl.appendChild(retryBtn);
}

// Connection state indicator
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').classList.add('visible');
  sendBtn.disabled = true;
});
window.addEventListener('online', () => {
  document.getElementById('offlineBanner').classList.remove('visible');
  sendBtn.disabled = false;
});

// Language switcher keyboard navigation
const langSwitcher = document.querySelector('.lang-switcher');
const langToggle = document.querySelector('.lang-toggle');
const langOptionEls = document.querySelectorAll('.lang-option');

if (langToggle && langSwitcher) {
  // Sync aria-expanded with open state
  new MutationObserver(() => {
    langToggle.setAttribute('aria-expanded', String(langSwitcher.classList.contains('open')));
  }).observe(langSwitcher, { attributes: true, attributeFilter: ['class'] });

  langToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      langSwitcher.classList.toggle('open');
      if (langSwitcher.classList.contains('open') && langOptionEls.length > 0) {
        langOptionEls[0].focus();
      }
    }
    if (e.key === 'Escape') {
      langSwitcher.classList.remove('open');
    }
  });

  langOptionEls.forEach((opt, i) => {
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        langSwitcher.classList.remove('open');
        langToggle.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        (langOptionEls[i + 1] || langOptionEls[0]).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (langOptionEls[i - 1] || langOptionEls[langOptionEls.length - 1]).focus();
      }
    });
  });
}

init();
