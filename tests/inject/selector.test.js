/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { genSelector } from '../../src/inject/selector.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('genSelector', () => {
  it('prefers id when present', () => {
    document.body.innerHTML = '<button id="submit-btn">x</button>';
    const el = document.getElementById('submit-btn');
    expect(genSelector(el)).toBe('#submit-btn');
  });

  it('escapes id with special chars', () => {
    document.body.innerHTML = '<button id="my:btn">x</button>';
    const el = document.querySelector('button');
    expect(genSelector(el)).toBe('#my\\:btn');
  });

  it('uses data-testid when present and no id', () => {
    document.body.innerHTML = '<button data-testid="login-button">x</button>';
    const el = document.querySelector('button');
    expect(genSelector(el)).toBe('[data-testid="login-button"]');
  });

  it('falls back to tag + class[0..3] + nth-of-type', () => {
    document.body.innerHTML = `
      <div>
        <button class="ant-btn ant-btn-primary ant-btn-lg extra extra2">A</button>
        <button class="ant-btn ant-btn-primary ant-btn-lg extra extra2">B</button>
      </div>`;
    const buttons = document.querySelectorAll('button');
    const sel = genSelector(buttons[1]);
    expect(sel).toContain('button');
    expect(sel).toContain('.ant-btn');
    expect(sel).toContain('nth-of-type(2)');
    // 最多 3 个 class
    expect((sel.match(/\./g) || []).length).toBeLessThanOrEqual(3);
  });

  it('escapes class names with colons (antd 风格)', () => {
    document.body.innerHTML = '<div class="hover:bg-red md:p-4">x</div>';
    const el = document.querySelector('div');
    const sel = genSelector(el);
    expect(sel).toContain('hover\\:bg-red');
    expect(sel).toContain('md\\:p-4');
  });
});
