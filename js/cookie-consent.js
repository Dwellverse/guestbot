/**
 * GuestBot Cookie Consent Manager
 * Handles GDPR/CCPA compliant cookie consent with GTM Consent Mode v2
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'guestbot_cookie_consent';
  const CONSENT_VERSION = '1.0';

  // Default consent state (denied until user accepts)
  const defaultConsent = {
    version: CONSENT_VERSION,
    timestamp: null,
    essential: true, // Always required
    analytics: false,
    marketing: false,
    doNotSell: false, // CCPA
  };

  // Initialize GTM Consent Mode v2 defaults
  function initGTMConsentMode() {
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      dataLayer.push(arguments);
    }

    // Set default consent state (denied)
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted', // Essential
      personalization_storage: 'denied',
      security_storage: 'granted', // Essential
    });

    // Enable URL passthrough for better measurement
    gtag('set', 'url_passthrough', true);

    // Enable ads data redaction when consent denied
    gtag('set', 'ads_data_redaction', true);
  }

  // Update GTM consent based on user preferences
  function updateGTMConsent(consent) {
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      dataLayer.push(arguments);
    }

    gtag('consent', 'update', {
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing && !consent.doNotSell ? 'granted' : 'denied',
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      personalization_storage: consent.analytics ? 'granted' : 'denied',
    });
  }

  // Get stored consent
  function getStoredConsent() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const consent = JSON.parse(stored);
        if (consent.version === CONSENT_VERSION) {
          return consent;
        }
      }
    } catch (e) {
      console.warn('Failed to read cookie consent:', e);
    }
    return null;
  }

  // Save consent
  function saveConsent(consent) {
    consent.timestamp = new Date().toISOString();
    consent.version = CONSENT_VERSION;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (e) {
      console.warn('Failed to save cookie consent:', e);
    }
    updateGTMConsent(consent);
    hideBanner();
    hidePreferenceCenter();
  }

  // Accept all cookies
  function acceptAll() {
    saveConsent({
      ...defaultConsent,
      analytics: true,
      marketing: true,
      doNotSell: false,
    });
  }

  // Reject non-essential cookies
  function rejectAll() {
    saveConsent({
      ...defaultConsent,
      analytics: false,
      marketing: false,
      doNotSell: true,
    });
  }

  // Save custom preferences
  function savePreferences() {
    const analyticsCheckbox = document.getElementById('consent-analytics');
    const marketingCheckbox = document.getElementById('consent-marketing');
    const doNotSellCheckbox = document.getElementById('consent-do-not-sell');

    saveConsent({
      ...defaultConsent,
      analytics: analyticsCheckbox ? analyticsCheckbox.checked : false,
      marketing: marketingCheckbox ? marketingCheckbox.checked : false,
      doNotSell: doNotSellCheckbox ? doNotSellCheckbox.checked : false,
    });
  }

  // Create and inject banner HTML
  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.innerHTML = `
            <div class="cookie-banner-content">
                <div class="cookie-banner-text">
                    <strong>We value your privacy</strong>
                    <p>We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies. <a href="/privacy#cookies">Learn more</a></p>
                </div>
                <div class="cookie-banner-actions">
                    <button type="button" class="cookie-btn cookie-btn-secondary" id="cookie-customize">Customize</button>
                    <button type="button" class="cookie-btn cookie-btn-secondary" id="cookie-reject">Reject All</button>
                    <button type="button" class="cookie-btn cookie-btn-primary" id="cookie-accept">Accept All</button>
                </div>
            </div>
        `;
    document.body.appendChild(banner);

    // Event listeners
    document.getElementById('cookie-accept').addEventListener('click', acceptAll);
    document.getElementById('cookie-reject').addEventListener('click', rejectAll);
    document.getElementById('cookie-customize').addEventListener('click', showPreferenceCenter);
  }

  // Create preference center modal
  function createPreferenceCenter() {
    const consent = getStoredConsent() || defaultConsent;

    const modal = document.createElement('div');
    modal.id = 'cookie-preference-center';
    modal.innerHTML = `
            <div class="cookie-modal-overlay" id="cookie-modal-close-overlay"></div>
            <div class="cookie-modal">
                <div class="cookie-modal-header">
                    <h2>Cookie Preferences</h2>
                    <button type="button" class="cookie-modal-close" id="cookie-modal-close">&times;</button>
                </div>
                <div class="cookie-modal-body">
                    <p>We use cookies to improve your experience on our site. Choose which cookies you're willing to accept.</p>

                    <div class="cookie-category">
                        <div class="cookie-category-header">
                            <div class="cookie-category-info">
                                <strong>Essential Cookies</strong>
                                <span class="cookie-badge cookie-badge-required">Always Active</span>
                            </div>
                        </div>
                        <p class="cookie-category-desc">Required for the website to function. These cannot be disabled.</p>
                    </div>

                    <div class="cookie-category">
                        <div class="cookie-category-header">
                            <div class="cookie-category-info">
                                <strong>Analytics Cookies</strong>
                            </div>
                            <label class="cookie-toggle">
                                <input type="checkbox" id="consent-analytics" ${consent.analytics ? 'checked' : ''}>
                                <span class="cookie-toggle-slider"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">Help us understand how visitors interact with our website by collecting anonymous information.</p>
                    </div>

                    <div class="cookie-category">
                        <div class="cookie-category-header">
                            <div class="cookie-category-info">
                                <strong>Marketing Cookies</strong>
                            </div>
                            <label class="cookie-toggle">
                                <input type="checkbox" id="consent-marketing" ${consent.marketing ? 'checked' : ''}>
                                <span class="cookie-toggle-slider"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">Used to track visitors across websites for advertising purposes.</p>
                    </div>

                    <div class="cookie-category cookie-category-ccpa">
                        <div class="cookie-category-header">
                            <div class="cookie-category-info">
                                <strong>Do Not Sell My Personal Information</strong>
                                <span class="cookie-badge cookie-badge-ccpa">CCPA</span>
                            </div>
                            <label class="cookie-toggle">
                                <input type="checkbox" id="consent-do-not-sell" ${consent.doNotSell ? 'checked' : ''}>
                                <span class="cookie-toggle-slider"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">California residents: opt out of the sale of your personal information under CCPA.</p>
                    </div>
                </div>
                <div class="cookie-modal-footer">
                    <button type="button" class="cookie-btn cookie-btn-secondary" id="cookie-save-preferences">Save Preferences</button>
                    <button type="button" class="cookie-btn cookie-btn-primary" id="cookie-accept-all">Accept All</button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('cookie-modal-close').addEventListener('click', hidePreferenceCenter);
    document
      .getElementById('cookie-modal-close-overlay')
      .addEventListener('click', hidePreferenceCenter);
    document.getElementById('cookie-save-preferences').addEventListener('click', savePreferences);
    document.getElementById('cookie-accept-all').addEventListener('click', acceptAll);
  }

  // Show/hide functions
  function showBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) banner.classList.add('visible');
  }

  function hideBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) banner.classList.remove('visible');
  }

  function showPreferenceCenter() {
    let modal = document.getElementById('cookie-preference-center');
    if (!modal) {
      createPreferenceCenter();
      modal = document.getElementById('cookie-preference-center');
    }
    // Update checkboxes with current consent
    const consent = getStoredConsent() || defaultConsent;
    const analyticsCheckbox = document.getElementById('consent-analytics');
    const marketingCheckbox = document.getElementById('consent-marketing');
    const doNotSellCheckbox = document.getElementById('consent-do-not-sell');
    if (analyticsCheckbox) analyticsCheckbox.checked = consent.analytics;
    if (marketingCheckbox) marketingCheckbox.checked = consent.marketing;
    if (doNotSellCheckbox) doNotSellCheckbox.checked = consent.doNotSell;

    modal.classList.add('visible');
    hideBanner();
  }

  function hidePreferenceCenter() {
    const modal = document.getElementById('cookie-preference-center');
    if (modal) modal.classList.remove('visible');
  }

  // Initialize
  function init() {
    // Initialize GTM Consent Mode first
    initGTMConsentMode();

    // Check for stored consent
    const storedConsent = getStoredConsent();

    if (storedConsent) {
      // Apply stored consent to GTM
      updateGTMConsent(storedConsent);
    } else {
      // Show banner for first-time visitors
      createBanner();
      // Small delay to allow CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showBanner();
        });
      });
    }

    // Expose functions globally for footer links
    window.GuestBotCookies = {
      showPreferences: showPreferenceCenter,
      acceptAll: acceptAll,
      rejectAll: rejectAll,
      getConsent: getStoredConsent,
    };
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
