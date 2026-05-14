// src/watcher/daemon.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listBrowserSurfaces, getKnownSurfaceIds } = require('../lib/surfaces');
const { browserEval, send, readScreen } = require('../lib/cmux');
const { isIdle } = require('../lib/idle');
const { formatPayload } = require('../lib/payload');

const LOG_PATH = path.join(os.homedir(), '.cmux-inspect', 'watcher.log');

function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch (e) {}
}

function pullQueue(surfaceId) {
  try {
    const raw = browserEval(surfaceId, 'JSON.stringify(window.__cmuxInspectQueue || [])');
    return JSON.parse(raw);
  } catch (e) {
    log('warn', `pullQueue failed for ${surfaceId}: ${e.message}`);
    return [];
  }
}

function spliceQueue(surfaceId, n) {
  try {
    const script = `window.__cmuxInspectQueue.splice(0, ${n}); sessionStorage.setItem('__cmuxInspectQueue', JSON.stringify(window.__cmuxInspectQueue));`;
    browserEval(surfaceId, script);
  } catch (e) {
    log('warn', `spliceQueue failed for ${surfaceId}: ${e.message}`);
  }
}

function isTargetIdle(targetRef) {
  try {
    const screen = readScreen(targetRef, 5);
    return isIdle(screen);
  } catch (e) {
    log('warn', `read-screen failed for ${targetRef}: ${e.message}`);
    return false;
  }
}

function tick({ defaultTargetRef }) {
  const browserSurfaces = listBrowserSurfaces();
  const knownIds = getKnownSurfaceIds();

  let pending = [];
  for (const bs of browserSurfaces) {
    const items = pullQueue(bs.id);
    for (const item of items) {
      pending.push({ ...item, __source_surface: bs.id });
    }
  }

  if (pending.length === 0) return 0;

  const consumed = {};
  for (const item of pending) {
    const targetRef = item.target_ref || defaultTargetRef;
    if (!targetRef) {
      log('warn', `item ${item.id} missing target_ref and no default; skipping`);
      continue;
    }
    if (!knownIds.has(targetRef)) {
      log('error', `target_ref ${targetRef} no longer exists (was ${item.target_name}); skipping`);
      continue;
    }
    if (!isTargetIdle(targetRef)) {
      log('info', `target ${targetRef} busy, defer item ${item.id}`);
      continue;
    }
    try {
      send(targetRef, formatPayload(item));
      log('info', `pushed item ${item.id} → ${targetRef}`);
      consumed[item.__source_surface] = (consumed[item.__source_surface] || 0) + 1;
    } catch (e) {
      log('error', `cmux send failed for ${targetRef}: ${e.message}`);
    }
  }

  for (const [bs, n] of Object.entries(consumed)) {
    spliceQueue(bs, n);
  }

  return Object.values(consumed).reduce((a, b) => a + b, 0);
}

async function run({ targetRef, interval = 1500 }) {
  log('info', `daemon started target=${targetRef} interval=${interval}ms pid=${process.pid}`);
  process.on('SIGTERM', () => { log('info', 'SIGTERM received, exiting'); process.exit(0); });
  process.on('SIGINT', () => { log('info', 'SIGINT received, exiting'); process.exit(0); });

  while (true) {
    try { tick({ defaultTargetRef: targetRef }); } catch (e) { log('error', `tick failed: ${e.stack}`); }
    await new Promise(r => setTimeout(r, interval));
  }
}

module.exports = { run, tick };

if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  run({ targetRef: args.target, interval: parseInt(args.interval, 10) || 1500 });
}
