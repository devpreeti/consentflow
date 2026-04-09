import createEmitter from '../lib/events.js';
import * as storage from '../adapter/storage.js';
import { encodeCookie, decodeCookie, writeCookie, readCookie, removeCookie, CATEGORIES } from '../adapter/cookie.js';
import createWidget from '../ui/widget.js';
import { activateScriptsForCategories, activateAllConsented } from '../lib/activator.js';

const DEFAULTS = {
  locale: 'en',
  storageKey: 'consentflow_v1',
  cookieName: 'cf_flags',
  policyUrl: '',
  cookiePolicyUrl: '',
  companyName: '',
  revision: '',
  primaryColor: '#111827',
  theme: 'light',
  position: 'bottom',
  labels: {},
  translations: {},
  onConsentChange: null
};
const USER_TYPE_KEY = 'consentflow_user_type';

function ensureCategories(obj) {
  const out = {};
  CATEGORIES.forEach(k => { out[k] = Boolean(obj && obj[k]); });
  // necessary must always be true
  out.necessary = true;
  return out;
}

function getDefaultConsent(cfg) {
  return {
    version: 1,
    categories: ensureCategories({}),
    locale: (cfg && cfg.locale) || DEFAULTS.locale,
    revision: (cfg && cfg.revision) || DEFAULTS.revision,
    timestamp: new Date().toISOString()
  };
}

