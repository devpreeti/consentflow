
// ConsentFlow SDK entry
// Usage example (inline before SDK loads):
// <script>
//   window.ConsentFlowQ = window.ConsentFlowQ || [];
//   window.ConsentFlowQ.push(['init', { locale: 'en', storageKey: 'consentflow_v1' }]);
// </script>
// <script async src="/dist/consentflow.min.js"></script>

import createManager from './core/manager.js';

// Ensure global queue exists early so inline snippets can safely push before SDK loads
if (typeof window !== 'undefined') {
  window.ConsentFlowQ = window.ConsentFlowQ || [];
}

const manager = createManager();

// Guard to ensure init() runs only once
let initCalled = false;
let initPromise = null;

function safeCall(method, ...args) {
  try {
    const fn = manager[method];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(manager, args);
  } catch (err) {
    // Swallow to avoid breaking host page; surface in console for debugging
    if (typeof console !== 'undefined' && console.error) console.error('ConsentFlow method error', err);
    return undefined;
  }
}

function initWrapper(...args) {
  if (initCalled) return initPromise || Promise.resolve();
  initCalled = true;
  try {
    const res = manager.init(...args);
    initPromise = Promise.resolve(res);
    return initPromise;
  } catch (err) {
    initPromise = Promise.reject(err);
    return initPromise;
  }
}

const api = {
  init: initWrapper,
  open: (...a) => safeCall('open', ...a),
  openPreferences: (...a) => safeCall('openPreferences', ...a),
  close: (...a) => safeCall('close', ...a),
  acceptAll: (...a) => safeCall('acceptAll', ...a),
  rejectAll: (...a) => safeCall('rejectAll', ...a),
  savePreferences: (...a) => safeCall('savePreferences', ...a),
  getConsent: (...a) => safeCall('getConsent', ...a),
  hasConsent: (...a) => safeCall('hasConsent', ...a),
  reset: (...a) => safeCall('reset', ...a),
  destroy: (...a) => safeCall('destroy', ...a),
  on: (...a) => safeCall('on', ...a),
  off: (...a) => safeCall('off', ...a)
};

// Queue handling: window.ConsentFlowQ
async function flushQueue() {
  if (typeof window === 'undefined') return;
  const q = Array.isArray(window.ConsentFlowQ) ? window.ConsentFlowQ : [];
  if (!q.length) return;

  // Determine whether an init call exists in the queue
  const hasInit = q.some(it => Array.isArray(it) && it[0] === 'init');

  while (q.length) {
    const item = q.shift();
    if (!Array.isArray(item)) continue;
    const [method, ...args] = item;

    if (method === 'init') {
      // enforce single init and wait for it to resolve before continuing
      try { await initWrapper(...args); } catch (e) { /* swallow */ }
      continue;
    }

    // If an init was or is being executed, wait for it to settle before running other calls
    if (hasInit || initCalled) {
      if (initPromise) {
        try { await initPromise; } catch (e) { /* swallow */ }
      }
    }

    safeCall(method, ...args);
  }

  // Clear queue to avoid accidental re-processing
  try { window.ConsentFlowQ.length = 0; } catch (e) { /* ignore */ }
}

// Ensure `activateScripts` is exposed and then merge the API with any existing `window.ConsentFlow`
api.activateScripts = (...a) => safeCall('activateScripts', ...a);

// Expose global API by merging with any existing `window.ConsentFlow`
if (typeof window !== 'undefined') {
  window.ConsentFlow = {
    ...(window.ConsentFlow || {}),
    ...api
  };
  // Drain any queued calls after a tick so page inline scripts can enqueue
  if (window.ConsentFlowQ.length) setTimeout(() => { flushQueue().catch(()=>{}); }, 0);
}

export default api;
