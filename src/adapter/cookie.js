// Cookie adapter using bitmask encoding for categories
const CATEGORIES = Object.freeze(['necessary', 'analytics', 'marketing']);

// Explicit index mapping for stability. The removed "preferences" bit is kept
// reserved so existing cookies using the old bitmask still decode safely.
export const CATEGORY_INDEX = Object.freeze({
  necessary: 0,
  analytics: 1,
  marketing: 3
});

function toBitmask(categories) {
  let mask = 0;
  if (!categories || typeof categories !== 'object') return mask;
  Object.keys(CATEGORY_INDEX).forEach(key => {
    const idx = CATEGORY_INDEX[key];
    if (categories[key]) mask |= (1 << idx);
  });
  // always force necessary bit
  mask |= (1 << CATEGORY_INDEX.necessary);
  return mask;
}

function fromBitmask(mask) {
  const out = {};
  if (typeof mask !== 'number' || Number.isNaN(mask)) mask = 0;
  Object.keys(CATEGORY_INDEX).forEach(key => {
    const idx = CATEGORY_INDEX[key];
    out[key] = Boolean(mask & (1 << idx));
  });
  // ensure necessary true
  out.necessary = true;
  return out;
}

// Encode categories -> string (bitmask) optionally with revision suffix
export function encodeConsent(categories, revision) {
  const mask = toBitmask(categories);
  const rev = revision ? String(revision).replace(/\|/g, '') : '';
  return rev ? `${mask}|r${rev}` : String(mask);
}

// Decode cookie value into { categories, revision } or null when invalid/missing
export function decodeConsent(value) {
  if (value === null || typeof value === 'undefined') return null;
  try {
    const str = String(value).trim();
    if (!str) return null;
    // limit split to two parts to avoid unexpected extra segments
    const parts = str.split('|', 2);
    const maskStr = (parts[0] || '').trim();
    if (!maskStr) return null;
    const mask = parseInt(maskStr, 10);
    // validate numeric mask and range. Keep accepting old bit 2 values.
    const maxMask = (1 << 4) - 1;
    if (Number.isNaN(mask) || mask < 0 || mask > maxMask) return null;
    const revPart = parts[1];
    const revision = (revPart && String(revPart).startsWith('r') && revPart.length > 1) ? String(revPart).slice(1) : null;
    return { categories: fromBitmask(mask), revision };
  } catch (e) {
    return null;
  }
}

// Write cookie with safe flags
export function setCookie(name, value, options = {}) {
  if (typeof document === 'undefined') return false;
  try {
    const maxAge = options.maxAge || 31536000; // 1 year
    const path = options.path || '/';
    const sameSite = options.sameSite || 'Lax';
    const secure = typeof options.secure === 'boolean' ? options.secure : (typeof location !== 'undefined' && location && location.protocol === 'https:');
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(String(value == null ? '' : value))}`];
    parts.push(`Max-Age=${maxAge}`);
    parts.push(`Path=${path}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (secure) parts.push('Secure');
    if (sameSite) parts.push(`SameSite=${sameSite}`);
    document.cookie = parts.join('; ');
    return true;
  } catch (e) {
    return false;
  }
}

export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const cookieStr = document.cookie || '';
    const cookies = cookieStr ? cookieStr.split('; ') : [];
    for (let c of cookies) {
      const idx = c.indexOf('=');
      if (idx === -1) continue;
      const k = decodeURIComponent(c.slice(0, idx));
      const v = decodeURIComponent(c.slice(idx + 1));
      if (k === name) return v;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function removeCookie(name) {
  return setCookie(name, '', { maxAge: 0, path: '/' });
}

// Backwards-compatible exports
export const encodeCookie = encodeConsent;
export const decodeCookie = decodeConsent;
export const writeCookie = setCookie;
export const readCookie = getCookie;

export { CATEGORIES };