export default function createManager() {
  const emitter = createEmitter();
  let config = { ...DEFAULTS };
  let consent = null; // in-memory consent object
  let widget = null;
  let cookieWriteTimeout = null;
  let userType = 'first-time';
  // Activation queue for scripts that wait for consent
  // Window-level queue allows scripts to push before library loads
  window.__CF_ACTIVATIONS = window.__CF_ACTIVATIONS || [];

  function loadFromStorage() {
    const data = storage.read(config.storageKey);
    if (data && data.categories) return data;
    return null;
  }

  function writeUserType(type) {
    userType = type;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(USER_TYPE_KEY, type);
      }
    } catch (e) { /* ignore */ }
  }

  function resolveUserType(hasStoredConsent) {
    if (!hasStoredConsent) return 'first-time';
    if (consent && consent.categories && consent.categories.analytics === false) return 'rejected';
    return 'returning';
  }

  // Persist storage writes (localStorage immediate, cookie debounced).
  // This function writes storage but does NOT emit events.
  function persistNow() {
    if (!consent) return;
    try { storage.write(config.storageKey, consent); } catch (e) { /* ignore */ }
    if (cookieWriteTimeout) clearTimeout(cookieWriteTimeout);
    cookieWriteTimeout = setTimeout(() => {
      try {
        const cookieVal = encodeCookie(consent.categories, config.revision);
        const opts = { maxAge: 31536000, path: '/', sameSite: 'Lax', secure: location.protocol === 'https:' };
        writeCookie(config.cookieName, cookieVal, opts);
      } catch (e) { /* ignore */ }
    }, 250);
  }

  function notifyChange(oldC, method = 'save', source = 'api') {
    const payload = { oldConsent: oldC, newConsent: consent, source, method, timestamp: new Date().toISOString() };
    try { emitter.emit('consent:change', payload); } catch (e) { console.error(e); }
    if (typeof config.onConsentChange === 'function') {
      try { config.onConsentChange(payload); } catch (e) { console.error(e); }
    }
    // After notifying, process any activation queue to start eligible scripts
    try { processActivationQueue(); } catch (e) { /* ignore */ }
    // Activate any scripts for categories that were newly granted
    try {
      if (oldC && oldC.categories) {
        const newlyGranted = [];
        Object.keys(consent.categories).forEach(k => {
          if (k === 'necessary') return;
          const was = Boolean(oldC.categories[k]);
          const now = Boolean(consent.categories[k]);
          if (!was && now) newlyGranted.push(k);
        });
        if (newlyGranted.length) activateScriptsForCategories(newlyGranted, consent);
      } else {
        // no old consent: activate all currently consented (except necessary)
        activateAllConsented(consent);
      }
    } catch (e) { console.error('ConsentFlow activation error', e); }
  }

  // Activation helpers: process queued activations registered before/after init.
  function processActivationQueue() {
    const q = window.__CF_ACTIVATIONS || [];
    // iterate and run callbacks where all required categories are consented
    for (let i = q.length - 1; i >= 0; i--) {
      const item = q[i];
      // item: { categories: ['analytics'], fn: function }
      try {
        const req = Array.isArray(item.categories) ? item.categories : [];
        const allowed = req.every(cat => hasConsent(cat));
        if (allowed) {
          try { item.fn(); } catch (err) { console.error('Activation error', err); }
          // remove from queue
          q.splice(i, 1);
        }
      } catch (e) { /* ignore per-item errors */ }
    }
  }

  function init(userConfig = {}) {
    config = { ...config, ...userConfig };
    // hydrate
    const stored = loadFromStorage();
    const hasStoredConsent = Boolean(stored);
    if (stored) {
      // If revision changed, reset stored consent
      if (stored.revision && config.revision && stored.revision !== config.revision) {
        const old = { ...stored };
        try { storage.remove(config.storageKey); } catch (e) {}
        try { removeCookie(config.cookieName, { path: '/' }); } catch (e) {}
        consent = getDefaultConsent(config);
        // persist the reset default (so cookie/localStorage are consistent)
        persistNow();
        // centralized notification about revision reset
        try { notifyChange(old, 'revision', 'api'); } catch (e) { /* ignore */ }
      } else {
        consent = { ...stored, categories: ensureCategories(stored.categories) };
      }
    } else {
      // try to infer from cookie if present (compact), but still show banner to get full consent
      const cookieVal = readCookie(config.cookieName);
      if (!stored && cookieVal) {
        const parsed = decodeCookie(cookieVal);
        const inferredCats = parsed && parsed.categories ? parsed.categories : {};
        consent = {
          version: 1,
          categories: ensureCategories(inferredCats),
          locale: config.locale,
          revision: config.revision,
          timestamp: new Date().toISOString()
        };
      } else {
        consent = {
          version: 1,
          categories: ensureCategories({}),
          locale: config.locale,
          revision: config.revision,
          timestamp: new Date().toISOString()
        };
      }
    }
    writeUserType(resolveUserType(hasStoredConsent));
    // Ensure cookie/localStorage are synced to current in-memory consent
    persistNow();

    // Create UI instance lazily
    widget = createWidget({
      open: () => api.openPreferences(),
      showBanner: () => api.showBanner(),
      acceptAll: () => api.acceptAll(),
      rejectAll: () => api.rejectAll(),
      savePreferences: (c) => api.savePreferences(c),
      getConsent: () => api.getConsent(),
      getUserType: () => userType
    }, config);
    emitter.emit('consent:ready', { consent });

    // Show the banner only when it adds value:
    // first-time users need the full prompt, rejected users get a softer re-entry,
    // returning accepted users are not interrupted again.
    const shouldShowBanner = userType === 'first-time' || userType === 'rejected';
    if (shouldShowBanner && widget) {
      // Defer UI rendering to idle time
      if (typeof window.requestIdleCallback === 'function') {
        requestIdleCallback(() => widget.showBanner());
      } else {
        setTimeout(() => widget.showBanner(), 50);
      }
    } else if (widget) {
      if (typeof window.requestIdleCallback === 'function') {
        requestIdleCallback(() => widget.mountEntryPoints());
      } else {
        setTimeout(() => widget.mountEntryPoints(), 50);
      }
    }

    // Process any queued activations (some may be eligible immediately)
    try { processActivationQueue(); } catch (e) {}

    return Promise.resolve(consent);
  }

  function openPreferences() { widget && widget.open(); }
  function open() { openPreferences(); }
  function close() { widget && widget.close(); }
  function showBanner() { widget && widget.showBanner(); }

  function _updateCategories(newCats, method = 'savePreferences') {
    const old = JSON.parse(JSON.stringify(consent));
    consent.categories = ensureCategories({ ...consent.categories, ...newCats });
    consent.timestamp = new Date().toISOString();
    writeUserType(resolveUserType(true));
    persistNow();
    notifyChange(old, method, 'api');
    return consent;
  }

  function acceptAll() {
    const all = {};
    CATEGORIES.forEach(k => { all[k] = (k === 'necessary') ? true : true; });
    return _updateCategories(all, 'acceptAll');
  }

  function rejectAll() {
    const all = {};
    CATEGORIES.forEach(k => { all[k] = (k === 'necessary') ? true : false; });
    return _updateCategories(all, 'rejectAll');
  }

  function savePreferences(categories) {
    // validate keys but preserve categories omitted from partial updates
    const allowed = {};
    CATEGORIES.forEach(k => {
      if (k === 'necessary') return;
      if (categories && Object.prototype.hasOwnProperty.call(categories, k)) {
        allowed[k] = Boolean(categories[k]);
      }
    });
    return _updateCategories(allowed, 'savePreferences');
  }

  function getConsent() { return consent; }

  function hasConsent(category) {
    if (!consent) return false;
    return Boolean(consent.categories && consent.categories[category]);
  }

  function reset() {
    const old = JSON.parse(JSON.stringify(consent));
    consent = {
      version: 1,
      categories: ensureCategories({}),
      locale: config.locale,
      revision: config.revision,
      timestamp: new Date().toISOString()
    };
    writeUserType('first-time');
    storage.remove(config.storageKey);
    removeCookie(config.cookieName, { path: '/' });
    // After clearing storage and cookie, emit change so integrators can react
    notifyChange(old, 'reset', 'api');
    return consent;
  }

  function destroy() {
    if (widget) { widget.destroy(); widget = null; }
    // remove listeners
    emitter.off('consent:change');
    emitter.off('consent:ready');
  }

  const api = {
    init,
    open,
    openPreferences,
    close,
    showBanner,
    acceptAll,
    rejectAll,
    savePreferences,
    getConsent,
    hasConsent,
    reset,
    destroy,
    on: emitter.on,
    off: emitter.off,
    // expose activator for manual use
    activateScripts: (cat) => activateScriptsForCategories(Array.isArray(cat) ? cat : [cat])
  };

  // expose a helper for queued activations: scripts can push {categories, fn} into window.__CF_ACTIVATIONS
  // and the manager will process them when consent allows.
  // Also provide a programmatic registration method (not part of the minimal public API but useful).
  api._registerActivation = function(categories, fn) {
    if (typeof fn !== 'function') return;
    const item = { categories: Array.isArray(categories) ? categories : [], fn };
    window.__CF_ACTIVATIONS.push(item);
    // attempt to process immediately
    try { processActivationQueue(); } catch (e) {}
  };

  return api;
}
