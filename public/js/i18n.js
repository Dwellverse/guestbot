const SUPPORTED_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'zh'];
const DEFAULT_LANG = 'en';
const STORAGE_KEY = 'guestbot_lang';

let translations = {};
let currentLang = DEFAULT_LANG;

function detectLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
  return DEFAULT_LANG;
}

async function loadTranslations(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    if (lang !== DEFAULT_LANG) {
      const fallback = await fetch(`/locales/${DEFAULT_LANG}.json`);
      return await fallback.json();
    }
    return {};
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (translations[key] != null) el.textContent = translations[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (translations[key] != null) el.innerHTML = translations[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[key] != null) el.placeholder = translations[key];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (translations[key] != null) el.setAttribute('aria-label', translations[key]);
  });
  document.querySelectorAll('[data-i18n-question]').forEach((el) => {
    const key = el.getAttribute('data-i18n-question');
    if (translations[key] != null) el.setAttribute('data-question', translations[key]);
  });

  if (translations['meta.title']) document.title = translations['meta.title'];
  const desc = document.querySelector('meta[name="description"]');
  if (desc && translations['meta.description'])
    desc.setAttribute('content', translations['meta.description']);
  document.documentElement.lang = currentLang;
}

export function t(key) {
  return translations[key] || key;
}

export async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  translations = await loadTranslations(lang);
  applyTranslations();
  // Update active state on language switcher
  document.querySelectorAll('.lang-option').forEach((el) => {
    el.classList.toggle('active', el.dataset.lang === lang);
  });
}

export async function initI18n() {
  currentLang = detectLanguage();
  translations = await loadTranslations(currentLang);
  applyTranslations();

  // Bind language switcher events
  document.querySelectorAll('.lang-option').forEach((el) => {
    el.classList.toggle('active', el.dataset.lang === currentLang);
    el.addEventListener('click', () => {
      setLanguage(el.dataset.lang);
      el.closest('.lang-switcher')?.classList.remove('open');
    });
  });

  const toggleBtn = document.querySelector('.lang-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBtn.closest('.lang-switcher')?.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      document.querySelector('.lang-switcher')?.classList.remove('open');
    });
  }

  // Anti-FOUC: reveal body
  document.body.classList.add('i18n-ready');
}

export { SUPPORTED_LANGS, currentLang };
