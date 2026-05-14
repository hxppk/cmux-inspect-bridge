const { start, status, stop } = require('../watcher/lifecycle');
const { resolveTarget } = require('../lib/surfaces');

function parseArgs(argv) {
  const out = { mode: null, target: null, interval: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') { out.mode = 'start'; out.target = argv[++i]; }
    else if (a === '--status') { out.mode = 'status'; }
    else if (a === '--stop') { out.mode = 'stop'; }
    else if (a === '--interval') { out.interval = parseFloat(argv[++i]) * 1000; }
  }
  return out;
}

function run(argv) {
  const args = parseArgs(argv);
  const exclusive = ['start', 'status', 'stop'].filter(m => args.mode === m);
  if (exclusive.length !== 1) {
    console.error('Error: watch requires exactly one of --target <name|ref> | --status | --stop');
    process.exit(2);
  }

  if (args.mode === 'start') {
    let ref;
    try { ref = resolveTarget(args.target); } catch (e) { console.error(`Error: ${e.message}`); process.exit(2); }
    if (!ref) { console.error(`Error: target "${args.target}" not found`); process.exit(2); }
    try {
      const r = start({ targetRef: ref, interval: args.interval });
      console.log(`✓ daemon started`);
      console.log(`  pid:        ${r.pid}`);
      console.log(`  target_ref: ${r.target_ref}`);
      console.log(`  log:        ${r.log_file}`);
    } catch (e) {
      console.error(`Error: ${e.message}`); process.exit(1);
    }
  } else if (args.mode === 'status') {
    const s = status();
    if (!s.running) { console.log('daemon: not running' + (s.stale_pid ? ` (stale pid ${s.stale_pid})` : '')); return; }
    console.log(`daemon: running`);
    console.log(`  pid:        ${s.pid}`);
    console.log(`  target_ref: ${s.target_ref}`);
    console.log(`  started_at: ${new Date(s.started_at).toISOString()}`);
    console.log(`  log:        ${s.log_file}`);
  } else if (args.mode === 'stop') {
    const r = stop();
    if (!r.stopped) { console.log(`daemon: ${r.reason || 'unknown'}`); return; }
    console.log(`✓ daemon stopped${r.signal ? ` (${r.signal})` : ''}${r.was_stale ? ' (was stale)' : ''}`);
  }
}

module.exports = { run };
