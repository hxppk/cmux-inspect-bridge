import { describe, it, expect } from 'vitest';
import { formatPayload } from '../../src/lib/payload.js';

describe('formatPayload', () => {
  it('outputs single-line semicolon-separated string with all fields', () => {
    const item = {
      id: 'wt-1',
      ts: 1715680000000,
      url: 'https://example.com/p#/q',
      selector: 'button.x',
      outerHTML: '<button class="x">点</button>',
      request: '把这个按钮颜色改浅一点',
      target_name: 'qwen',
      target_ref: 'surface:11',
    };
    const out = formatPayload(item);
    expect(out).not.toContain('\n');
    expect(out).toContain('[cmux-inspect]');
    expect(out).toContain('url=https://example.com/p#/q');
    expect(out).toContain('selector=button.x');
    expect(out).toContain('html=<button class="x">点</button>');
    expect(out).toContain('需求=把这个按钮颜色改浅一点');
  });

  it('truncates html field when total exceeds 2KB', () => {
    const item = {
      id: 'wt-2',
      ts: 0,
      url: 'u',
      selector: 's',
      outerHTML: 'x'.repeat(3000),
      request: 'r',
      target_name: 'qwen',
      target_ref: 'surface:11',
    };
    const out = formatPayload(item);
    expect(out.length).toBeLessThanOrEqual(2048);
    expect(out).toContain('...truncated');
  });

  it('strips newlines from request and outerHTML defensively', () => {
    const item = {
      id: 'wt-3',
      ts: 0,
      url: 'u',
      selector: 's',
      outerHTML: '<a>\nhello\n</a>',
      request: '行一\n行二',
      target_name: 'qwen',
      target_ref: 'surface:11',
    };
    const out = formatPayload(item);
    expect(out).not.toContain('\n');
  });
});
