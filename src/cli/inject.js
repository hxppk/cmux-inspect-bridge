// src/cli/inject.js
const fs = require('fs');
const path = require('path');
const { listBrowserSurfaces } = require('../lib/surfaces');
const { browserAddInitScript, browserAddScript, tree } = require('../lib/cmux');

function readBundle() {
  const dist = path.join(__dirname, '..', '..', 'dist', 'inject.js');
  if (!fs.existsSync(dist)) {
    throw new Error(`dist/inject.js missing; run 'node scripts/build-inject.js' first`);
  }
  return fs.readFileSync(dist, 'utf8');
}

function buildTerminalSnapshot() {
  // 把 terminal surface 列表注入到 window.__cmuxTerminals 供浮层填充下拉
  const terms = tree().surfaces.filter(s => s.type === 'terminal');
  const js = `window.__cmuxTerminals = ${JSON.stringify(terms.map(s => ({ id: s.id, name: s.name, type: 'terminal' })))};`;
  return js;
}

function injectTo(surface, bundle) {
  const snapshot = buildTerminalSnapshot();
  const combined = snapshot + '\n' + bundle;
  browserAddInitScript(surface.id, combined);
  browserAddScript(surface.id, combined);
}

function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--surface') args.surface = argv[++i];
    else if (argv[i] === '--all') args.all = true;
  }

  let targets;
  if (args.surface) {
    targets = listBrowserSurfaces().filter(s => s.id === args.surface);
    if (targets.length === 0) { console.error(`Error: browser surface ${args.surface} not found`); process.exit(2); }
  } else {
    targets = listBrowserSurfaces();
  }

  if (targets.length === 0) {
    console.log('No browser surfaces in current workspace. Open a cmux browser first.');
    return;
  }

  const bundle = readBundle();
  for (const s of targets) {
    try {
      injectTo(s, bundle);
      console.log(`✓ injected → ${s.id} (${s.name || ''})`);
    } catch (e) {
      console.error(`✗ inject failed for ${s.id}: ${e.message}`);
    }
  }
}

module.exports = { run, injectTo, readBundle };
