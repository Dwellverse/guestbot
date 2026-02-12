import { t, initI18n } from './i18n.js';

// Initialize i18n first (await to ensure translations are loaded)
await initI18n();

// Google Analytics 4
// TODO: Replace GA_MEASUREMENT_ID with your actual GA4 ID and uncomment
// window.dataLayer = window.dataLayer || [];
// function gtag() { dataLayer.push(arguments); }
// gtag('js', new Date());
// gtag('config', 'GA_MEASUREMENT_ID');

// Contact form handling
const contactForm = document.getElementById('contactFormEl');
if (contactForm) {
  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    document.querySelector('.contact-form form').style.display = 'none';
    document.getElementById('formSuccess').classList.add('show');
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
    document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));

    // Toggle current item
    if (!isOpen) {
      item.classList.add('open');
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
  const multiplier = Math.round(valueSaved / 4.99);

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

if (pricingToggle) {
  pricingToggle.addEventListener('click', () => {
    const isAnnual = pricingToggle.classList.toggle('annual');

    if (isAnnual) {
      if (pricingAmount) pricingAmount.textContent = '3.99';
      if (pricingNote) pricingNote.textContent = t('pricing.note_annual');
      if (pricingSaveBadge) pricingSaveBadge.classList.add('show');
      if (monthlyOption) monthlyOption.classList.remove('active');
      if (annualOption) annualOption.classList.add('active');
    } else {
      if (pricingAmount) pricingAmount.textContent = '4.99';
      if (pricingNote) pricingNote.textContent = t('pricing.note_monthly');
      if (pricingSaveBadge) pricingSaveBadge.classList.remove('show');
      if (monthlyOption) monthlyOption.classList.add('active');
      if (annualOption) annualOption.classList.remove('active');
    }
  });
}
