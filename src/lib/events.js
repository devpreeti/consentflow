// Tiny event emitter
export default function createEmitter() {
  const handlers = new Map();

  function on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return fn;
  }

  function off(name, fn) {
    if (!handlers.has(name)) return;
    if (!fn) { handlers.delete(name); return; }
    handlers.get(name).delete(fn);
  }

  function once(name, fn) {
    const wrapper = (...args) => {
      try { fn(...args); } finally { off(name, wrapper); }
    };
    return on(name, wrapper);
  }

  function emit(name, ...args) {
    const set = handlers.get(name);
    if (!set) return;
    // Copy to avoid mutation during iteration
    Array.from(set).forEach(fn => {
      try { fn(...args); } catch (e) { console.error('ConsentFlow event handler error', e); }
    });
  }

  return { on, off, once, emit };
}
