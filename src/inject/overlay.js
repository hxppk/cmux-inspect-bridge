const OVERLAY_ID = '__cmux_inspect_overlay';
const HIGHLIGHT_ID = '__cmux_inspect_highlight';

function buildOverlayHTML(captured, terminalSurfaces, defaultTargetRef) {
  const targetOptions = terminalSurfaces.map(s => {
    const ref = s.id;
    const label = s.name ? `${s.name} [${ref}]` : ref;
    const selected = ref === defaultTargetRef ? ' selected' : '';
    return `<option value="${ref}" data-name="${s.name || ''}"${selected}>${label}</option>`;
  }).join('');

  return `
    <div id="${OVERLAY_ID}" style="
      position: fixed; z-index: 999999; width: 420px; max-width: calc(100vw - 16px);
      box-sizing: border-box;
      background: rgba(20,20,30,0.96); color: #f0f0f5; border-radius: 8px;
      padding: 12px; font: 13px -apple-system, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
    ">
      <details style="margin-bottom: 8px; cursor: pointer;">
        <summary style="opacity: 0.7; word-break: break-all;">${escapeHtml(captured.selector)}</summary>
        <pre style="margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.3); overflow: auto; max-height: 120px; white-space: pre-wrap; word-break: break-all; font-size: 11px;">${escapeHtml(captured.outerHTML.slice(0, 500))}</pre>
      </details>
      <textarea data-role="request" placeholder="描述需求..." rows="3" style="
        width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3);
        color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
        padding: 6px; font: inherit; resize: vertical;
      "></textarea>
      <div style="display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
        <span style="opacity: 0.6; flex-shrink: 0;">Target:</span>
        <select data-role="target" style="
          flex: 1 1 140px; min-width: 0; background: rgba(0,0,0,0.3); color: #fff;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 4px;
        ">${targetOptions}</select>
        <button data-action="cancel" style="
          background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.15);
          padding: 4px 10px; border-radius: 4px; cursor: pointer; flex-shrink: 0;
        ">ESC</button>
        <button data-action="submit" style="
          background: #3b82f6; color: #fff; border: none;
          padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600; flex-shrink: 0;
        ">发送 ⏎</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function positionOverlay(overlay, anchorRect) {
  // 默认锚定到元素右下；超视口则镜像/夹紧到视口内
  const M = 8; // viewport 边距
  const overlayW = overlay.offsetWidth || 420;
  const overlayH = overlay.offsetHeight || 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 横向：优先右下，溢出右边则改左侧；最后用 clamp 兜底
  let left = anchorRect.right + M;
  if (left + overlayW > vw - M) left = anchorRect.left - overlayW - M;
  left = Math.max(M, Math.min(left, vw - overlayW - M));

  // 纵向：优先下方，溢出底部则改上方；最后用 clamp 兜底
  let top = anchorRect.bottom + M;
  if (top + overlayH > vh - M) top = anchorRect.top - overlayH - M;
  top = Math.max(M, Math.min(top, vh - overlayH - M));

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function showHighlight(anchorRect) {
  removeHighlight();
  const hl = document.createElement('div');
  hl.id = HIGHLIGHT_ID;
  hl.style.cssText = `
    position: fixed;
    left: ${anchorRect.left - 2}px;
    top: ${anchorRect.top - 2}px;
    width: ${anchorRect.width + 4}px;
    height: ${anchorRect.height + 4}px;
    z-index: 999998;
    pointer-events: none;
    border: 2px dashed #3b82f6;
    border-radius: 4px;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.18), 0 0 12px rgba(59,130,246,0.6);
    transition: opacity 0.15s;
  `;
  document.body.appendChild(hl);
  return hl;
}

function removeHighlight() {
  const old = document.getElementById(HIGHLIGHT_ID);
  if (old) old.remove();
}

function removeOverlay() {
  const old = document.getElementById(OVERLAY_ID);
  if (old) old.remove();
  removeHighlight();
}

function showOverlay({ captured, terminalSurfaces, defaultTargetRef, anchorRect, onSubmit, onCancel }) {
  removeOverlay();
  showHighlight(anchorRect);
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

module.exports = { showOverlay, removeOverlay, OVERLAY_ID, HIGHLIGHT_ID };
module.exports.default = { showOverlay, removeOverlay, OVERLAY_ID, HIGHLIGHT_ID };
