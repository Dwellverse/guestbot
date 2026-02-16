import { t, initI18n } from './i18n.js';

// Initialize i18n first (await to ensure translations are loaded)
await initI18n();

// Inline toast for landing page (app.js has its own showToast)
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: '#10b981',
    color: '#fff',
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10000',
    opacity: '0',
    transition: 'all 0.3s ease',
    boxShadow: '0 8px 32px rgba(16,185,129,0.3)',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Contact form handling
const contactForm = document.getElementById('contactFormEl');
if (contactForm) {
  contactForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = contactForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const data = Object.fromEntries(new FormData(contactForm));
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        document.querySelector('.contact-form form').style.display = 'none';
        document.getElementById('formSuccess').classList.add('show');
      } else {
        showToast(result.message || 'Failed to send. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Send Message';
      }
    } catch {
      showToast('Failed to send. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Send Message';
    }
  });
}

// Hamburger menu toggle
const hamburger = document.querySelector('.nav-hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
  });

  document.querySelectorAll('.nav-links .nav-link, .nav-links .nav-cta').forEach((link) => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// FAQ accordion
document.querySelectorAll('.faq-question').forEach((button) => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    const isOpen = item.classList.contains('open');

    // Close all other items
    document.querySelectorAll('.faq-item').forEach((i) => {
      i.classList.remove('open');
      i.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
    });

    // Toggle current item
    if (!isOpen) {
      item.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
    }
  });
});

// Preview tabs
document.querySelectorAll('.preview-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const preview = tab.dataset.preview;

    // Update tabs
    document.querySelectorAll('.preview-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    // Update content
    document.querySelectorAll('.preview-content').forEach((c) => c.classList.remove('active'));
    document.querySelector(`.preview-content[data-preview="${preview}"]`)?.classList.add('active');
  });
});

// ROI Calculator
const roiSlider = document.getElementById('roiSlider');
const roiSliderValue = document.getElementById('roiSliderValue');
const roiTimeSaved = document.getElementById('roiTimeSaved');
const roiValueSaved = document.getElementById('roiValueSaved');
const roiReturn = document.getElementById('roiReturn');

function updateROI(messagesPerWeek) {
  const handledPerWeek = messagesPerWeek * 0.8;
  const minutesSavedPerWeek = handledPerWeek * 3;
  const hoursSavedPerMonth = (minutesSavedPerWeek * 4.33) / 60;
  const valueSaved = hoursSavedPerMonth * 25;
  const multiplier = Math.round(valueSaved / 5.99);

  if (roiSliderValue) roiSliderValue.textContent = messagesPerWeek;
  if (roiTimeSaved) roiTimeSaved.textContent = hoursSavedPerMonth.toFixed(1) + ' ' + t('roi.hrs');
  if (roiValueSaved) roiValueSaved.textContent = '$' + Math.round(valueSaved);
  if (roiReturn) roiReturn.textContent = multiplier + 'x ' + t('roi.return_suffix');
}

if (roiSlider) {
  roiSlider.addEventListener('input', (e) => {
    updateROI(parseInt(e.target.value, 10));
  });
  updateROI(20);
}

// Pricing Toggle
const pricingToggle = document.getElementById('pricingToggle');
const pricingAmount = document.getElementById('pricingAmount');
const pricingNote = document.getElementById('pricingNote');
const pricingSaveBadge = document.getElementById('pricingSaveBadge');
const monthlyOption = document.querySelector('.pricing-toggle-option[data-plan="monthly"]');
const annualOption = document.querySelector('.pricing-toggle-option[data-plan="annual"]');

const pricingCta = document.getElementById('pricingCta');

function updatePricingCta(isAnnual) {
  if (pricingCta) {
    pricingCta.href = `/app?plan=${isAnnual ? 'annual' : 'monthly'}`;
  }
}

if (pricingToggle) {
  pricingToggle.addEventListener('click', () => {
    const isAnnual = pricingToggle.classList.toggle('annual');

    if (isAnnual) {
      if (pricingAmount) pricingAmount.textContent = '4.17';
      if (pricingNote) pricingNote.textContent = t('pricing.note_annual');
      if (pricingSaveBadge) pricingSaveBadge.classList.add('show');
      if (monthlyOption) monthlyOption.classList.remove('active');
      if (annualOption) annualOption.classList.add('active');
    } else {
      if (pricingAmount) pricingAmount.textContent = '5.99';
      if (pricingNote) pricingNote.textContent = t('pricing.note_monthly');
      if (pricingSaveBadge) pricingSaveBadge.classList.remove('show');
      if (monthlyOption) monthlyOption.classList.add('active');
      if (annualOption) annualOption.classList.remove('active');
    }

    updatePricingCta(isAnnual);
  });
}

// Set initial CTA link
updatePricingCta(false);

// ============================================
// Scroll-triggered reveal animations
// ============================================
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal, .reveal-stagger, .reveal-scale').forEach((el) => {
  revealObserver.observe(el);
});

// ============================================
// Animated stat counters
// ============================================
function animateCounter(el, target, suffix = '', prefix = '') {
  const duration = 1800;
  const start = performance.now();
  const isFloat = String(target).includes('.');

  el.classList.add('counting');

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = eased * target;

    el.textContent = prefix + (isFloat ? current.toFixed(1) : Math.round(current)) + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.classList.remove('counting');
      el.classList.add('counted');
    }
  }

  requestAnimationFrame(update);
}

const statsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const statValues = entry.target.querySelectorAll('.stat-value');
        statValues.forEach((el) => {
          const text = el.textContent.trim();
          // Parse formats like "80%", "24/7", "8", "5min", "4.9"
          if (text.includes('/')) {
            // Skip fraction-like stats (24/7) — just reveal
            return;
          }
          const match = text.match(/^([<>~]?)(\d+\.?\d*)\s*(.*)$/);
          if (match) {
            const prefix = match[1];
            const num = parseFloat(match[2]);
            const suffix = match[3];
            animateCounter(el, num, suffix, prefix);
          }
        });
        statsObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 }
);

const statsGrid = document.querySelector('.stats-grid');
if (statsGrid) {
  statsObserver.observe(statsGrid);
}
