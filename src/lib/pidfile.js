const fs = require('fs');
const path = require('path');

function writePid(file, info) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${info.pid}|${info.target_ref}|${info.started_at}`, 'utf8');
}

function readPid(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    const [pid, target_ref, started_at] = raw.split('|');
    return { pid: parseInt(pid, 10), target_ref, started_at: parseInt(started_at, 10) };
  } catch (e) {
    return null;
  }
}

function removePid(file) {
  try { fs.unlinkSync(file); } catch (e) {}
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { writePid, readPid, removePid, isAlive };
