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
