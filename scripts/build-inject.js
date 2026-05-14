#!/usr/bin/env node
// scripts/build-inject.js
// Bundle src/inject/*.js → dist/inject.js (IIFE, browser-safe eval)
const fs = require('fs');
const path = require('path');

// Order matters: dependencies must be defined before dependent modules
// main.js requires: selector, queue, overlay, teardown
// so we define those first, then main
const MODULES = [
  'src/inject/teardown.js',
  'src/inject/selector.js',
  'src/inject/queue.js',
  'src/inject/overlay.js',
  'src/inject/main.js',
];

function inline() {
  let out = '(function(){\n  "use strict";\n  const __mods = {};\n  const __fns = {};\n  function __def(name, fn){ __fns[name] = fn; }\n  function require(name){ const normalized = name.replace(/^\\.\\.\\//, "").replace(/^\\.\\//, "").replace(/\\.js$/, ""); if (!__mods[normalized] && __fns[normalized]) { const module = { exports: {} }; __fns[normalized](module, module.exports); __mods[normalized] = module.exports; } return __mods[normalized]; }\n';

  for (const file of MODULES) {
    const body = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const name = path.basename(file, '.js');
    out += `\n  __def('${name}', function(module, exports){\n${body}\n});\n`;
  }

  // Execute main to trigger the initialization
  out += '\n  require("main");\n';
  out += '\n})();';
  return out;
}

function main() {
  const bundled = inline();
  const outPath = path.join(__dirname, '..', 'dist', 'inject.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bundled, 'utf8');
  console.log(`✓ Bundled ${MODULES.length} modules → ${outPath} (${bundled.length} bytes)`);
}

main();
