// src/watcher/lifecycle.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writePid, readPid, removePid, isAlive } = require('../lib/pidfile');

const DAEMON_DIR = path.join(os.homedir(), '.cmux-inspect');
const PID_FILE = path.join(DAEMON_DIR, 'watcher.pid');
const LOG_FILE = path.join(DAEMON_DIR, 'watcher.log');
const DAEMON_SCRIPT = path.join(__dirname, 'daemon.js');

function start({ targetRef, interval = 1500 }) {
  fs.mkdirSync(DAEMON_DIR, { recursive: true });

  const existing = readPid(PID_FILE);
  if (existing && isAlive(existing.pid)) {
    throw new Error(`daemon already running (pid=${existing.pid}, target=${existing.target_ref}); run 'watch --stop' first`);
  }
  if (existing) removePid(PID_FILE);  // stale pid

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(
    process.execPath,
    [DAEMON_SCRIPT, '--target', targetRef, '--interval', String(interval)],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    }
  );
  child.unref();
  fs.closeSync(logFd);

  writePid(PID_FILE, { pid: child.pid, target_ref: targetRef, started_at: Date.now() });

  return { pid: child.pid, target_ref: targetRef, log_file: LOG_FILE };
}

function status() {
  const info = readPid(PID_FILE);
  if (!info) return { running: false };
  if (!isAlive(info.pid)) return { running: false, stale_pid: info.pid };
  return { running: true, ...info, log_file: LOG_FILE };
}

function stop({ timeoutMs = 5000 } = {}) {
  const info = readPid(PID_FILE);
  if (!info) return { stopped: false, reason: 'no pid file' };
  if (!isAlive(info.pid)) { removePid(PID_FILE); return { stopped: true, was_stale: true }; }

  try { process.kill(info.pid, 'SIGTERM'); } catch (e) {}

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(info.pid)) {
      removePid(PID_FILE);
      return { stopped: true, signal: 'SIGTERM' };
    }
    // busy wait 50ms
    require('child_process').execSync('sleep 0.05');
  }

  // force kill
  try { process.kill(info.pid, 'SIGKILL'); } catch (e) {}
  removePid(PID_FILE);
  return { stopped: true, signal: 'SIGKILL' };
}

module.exports = { start, status, stop, PID_FILE, LOG_FILE };
