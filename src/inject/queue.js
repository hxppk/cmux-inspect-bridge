const KEY = '__cmuxInspectQueue';

function initQueue() {
  if (Array.isArray(window[KEY])) return; // 已存在不覆盖
  try {
    const raw = sessionStorage.getItem(KEY);
    window[KEY] = raw ? JSON.parse(raw) : [];
  } catch (e) {
    window[KEY] = [];
  }
}

function syncToStorage() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(window[KEY] || []));
  } catch (e) {}
}

function pushItem(item) {
  if (!Array.isArray(window[KEY])) window[KEY] = [];
  window[KEY].push(item);
  syncToStorage();
}

function peekQueue() {
  return Array.isArray(window[KEY]) ? window[KEY] : [];
}

module.exports = { initQueue, pushItem, peekQueue, syncToStorage };
module.exports.default = { initQueue, pushItem, peekQueue, syncToStorage };
