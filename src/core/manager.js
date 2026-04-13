import createEmitter from '../lib/events.js';
import * as storage from '../adapter/storage.js';
import { encodeCookie, writeCookie, removeCookie, CATEGORIES } from '../adapter/cookie.js';
import createWidget from '../ui/widget.js';
import { activateScriptsForCategories } from '../lib/activator.js';

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
  onInit: null,
  onAccept: null,
  onReject: null,
  onChange: null,
  onConsentChange: null
};

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
    status: 'none',
    categories: ensureCategories({}),
    locale: (cfg && cfg.locale) || DEFAULTS.locale,
    revision: (cfg && cfg.revision) || DEFAULTS.revision,
    timestamp: new Date().toISOString()
  };
}

function resolveStoredStatus(c) {
  const categories = c && c.categories ? c.categories : {};
  return categories.analytics || categories.marketing ? 'accepted' : 'rejected';
}

function resolveStatus(c) {
  if (c && c.status === 'none') return 'none';
  const categories = c && c.categories ? c.categories : {};
  if (categories.analytics && categories.marketing) return 'accepted';
  if (!categories.analytics && !categories.marketing) return 'rejected';
  return 'custom';
}

function toPublicConsent(c) {
  const categories = ensureCategories(c && c.categories);
  return {
    necessary: true,
    analytics: Boolean(categories.analytics),
    marketing: Boolean(categories.marketing),
    status: resolveStatus({ categories }),
    updatedAt: c && c.timestamp ? c.timestamp : new Date().toISOString()
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

  function hydrateStoredConsent(data) {
    if (!data || !data.categories) return null;
    return {
      ...data,
      status: data.status === 'accepted' || data.status === 'rejected' ? data.status : resolveStoredStatus(data),
      categories: ensureCategories(data.categories)
    };
  }

  function writeUserType(type) {
    userType = type;
  }

  function resolveConsentState() {
    if (!consent || consent.status === 'none') return 'none';
    return consent.status === 'rejected' ? 'rejected' : 'accepted';
  }

  function resolveUserType(state) {
    if (state === 'rejected') return 'rejected';
    if (state === 'accepted') return 'returning';
    return 'first-time';
  }

  function getAllowedOptionalCategories() {
    if (!consent || !consent.categories) return [];
    return CATEGORIES.filter(k => k !== 'necessary' && consent.categories[k] === true);
  }

  function activateAllowedScripts() {
    const allowedCategories = getAllowedOptionalCategories();
    if (!allowedCategories.length) return 0;
    return activateScriptsForCategories(allowedCategories, consent);
  }

  // Persist storage writes (localStorage immediate, cookie debounced).
  // This function writes storage but does NOT emit events.
  function persistNow() {
    if (!consent) return;
    const persistedConsent = {
      ...consent,
      status: resolveStoredStatus(consent),
      categories: ensureCategories(consent.categories)
    };
    try { storage.write(config.storageKey, persistedConsent); } catch (e) { /* ignore */ }
    if (cookieWriteTimeout) clearTimeout(cookieWriteTimeout);
    cookieWriteTimeout = setTimeout(() => {
      try {
        const cookieVal = encodeCookie(persistedConsent.categories, config.revision);
        const opts = { maxAge: 31536000, path: '/', sameSite: 'Lax', secure: location.protocol === 'https:' };
        writeCookie(config.cookieName, cookieVal, opts);
      } catch (e) { /* ignore */ }
    }, 250);
  }

  function notifyChange(oldC, method = 'save', source = 'api') {
    const publicConsent = toPublicConsent(consent);
    const payload = {
      oldConsent: toPublicConsent(oldC),
      newConsent: publicConsent,
      source,
      method,
      timestamp: new Date().toISOString()
    };
    try { emitter.emit('consent:change', payload); } catch (e) { console.error(e); }
    if (typeof config.onConsentChange === 'function') {
      try { config.onConsentChange(payload); } catch (e) { console.error(e); }
    }
    if (typeof config.onChange === 'function') {
      try { config.onChange(publicConsent); } catch (e) { console.error(e); }
    }
    if (method === 'acceptAll' && typeof config.onAccept === 'function') {
      try { config.onAccept(publicConsent); } catch (e) { console.error(e); }
    }
    if (method === 'rejectAll' && typeof config.onReject === 'function') {
      try { config.onReject(publicConsent); } catch (e) { console.error(e); }
    }
    // After notifying, process any activation queue to start eligible scripts
    try { processActivationQueue(); } catch (e) { /* ignore */ }
    // Consent actions activate all currently allowed optional categories.
    // The activator tracks individual scripts, so repeat calls are safe and
    // also handle scripts that were injected after the first consent action.
    try {
      if (method === 'acceptAll' || method === 'savePreferences') {
        activateAllowedScripts();
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
    let consentState = 'none';
    if (stored) {
      const hydrated = hydrateStoredConsent(stored);
      // If revision changed, reset stored consent
      if (hydrated && hydrated.revision && config.revision && hydrated.revision !== config.revision) {
        const old = { ...hydrated };
        try { storage.remove(config.storageKey); } catch (e) {}
        try { removeCookie(config.cookieName, { path: '/' }); } catch (e) {}
        consent = getDefaultConsent(config);
        consentState = 'none';
        // centralized notification about revision reset
        try { notifyChange(old, 'revision', 'api'); } catch (e) { /* ignore */ }
      } else {
        consent = hydrated || getDefaultConsent(config);
        consentState = resolveConsentState();
      }
    } else {
      consent = getDefaultConsent(config);
    }
    writeUserType(resolveUserType(consentState));

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
    const initialConsent = toPublicConsent(consent);
    emitter.emit('consent:ready', { consent: initialConsent });
    if (typeof config.onInit === 'function') {
      try { config.onInit(initialConsent); } catch (e) { console.error(e); }
    }

    const shouldShowBanner = consentState === 'none' || consentState === 'rejected';
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
    // Activate blocked script tags for stored consent on returning visits.
    try { activateAllowedScripts(); } catch (e) { console.error('ConsentFlow activation error', e); }

    return Promise.resolve(toPublicConsent(consent));
  }

  // Opens the preferences modal for granular category controls.
  function openPreferences() { widget && widget.open(); }

  // Deprecated alias kept for existing integrations. Use openPreferences().
  function open() { openPreferences(); }

  function close() { widget && widget.close(); }
  function showBanner() { widget && widget.showBanner(); }

  function _updateCategories(newCats, method = 'savePreferences') {
    const old = JSON.parse(JSON.stringify(consent));
    consent.categories = ensureCategories({ ...consent.categories, ...newCats });
    consent.status = resolveStoredStatus(consent);
    consent.timestamp = new Date().toISOString();
    writeUserType(resolveUserType(resolveConsentState()));
    persistNow();
    notifyChange(old, method, 'api');
    return toPublicConsent(consent);
  }

  // Grants all supported consent categories.
  function acceptAll() {
    const all = {};
    CATEGORIES.forEach(k => { all[k] = (k === 'necessary') ? true : true; });
    return _updateCategories(all, 'acceptAll');
  }

  // Rejects all optional categories while keeping necessary enabled.
  function rejectAll() {
    const all = {};
    CATEGORIES.forEach(k => { all[k] = (k === 'necessary') ? true : false; });
    return _updateCategories(all, 'rejectAll');
  }

  // Saves a partial preferences object, e.g. { analytics: true, marketing: false }.
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

  // Returns the public flat consent object.
  function getConsent() { return toPublicConsent(consent); }

  // Checks whether a category is currently allowed.
  function hasConsent(category) {
    if (category === 'necessary') return true;
    if (!CATEGORIES.includes(category)) return false;
    if (!consent) return false;
    return Boolean(consent.categories && consent.categories[category]);
  }

  // Clears stored consent and returns the SDK to first-time state.
  function reset() {
    const old = JSON.parse(JSON.stringify(consent));
    consent = {
      version: 1,
      status: 'none',
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
    return toPublicConsent(consent);
  }

  function destroy() {
    if (widget) { widget.destroy(); widget = null; }
    // remove listeners
    emitter.off('consent:change');
    emitter.off('consent:ready');
  }

  const api = {
    // Initializes ConsentFlow. Safe to call without options.
    init,
    // Grants all optional consent categories.
    acceptAll,
    // Rejects all optional consent categories.
    rejectAll,
    // Saves selected category preferences.
    savePreferences,
    // Reads the current public consent object.
    getConsent,
    // Checks whether one category is allowed.
    hasConsent,
    // Clears stored consent and cookies.
    reset,
    // Opens the preferences modal.
    openPreferences,

    // Backward-compatible aliases / advanced helpers.
    open,
    close,
    showBanner,
    destroy,
    on: emitter.on,
    off: emitter.off,
    // Optional manual activation helper; still respects current consent state.
    activateScripts: (cat) => activateScriptsForCategories(Array.isArray(cat) ? cat : [cat], consent)
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
