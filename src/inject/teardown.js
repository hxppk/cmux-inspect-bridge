const TEARDOWN_KEY = '__cmuxInspectTeardown';

function registerTeardown(fn) {
  // 先调旧 teardown（如果存在）
  if (typeof window[TEARDOWN_KEY] === 'function') {
    try { window[TEARDOWN_KEY](); } catch (e) {}
  }
  window[TEARDOWN_KEY] = fn;
}

function callTeardown() {
  if (typeof window[TEARDOWN_KEY] === 'function') {
    try { window[TEARDOWN_KEY](); } catch (e) {}
    delete window[TEARDOWN_KEY];
  }
}

module.exports = { registerTeardown, callTeardown, TEARDOWN_KEY };
