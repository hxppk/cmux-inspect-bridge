/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initQueue, pushItem, peekQueue } from '../../src/inject/queue.js';

beforeEach(() => {
  delete window.__cmuxInspectQueue;
  sessionStorage.clear();
});

describe('queue', () => {
  it('initQueue creates empty array when no sessionStorage', () => {
    initQueue();
    expect(window.__cmuxInspectQueue).toEqual([]);
  });

  it('initQueue restores from sessionStorage', () => {
    sessionStorage.setItem('__cmuxInspectQueue', JSON.stringify([{ id: 'x' }]));
    initQueue();
    expect(window.__cmuxInspectQueue).toEqual([{ id: 'x' }]);
  });

  it('pushItem appends and syncs to sessionStorage', () => {
    initQueue();
    pushItem({ id: 'a', request: 'r' });
    expect(window.__cmuxInspectQueue).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem('__cmuxInspectQueue'))).toEqual([{ id: 'a', request: 'r' }]);
  });

  it('peekQueue returns current array', () => {
    initQueue();
    pushItem({ id: 'a' });
    pushItem({ id: 'b' });
    expect(peekQueue().map(i => i.id)).toEqual(['a', 'b']);
  });

  it('initQueue is idempotent (does not clobber existing queue)', () => {
    window.__cmuxInspectQueue = [{ id: 'existing' }];
    initQueue();
    expect(window.__cmuxInspectQueue).toEqual([{ id: 'existing' }]);
  });
});
