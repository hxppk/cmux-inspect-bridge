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
