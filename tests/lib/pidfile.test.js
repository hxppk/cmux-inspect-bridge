import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { writePid, readPid, removePid, isAlive } from '../../src/lib/pidfile.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-pidfile-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pidfile', () => {
  it('writes and reads pid info', () => {
    const file = path.join(tmpDir, 'watcher.pid');
    writePid(file, { pid: 1234, target_ref: 'surface:11', started_at: 1700000000000 });
    const info = readPid(file);
    expect(info).toEqual({ pid: 1234, target_ref: 'surface:11', started_at: 1700000000000 });
  });

  it('readPid returns null when file missing', () => {
    const info = readPid(path.join(tmpDir, 'missing.pid'));
    expect(info).toBeNull();
  });

  it('removePid is idempotent', () => {
    const file = path.join(tmpDir, 'watcher.pid');
    writePid(file, { pid: 1, target_ref: 'surface:1', started_at: 0 });
    removePid(file);
    expect(readPid(file)).toBeNull();
    removePid(file); // 不抛
  });

  it('isAlive(self) returns true', () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it('isAlive(impossibly-high-pid) returns false', () => {
    expect(isAlive(99999999)).toBe(false);
  });
});
