// src/lib/surfaces.js
const cmux = require('./cmux');

// Export a function to allow tests to override cmux
let _cmux = cmux;
function setCmux(newCmux) {
  _cmux = newCmux;
}

function listBrowserSurfaces() {
  return _cmux.tree().surfaces.filter(s => s.type === 'browser');
}

function listTerminalSurfaces() {
  return _cmux.tree().surfaces.filter(s => s.type === 'terminal');
}

function resolveTarget(targetSpec) {
  // surface:N → use directly
  if (/^surface:\d+$/.test(targetSpec)) return targetSpec;
  // otherwise treat as name, look up in terminal surfaces
  const matches = listTerminalSurfaces().filter(s => s.name === targetSpec);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`ambiguous target name "${targetSpec}": ${matches.map(m => m.id).join(', ')}; use surface ref instead`);
  }
  return matches[0].id;
}

function getKnownSurfaceIds() {
  return new Set(_cmux.tree().surfaces.map(s => s.id));
}

module.exports = { listBrowserSurfaces, listTerminalSurfaces, resolveTarget, getKnownSurfaceIds, setCmux };
