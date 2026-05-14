// src/lib/cmux.js
const { execSync, execFileSync } = require('child_process');

function tree() {
  try {
    const raw = execSync('cmux tree --json', { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch (e) {
    // fallback: 文本解析
    const raw = execSync('cmux tree', { encoding: 'utf8' });
    return parseTreeText(raw);
  }
}

function parseTreeText(text) {
  const surfaces = [];
  let currentWorkspace = null;
  for (const line of text.split('\n')) {
    const wsMatch = line.match(/workspace (workspace:\d+) "([^"]+)"/);
    if (wsMatch) currentWorkspace = wsMatch[2];
    const sMatch = line.match(/surface (surface:\d+) \[(\w+)\] "([^"]+)"/);
    if (sMatch) {
      surfaces.push({
        id: sMatch[1],
        type: sMatch[2],
        name: sMatch[3],
        workspace: currentWorkspace,
      });
    }
  }
  return { surfaces };
}

function browserEval(surfaceId, script) {
  return execFileSync('cmux', ['browser', 'eval', '--surface', surfaceId, script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function browserAddInitScript(surfaceId, script) {
  return execFileSync('cmux', ['browser', 'addinitscript', '--surface', surfaceId, '--script', script], {
    encoding: 'utf8',
  });
}

function browserAddScript(surfaceId, script) {
  return execFileSync('cmux', ['browser', 'addscript', '--surface', surfaceId, '--script', script], {
    encoding: 'utf8',
  });
}

function send(surfaceId, payload) {
  return execFileSync('cmux', ['send', '--surface', surfaceId, payload], {
    encoding: 'utf8',
  });
}

function readScreen(surfaceId, lines = 5) {
  return execFileSync('cmux', ['read-screen', '--surface', surfaceId, '--lines', String(lines)], {
    encoding: 'utf8',
  });
}

module.exports = { tree, browserEval, browserAddInitScript, browserAddScript, send, readScreen, parseTreeText };
