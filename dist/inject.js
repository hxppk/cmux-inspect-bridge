(function(){
  "use strict";
  const __mods = {};
  const __fns = {};
  function __def(name, fn){ __fns[name] = fn; }
  function require(name){ const normalized = name.replace(/^\.\.\//, "").replace(/^\.\//, "").replace(/\.js$/, ""); if (!__mods[normalized] && __fns[normalized]) { const module = { exports: {} }; __fns[normalized](module, module.exports); __mods[normalized] = module.exports; } return __mods[normalized]; }

  __def('teardown', function(module, exports){
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

});

  __def('selector', function(module, exports){
// CSS.escape polyfill for jsdom/test environments
function cssEscape(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(str);
  }
  // Simple polyfill: escape special CSS characters
  return str.replace(/[!"#$%&'()*+,./:;=?@[\\\]^`{|}~\s]/g, '\\$&');
}

function genSelector(el) {
  if (!el || el.nodeType !== 1) return '';

  // 1. prefer id
  if (el.id) return '#' + cssEscape(el.id);

  // 2. data-testid / data-test
  const testid = el.getAttribute('data-testid') || el.getAttribute('data-test');
  if (testid) return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;

  // 3. tag + class[0..3] + nth-of-type
  const tag = el.tagName.toLowerCase();
  const classes = (el.className && typeof el.className === 'string')
    ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
    : [];
  const classPart = classes.map(c => '.' + cssEscape(c)).join('');

  // nth-of-type only if sibling exists with same tag
  const parent = el.parentElement;
  let nth = '';
  if (parent) {
    const same = [...parent.children].filter(c => c.tagName === el.tagName);
    if (same.length > 1) {
      const idx = same.indexOf(el) + 1;
      nth = `:nth-of-type(${idx})`;
    }
  }

  return tag + classPart + nth;
}

module.exports = { genSelector };
module.exports.default = { genSelector };

});

  __def('queue', function(module, exports){
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

});

  __def('overlay', function(module, exports){
const OVERLAY_ID = '__cmux_inspect_overlay';

function buildOverlayHTML(captured, terminalSurfaces, defaultTargetRef) {
  const targetOptions = terminalSurfaces.map(s => {
    const ref = s.id;
    const label = s.name ? `${s.name} [${ref}]` : ref;
    const selected = ref === defaultTargetRef ? ' selected' : '';
    return `<option value="${ref}" data-name="${s.name || ''}"${selected}>${label}</option>`;
  }).join('');

  return `
    <div id="${OVERLAY_ID}" style="
      position: fixed; z-index: 999999; min-width: 360px; max-width: 480px;
      background: rgba(20,20,30,0.96); color: #f0f0f5; border-radius: 8px;
      padding: 12px; font: 13px -apple-system, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
    ">
      <details style="margin-bottom: 8px; cursor: pointer;">
        <summary style="opacity: 0.7; word-break: break-all;">${escapeHtml(captured.selector)}</summary>
        <pre style="margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.3); overflow: auto; max-height: 120px; white-space: pre-wrap; font-size: 11px;">${escapeHtml(captured.outerHTML.slice(0, 500))}</pre>
      </details>
      <textarea data-role="request" placeholder="描述需求..." rows="3" style="
        width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3);
        color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
        padding: 6px; font: inherit; resize: vertical;
      "></textarea>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
        <span style="opacity: 0.6;">Target:</span>
        <select data-role="target" style="
          flex: 1; background: rgba(0,0,0,0.3); color: #fff;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 4px;
        ">${targetOptions}</select>
        <button data-action="cancel" style="
          background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.15);
          padding: 4px 10px; border-radius: 4px; cursor: pointer;
        ">ESC</button>
        <button data-action="submit" style="
          background: #3b82f6; color: #fff; border: none;
          padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;
        ">发送 ⏎</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function positionOverlay(overlay, anchorRect) {
  // 默认锚定到元素右下，超出视口则镜像
  const overlayW = overlay.offsetWidth || 400;
  const overlayH = overlay.offsetHeight || 200;
  let left = anchorRect.right + 8;
  let top = anchorRect.bottom + 8;
  if (left + overlayW > window.innerWidth) left = Math.max(8, anchorRect.left - overlayW - 8);
  if (top + overlayH > window.innerHeight) top = Math.max(8, anchorRect.top - overlayH - 8);
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function removeOverlay() {
  const old = document.getElementById(OVERLAY_ID);
  if (old) old.remove();
}

function showOverlay({ captured, terminalSurfaces, defaultTargetRef, anchorRect, onSubmit, onCancel }) {
  removeOverlay();
  const wrap = document.createElement('div');
  wrap.innerHTML = buildOverlayHTML(captured, terminalSurfaces, defaultTargetRef).trim();
  const overlay = wrap.firstChild;
  document.body.appendChild(overlay);
  positionOverlay(overlay, anchorRect);

  const textarea = overlay.querySelector('[data-role=request]');
  const select = overlay.querySelector('[data-role=target]');
  textarea.focus();

  const submit = () => {
    const request = textarea.value.trim();
    if (!request) { textarea.focus(); return; }
    const opt = select.selectedOptions[0];
    onSubmit({
      request: request.replace(/\n/g, ' '),
      target_ref: opt.value,
      target_name: opt.dataset.name || opt.value,
    });
    removeOverlay();
  };

  overlay.querySelector('[data-action=submit]').addEventListener('click', submit);
  overlay.querySelector('[data-action=cancel]').addEventListener('click', () => { onCancel(); removeOverlay(); });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    if (e.key === 'Escape') { onCancel(); removeOverlay(); }
  });

  return overlay;
}

module.exports = { showOverlay, removeOverlay, OVERLAY_ID };
module.exports.default = { showOverlay, removeOverlay, OVERLAY_ID };

});

  __def('main', function(module, exports){
const { genSelector } = require('./selector');
const { initQueue, pushItem, peekQueue, syncToStorage } = require('./queue');
const { showOverlay, removeOverlay } = require('./overlay');
const { registerTeardown } = require('./teardown');

function nonce() {
  return 'wt-' + Math.random().toString(36).slice(2, 8);
}

function isInsideOverlay(node) {
  while (node) {
    if (node.id === '__cmux_inspect_overlay') return true;
    node = node.parentElement;
  }
  return false;
}

function singleLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function captureElement(el) {
  return {
    selector: genSelector(el),
    outerHTML: singleLine(el.outerHTML).slice(0, 500),
    url: location.href,
  };
}

// 由 daemon 在 init 时通过 addinitscript 提供 cmux tree 快照（先简单约定为
// inject.js 启动时同步用 cmux tree 输出注入到 window.__cmuxTerminals）
function getTerminalSurfaces() {
  return (window.__cmuxTerminals || []).filter(s => s.type === 'terminal');
}

function main() {
  initQueue();

  const onClick = (e) => {
    if (!e.altKey) return;
    if (isInsideOverlay(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const captured = captureElement(e.target);
    const rect = e.target.getBoundingClientRect();

    showOverlay({
      captured,
      terminalSurfaces: getTerminalSurfaces(),
      defaultTargetRef: window.__cmuxDefaultTargetRef || (getTerminalSurfaces()[0] && getTerminalSurfaces()[0].id) || '',
      anchorRect: rect,
      onSubmit: ({ request, target_ref, target_name }) => {
        pushItem({
          id: nonce(),
          ts: Date.now(),
          url: captured.url,
          selector: captured.selector,
          outerHTML: captured.outerHTML,
          request,
          target_name,
          target_ref,
        });
        flashToast(`✓ 已捕获 / 总 ${peekQueue().length} 条`);
      },
      onCancel: () => {},
    });
  };

  document.addEventListener('click', onClick, true);

  registerTeardown(() => {
    document.removeEventListener('click', onClick, true);
    removeOverlay();
  });
}

function flashToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999998;
    background: rgba(20,20,30,0.92); color: #4ade80; padding: 8px 14px;
    border-radius: 6px; font: 12px -apple-system, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

main();

});

  require("main");

})();