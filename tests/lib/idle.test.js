import { describe, it, expect } from 'vitest';
import { isIdle } from '../../src/lib/idle.js';

describe('isIdle', () => {
  it('returns true when screen ends with shell prompt', () => {
    expect(isIdle('some output\n$ ')).toBe(true);
    expect(isIdle('some output\n❯ ')).toBe(true);
    expect(isIdle('output\n> ')).toBe(true);
    expect(isIdle('root output\n# ')).toBe(true);
  });

  it('returns false when agent is mid-output', () => {
    expect(isIdle('thinking...')).toBe(false);
    expect(isIdle('processing query\n░░░░░ 50%')).toBe(false);
  });

  it('ignores trailing whitespace', () => {
    expect(isIdle('$ \n')).toBe(true);
    expect(isIdle('$   ')).toBe(true);
  });

  it('handles empty input', () => {
    expect(isIdle('')).toBe(false);
    expect(isIdle('   ')).toBe(false);
  });
});
