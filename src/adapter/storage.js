// LocalStorage adapter with safe guards
export function read(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

export function write(key, obj) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) { return false; }
}

export function remove(key) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
}
