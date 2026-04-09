// Script activator for ConsentFlow
// Detects <script type="text/plain" data-consent="..."></script>
// and activates them when consent is granted.

const PROCESSED_ATTR = 'data-cf-processed';
const EXECUTED_ATTR = 'data-cf-executed';

let debug = false;
const activatedCategories = new Set();

function log(...args) { if (debug && typeof console !== 'undefined') console.log('[ConsentFlow activator]', ...args); }

function parseCategoriesAttr(value) {
  if (!value) return [];
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function copyAttributes(srcEl, destEl) {
  const exclude = new Set(['type', 'data-consent', PROCESSED_ATTR]);
  Array.from(srcEl.attributes || []).forEach(attr => {
    const name = attr.name;
    const val = attr.value;
    if (exclude.has(name)) return;
    try { destEl.setAttribute(name, val); } catch (e) { /* ignore invalid attrs */ }
  });
}

function activateScriptElement(el) {
  if (!el) return false;
  if (el.getAttribute && el.getAttribute(PROCESSED_ATTR) === 'true') return false;
  const parent = el.parentNode;
  if (!parent) return false;

  try {
    const src = el.getAttribute('src');
    const newScript = document.createElement('script');
    if (src) {
      newScript.src = src;
    } else {
      // inline script: use textContent
      newScript.textContent = el.textContent || '';
    }
    copyAttributes(el, newScript);
    newScript.setAttribute(EXECUTED_ATTR, 'true');
    // Replace in place to preserve execution order
    parent.replaceChild(newScript, el);
    log('activated script', src || '(inline)');
    return true;
  } catch (e) {
    try { el.setAttribute(PROCESSED_ATTR, 'true'); } catch (_) {}
    console.error('ConsentFlow: failed to activate script', e);
    return false;
  }
}

function findBlockedScripts() {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll('script[type="text/plain"][data-consent]'));
}

export function setDebug(flag) { debug = Boolean(flag); }

// Activate scripts for categories if full consent is satisfied
export function activateScriptsForCategories(categories = [], consent = null) {
  if (!Array.isArray(categories)) categories = [categories];
  // filter out already activated categories
  const toProcess = categories.filter(c => !activatedCategories.has(c));
  if (!toProcess.length) return 0;
  let activatedCount = 0;
  const scripts = findBlockedScripts();
  // process in DOM order
  scripts.forEach(el => {
    try {
      if (!el.getAttribute) return;
      if (el.getAttribute(PROCESSED_ATTR) === 'true') return;
      const required = parseCategoriesAttr(el.getAttribute('data-consent'));
      if (!required.length) return;
      // check if all required categories are consented (use consent object if provided)
      const satisfied = required.every(cat => {
        if (cat === 'necessary') return true;
        if (consent && consent.categories && typeof consent.categories[cat] !== 'undefined') {
          return Boolean(consent.categories[cat]);
        }
        // if consent not provided, fallback to activate if the category is in toProcess
        return toProcess.includes(cat);
      });
      if (satisfied) {
        const ok = activateScriptElement(el);
        if (ok) activatedCount++;
      }
    } catch (e) { /* ignore per-script */ }
  });
  // mark categories as activated to avoid re-activation
  toProcess.forEach(c => activatedCategories.add(c));
  return activatedCount;
}

export function activateScripts(category, consent = null) {
  return activateScriptsForCategories(Array.isArray(category) ? category : [category], consent);
}

export function activateAllConsented(consent) {
  if (!consent || !consent.categories) return 0;
  const cats = Object.keys(consent.categories).filter(k => consent.categories[k] === true && k !== 'necessary');
  return activateScriptsForCategories(cats, consent);
}

export function resetActivatedCategories() { activatedCategories.clear(); }

