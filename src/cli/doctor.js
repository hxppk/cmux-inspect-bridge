// src/cli/doctor.js
const { execSync } = require('child_process');
const { listBrowserSurfaces, listTerminalSurfaces } = require('../lib/surfaces');
const { browserEval } = require('../lib/cmux');
const { status } = require('../watcher/lifecycle');

function run() {
  console.log('cmux-inspect-bridge doctor');
  console.log('---------------------------------');

  // 1. cmux 命令是否存在
  try {
    const v = execSync('cmux --version', { encoding: 'utf8' }).trim();
    console.log(`✓ cmux CLI: ${v}`);
  } catch (e) {
    console.log(`✗ cmux CLI not found: ${e.message}`);
    return;
  }

  // 2. browser surface
  const bss = listBrowserSurfaces();
  console.log(`✓ browser surfaces (${bss.length}):`);
  for (const s of bss) console.log(`    ${s.id} "${s.name || ''}"`);

  // 3. 每个 browser 注入状态 + 队列长度
  for (const s of bss) {
    try {
      const teardown = browserEval(s.id, 'typeof window.__cmuxInspectTeardown').trim();
      const qlen = browserEval(s.id, '(window.__cmuxInspectQueue||[]).length').trim();
      console.log(`    ${s.id}: injected=${teardown === 'function'}, queue=${qlen}`);
    } catch (e) {
      console.log(`    ${s.id}: eval failed (${e.message})`);
    }
  }

  // 4. terminal surface
  const tss = listTerminalSurfaces();
  console.log(`✓ terminal surfaces (${tss.length}):`);
  for (const s of tss) console.log(`    ${s.id} "${s.name || ''}"`);

  // 5. daemon 状态
  const ds = status();
  if (ds.running) {
    console.log(`✓ daemon: running (pid=${ds.pid}, target=${ds.target_ref})`);
  } else {
    console.log(`✗ daemon: not running${ds.stale_pid ? ` (stale pid ${ds.stale_pid})` : ''}`);
  }
}

module.exports = { run };
