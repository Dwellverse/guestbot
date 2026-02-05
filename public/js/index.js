import { t } from '/js/i18n.js';

// Google Analytics 4
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'GA_MEASUREMENT_ID');

// Contact form handling
document.getElementById('contactFormEl').addEventListener('submit', function (e) {
  e.preventDefault();
  // In production, this would send to your backend
  document.querySelector('.contact-form form').style.display = 'none';
  document.getElementById('formSuccess').classList.add('show');
});

// Hamburger menu toggle
const hamburger = document.querySelector('.nav-hamburger');
const navLinks = document.querySelector('.nav-links');

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
    document.querySelector(`.preview-content[data-preview="${preview}"]`).classList.add('active');
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

  roiSliderValue.textContent = messagesPerWeek;
  roiTimeSaved.textContent = hoursSavedPerMonth.toFixed(1) + ' ' + t('roi.hrs');
  roiValueSaved.textContent = '$' + Math.round(valueSaved);
  roiReturn.textContent = multiplier + 'x ' + t('roi.return_suffix');
}

roiSlider.addEventListener('input', (e) => {
  updateROI(parseInt(e.target.value, 10));
});

updateROI(20);

// Pricing Toggle
const pricingToggle = document.getElementById('pricingToggle');
const pricingAmount = document.getElementById('pricingAmount');
const pricingNote = document.getElementById('pricingNote');
const pricingSaveBadge = document.getElementById('pricingSaveBadge');
const monthlyOption = document.querySelector('.pricing-toggle-option[data-plan="monthly"]');
const annualOption = document.querySelector('.pricing-toggle-option[data-plan="annual"]');

pricingToggle.addEventListener('click', () => {
  const isAnnual = pricingToggle.classList.toggle('annual');

  if (isAnnual) {
    pricingAmount.textContent = '3.99';
    pricingNote.textContent = t('pricing.note_annual');
    pricingSaveBadge.classList.add('show');
    monthlyOption.classList.remove('active');
    annualOption.classList.add('active');
  } else {
    pricingAmount.textContent = '4.99';
    pricingNote.textContent = t('pricing.note_monthly');
    pricingSaveBadge.classList.remove('show');
    monthlyOption.classList.add('active');
    annualOption.classList.remove('active');
  }
});
