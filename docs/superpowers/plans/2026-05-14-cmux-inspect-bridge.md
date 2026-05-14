# cmux-inspect-bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 cmux-inspect-bridge v0.1.0 —— 在 cmux browser 内 Alt+Click 元素 → 浮层提需求 → 自动推到 claude/qwen 输入框（替代截图工作流）。

**Architecture:** 三件套 — (1) 浏览器侧 inject.js（浮层 + click 监听 + 队列 + sessionStorage 持久化）；(2) Node detached daemon（轮询所有 cmux browser surface + busy 检测 + cmux send 推送）；(3) CLI 包装 + slash skill 入口。完全依赖 cmux CLI（`browser eval / addinitscript / addscript / send / tree / read-screen`），不引入 HTTP server / Chrome 扩展 / Vite 插件。

**Tech Stack:**
- Node.js >=18（CommonJS for simplicity, no TS）
- 无 runtime 依赖（仅 stdlib: child_process / fs / path / readline）
- 测试：vitest（dev dep）+ jsdom（dev dep，给浏览器侧代码用）
- bundle：手写 cat 拼装 inject.js（无 esbuild 依赖）

**仓库**：[hxppk/cmux-inspect-bridge](https://github.com/hxppk/cmux-inspect-bridge)，所有任务在 `~/cmux-inspect-bridge` 内执行（不在 `推荐系统运营管理后台` 内）。

**Spec**：[docs/specs/2026-05-14-cmux-inspect-bridge-design.md](../specs/2026-05-14-cmux-inspect-bridge-design.md)

---

## 文件结构

```
~/cmux-inspect-bridge/
├── bin/
│   └── cmux-inspect-bridge.js           # CLI 入口（package.json bin）
├── src/
│   ├── lib/
│   │   ├── payload.js                   # InspectItem → single-line 文本
│   │   ├── idle.js                      # 末尾 prompt 检测
│   │   ├── surfaces.js                  # cmux tree 解析 + 缓存
│   │   ├── pidfile.js                   # ~/.cmux-inspect/watcher.pid 读写
│   │   └── cmux.js                      # cmux CLI 调用封装
│   ├── watcher/
│   │   ├── daemon.js                    # 守护进程主循环
│   │   └── lifecycle.js                 # spawn/kill/status
│   ├── inject/
│   │   ├── teardown.js                  # 幂等卸载（window.__cmuxInspectTeardown）
│   │   ├── queue.js                     # window.__cmuxInspectQueue + sessionStorage
│   │   ├── selector.js                  # CSS.escape 包装的 selector 生成
│   │   ├── overlay.js                   # 浮层 DOM 渲染
│   │   └── main.js                      # 入口：listener + 浮层装配
│   └── cli/
│       ├── init.js                      # cmux-inspect-bridge init
│       ├── inject.js                    # cmux-inspect-bridge inject
│       ├── doctor.js                    # cmux-inspect-bridge doctor
│       └── watch.js                     # cmux-inspect-bridge watch --target/--status/--stop
├── skills/
│   └── cmux-inspect/
│       └── SKILL.md                     # /inspect-watch /inspect-status /inspect-stop
├── scripts/
│   └── build-inject.js                  # 手工拼装 inject 模块为 dist/inject.js
├── dist/
│   └── inject.js                        # bundle 后产物（git 跟踪以便分发）
├── tests/
│   ├── lib/
│   │   ├── payload.test.js
│   │   ├── idle.test.js
│   │   └── pidfile.test.js
│   └── inject/
│       └── selector.test.js
├── package.json
├── vitest.config.js
├── .gitignore
├── README.md
└── docs/
    ├── specs/2026-05-14-cmux-inspect-bridge-design.md
    └── superpowers/plans/2026-05-14-cmux-inspect-bridge.md
```

**职责边界**：
- `src/lib/`：跨进程共享的纯函数（无 IO 副作用），TDD 严格覆盖
- `src/watcher/`：daemon 业务逻辑，依赖 lib，调 cmux CLI
- `src/inject/`：浏览器侧代码（CommonJS 模块化写，build-inject.js 拼装成单文件）
- `src/cli/`：用户命令入口，参数解析 + dispatch
- `tests/`：单元测试，仅覆盖 lib 与 inject 的纯逻辑部分；daemon/CLI 整体交手动验收（M0-M4 验收点）

---

## Task 1: 项目骨架 + package.json + .gitignore

**Files:**
- Create: `~/cmux-inspect-bridge/package.json`
- Create: `~/cmux-inspect-bridge/.gitignore`
- Create: `~/cmux-inspect-bridge/vitest.config.js`
- Create: 空目录 `src/lib src/watcher src/inject src/cli skills/cmux-inspect scripts dist tests/lib tests/inject`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "cmux-inspect-bridge",
  "version": "0.1.0",
  "description": "Alt+Click 元素 → 浮层提需求 → 推到 claude/qwen 输入框（替代截图工作流）",
  "type": "commonjs",
  "bin": {
    "cmux-inspect-bridge": "./bin/cmux-inspect-bridge.js"
  },
  "scripts": {
    "build": "node scripts/build-inject.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": [
    "bin",
    "src",
    "dist",
    "skills",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "devDependencies": {
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 .gitignore**

```gitignore
node_modules/
coverage/
*.log
.DS_Store
~/.cmux-inspect/
```

- [ ] **Step 3: 写 vitest.config.js**

```js
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/inject/**', 'jsdom'],
    ],
  },
});
```

- [ ] **Step 4: 创建目录**

```bash
cd ~/cmux-inspect-bridge && mkdir -p src/lib src/watcher src/inject src/cli skills/cmux-inspect scripts dist tests/lib tests/inject bin
```

- [ ] **Step 5: npm install + 验证**

```bash
cd ~/cmux-inspect-bridge && npm install
```

Expected: 成功，node_modules 出现 vitest 和 jsdom。

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore vitest.config.js
git commit -m "chore: 初始化项目骨架 + 测试框架"
```

---

## Task 2: src/lib/payload.js — InspectItem 序列化为单行

**Files:**
- Create: `src/lib/payload.js`
- Test: `tests/lib/payload.test.js`

- [ ] **Step 1: 写测试**

```js
const { describe, it, expect } = require('vitest');
const { formatPayload } = require('../../src/lib/payload');

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
```

- [ ] **Step 2: Run 测试验证失败**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/payload.test.js
```

Expected: FAIL — `Cannot find module .../payload`

- [ ] **Step 3: 写最小实现**

```js
// src/lib/payload.js
const MAX_LEN = 2048;

function singleLine(s) {
  return String(s || '').replace(/\r?\n/g, ' ');
}

function formatPayload(item) {
  const fields = [
    `url=${singleLine(item.url)}`,
    `selector=${singleLine(item.selector)}`,
    `html=${singleLine(item.outerHTML)}`,
    `需求=${singleLine(item.request)}`,
  ];
  let out = `[cmux-inspect] ${fields.join('; ')}`;
  if (out.length > MAX_LEN) {
    // truncate html field
    const overflow = out.length - MAX_LEN + '...truncated'.length;
    const htmlIdx = fields.findIndex(f => f.startsWith('html='));
    const html = fields[htmlIdx].slice('html='.length);
    fields[htmlIdx] = `html=${html.slice(0, html.length - overflow)}...truncated`;
    out = `[cmux-inspect] ${fields.join('; ')}`;
  }
  return out;
}

module.exports = { formatPayload };
```

- [ ] **Step 4: Run 测试验证通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/payload.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/payload.js tests/lib/payload.test.js
git commit -m "feat(lib): payload formatter — InspectItem 序列化为单行"
```

---

## Task 3: src/lib/idle.js — 末尾 prompt 检测

**Files:**
- Create: `src/lib/idle.js`
- Test: `tests/lib/idle.test.js`

- [ ] **Step 1: 写测试**

```js
const { describe, it, expect } = require('vitest');
const { isIdle } = require('../../src/lib/idle');

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
```

- [ ] **Step 2: Run 测试**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/idle.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/lib/idle.js
const PROMPT_RE = /[❯>$#]\s*$/;

function isIdle(screen) {
  if (!screen) return false;
  return PROMPT_RE.test(screen.replace(/\s+$/, ' '));
}

module.exports = { isIdle };
```

注：把末尾空白塌成单个空格再 match，保证 prompt 后零个或多个空白都识别。

- [ ] **Step 4: Run 测试通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/idle.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/idle.js tests/lib/idle.test.js
git commit -m "feat(lib): idle detector — 末尾 prompt 检测"
```

---

## Task 4: src/lib/pidfile.js — pid 文件读写 + 进程验活

**Files:**
- Create: `src/lib/pidfile.js`
- Test: `tests/lib/pidfile.test.js`

- [ ] **Step 1: 写测试**

```js
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { writePid, readPid, removePid, isAlive } = require('../../src/lib/pidfile');

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
```

- [ ] **Step 2: Run 测试**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/pidfile.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/lib/pidfile.js
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
```

- [ ] **Step 4: Run 测试通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/pidfile.test.js
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pidfile.js tests/lib/pidfile.test.js
git commit -m "feat(lib): pidfile — pid 文件读写 + 进程验活"
```

---

## Task 5: src/lib/cmux.js — cmux CLI 调用封装

**Files:**
- Create: `src/lib/cmux.js`

> 这层是薄包装，对 cmux 命令的同步调用 + 错误处理。不做 TDD（依赖外部 cmux 命令），但代码非常短，配合后续 daemon 测试时 mock 这层。

- [ ] **Step 1: 实现**

```js
// src/lib/cmux.js
const { execSync, execFileSync } = require('child_process');

function tree() {
  // 用 --json 拿结构化输出；fallback 解析纯文本（cmux 当前版本可能尚不支持 --json，需求文档建议增）
  const raw = execSync('cmux tree --json', { encoding: 'utf8' });
  return JSON.parse(raw);
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

module.exports = { tree, browserEval, browserAddInitScript, browserAddScript, send, readScreen };
```

- [ ] **Step 2: 烟测 cmux 命令存在**

```bash
cd ~/cmux-inspect-bridge && node -e "console.log(require('./src/lib/cmux').tree().workspaces?.length || 'ok')"
```

Expected: 输出数字或 "ok"；若报错 `cmux tree --json` 不支持，进入 fallback 用 `cmux tree` 文本解析（添加 try/catch + 解析 `surface:N [type] "name"` 行）。

- [ ] **Step 3: 若 --json 不支持，加文本解析 fallback**

替换 `tree()` 实现：

```js
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

module.exports = { tree, browserEval, browserAddInitScript, browserAddScript, send, readScreen, parseTreeText };
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/cmux.js
git commit -m "feat(lib): cmux CLI 调用封装 + tree 文本 fallback"
```

---

## Task 6: src/lib/surfaces.js — surface 解析 + 缓存

**Files:**
- Create: `src/lib/surfaces.js`
- Test: `tests/lib/surfaces.test.js`

- [ ] **Step 1: 写测试**

```js
const { describe, it, expect, vi } = require('vitest');

vi.mock('../../src/lib/cmux', () => ({
  tree: vi.fn(),
}));

const { tree } = require('../../src/lib/cmux');
const { listBrowserSurfaces, resolveTarget, getKnownSurfaceIds } = require('../../src/lib/surfaces');

describe('surfaces', () => {
  it('listBrowserSurfaces filters to type=browser', () => {
    tree.mockReturnValue({
      surfaces: [
        { id: 'surface:1', type: 'terminal', name: 'claude' },
        { id: 'surface:2', type: 'browser', name: 'preview' },
        { id: 'surface:3', type: 'browser', name: 'preview2' },
      ],
    });
    expect(listBrowserSurfaces().map(s => s.id)).toEqual(['surface:2', 'surface:3']);
  });

  it('resolveTarget by surface:N returns that surface', () => {
    tree.mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
      ],
    });
    expect(resolveTarget('surface:11')).toBe('surface:11');
  });

  it('resolveTarget by name returns matching terminal surface id', () => {
    tree.mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
        { id: 'surface:12', type: 'terminal', name: 'claude' },
      ],
    });
    expect(resolveTarget('qwen')).toBe('surface:11');
    expect(resolveTarget('claude')).toBe('surface:12');
  });

  it('resolveTarget by ambiguous name throws', () => {
    tree.mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
        { id: 'surface:99', type: 'terminal', name: 'qwen' },
      ],
    });
    expect(() => resolveTarget('qwen')).toThrow(/ambiguous/);
  });

  it('resolveTarget by unknown name returns null', () => {
    tree.mockReturnValue({ surfaces: [] });
    expect(resolveTarget('nonexistent')).toBeNull();
  });

  it('getKnownSurfaceIds returns set of all surface ids', () => {
    tree.mockReturnValue({
      surfaces: [
        { id: 'surface:1', type: 'terminal' },
        { id: 'surface:2', type: 'browser' },
      ],
    });
    expect(getKnownSurfaceIds()).toEqual(new Set(['surface:1', 'surface:2']));
  });
});
```

- [ ] **Step 2: Run 测试**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/surfaces.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/lib/surfaces.js
const { tree } = require('./cmux');

function listBrowserSurfaces() {
  return tree().surfaces.filter(s => s.type === 'browser');
}

function listTerminalSurfaces() {
  return tree().surfaces.filter(s => s.type === 'terminal');
}

function resolveTarget(targetSpec) {
  // surface:N → use directly
  if (/^surface:\d+$/.test(targetSpec)) return targetSpec;
  // otherwise treat as name, look up in terminal surfaces
  const matches = listTerminalSurfaces().filter(s => s.name === targetSpec);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`ambiguous target name "${targetSpec}": ${matches.map(m => m.id).join(', ')}; use surface ref instead`);
  }
  return matches[0].id;
}

function getKnownSurfaceIds() {
  return new Set(tree().surfaces.map(s => s.id));
}

module.exports = { listBrowserSurfaces, listTerminalSurfaces, resolveTarget, getKnownSurfaceIds };
```

- [ ] **Step 4: Run 测试通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/lib/surfaces.test.js
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/surfaces.js tests/lib/surfaces.test.js
git commit -m "feat(lib): surface 解析 + 缓存"
```

---

## Task 7: src/inject/selector.js — CSS.escape selector 生成

**Files:**
- Create: `src/inject/selector.js`
- Test: `tests/inject/selector.test.js`

- [ ] **Step 1: 写测试（jsdom 环境）**

```js
/**
 * @vitest-environment jsdom
 */
const { describe, it, expect, beforeEach } = require('vitest');
const { genSelector } = require('../../src/inject/selector');

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
```

- [ ] **Step 2: Run 测试**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/inject/selector.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/inject/selector.js
function genSelector(el) {
  if (!el || el.nodeType !== 1) return '';
  // 1. id
  if (el.id) return '#' + CSS.escape(el.id);
  // 2. data-testid / data-test
  const testid = el.getAttribute('data-testid') || el.getAttribute('data-test');
  if (testid) return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;
  // 3. tag + class[0..3] + nth-of-type
  const tag = el.tagName.toLowerCase();
  const classes = (el.className && typeof el.className === 'string')
    ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
    : [];
  const classPart = classes.map(c => '.' + CSS.escape(c)).join('');
  // nth-of-type only if sibling exists with same tag
  const parent = el.parentElement;
  let nth = '';
  if (parent) {
    const same = [...parent.children].filter(c => c.tagName === el.tagName);
    if (same.length > 1) {
      const idx = same.indexOf(el) + 1;
      nth = `:nth-of-type(${idx})`;
    }
  }
  return tag + classPart + nth;
}

module.exports = { genSelector };
```

- [ ] **Step 4: Run 测试通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/inject/selector.test.js
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inject/selector.js tests/inject/selector.test.js
git commit -m "feat(inject): selector generator with CSS.escape"
```

---

## Task 8: src/inject/queue.js — window.__cmuxInspectQueue + sessionStorage

**Files:**
- Create: `src/inject/queue.js`
- Test: `tests/inject/queue.test.js`

- [ ] **Step 1: 写测试（jsdom 环境）**

```js
/**
 * @vitest-environment jsdom
 */
const { describe, it, expect, beforeEach } = require('vitest');
const { initQueue, pushItem, peekQueue } = require('../../src/inject/queue');

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
```

- [ ] **Step 2: Run 测试**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/inject/queue.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/inject/queue.js
const KEY = '__cmuxInspectQueue';

function initQueue() {
  if (Array.isArray(window[KEY])) return; // 已存在不覆盖
  try {
    const raw = sessionStorage.getItem(KEY);
    window[KEY] = raw ? JSON.parse(raw) : [];
  } catch (e) {
    window[KEY] = [];
  }
}

function syncToStorage() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(window[KEY] || []));
  } catch (e) {}
}

function pushItem(item) {
  if (!Array.isArray(window[KEY])) window[KEY] = [];
  window[KEY].push(item);
  syncToStorage();
}

function peekQueue() {
  return Array.isArray(window[KEY]) ? window[KEY] : [];
}

module.exports = { initQueue, pushItem, peekQueue, syncToStorage };
```

- [ ] **Step 4: Run 测试通过**

```bash
cd ~/cmux-inspect-bridge && npx vitest run tests/inject/queue.test.js
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inject/queue.js tests/inject/queue.test.js
git commit -m "feat(inject): queue + sessionStorage 持久化"
```

---

## Task 9: src/inject/overlay.js — 浮层 DOM 渲染

**Files:**
- Create: `src/inject/overlay.js`

> 浮层 UI 主要是 DOM 操作，jsdom 测试价值有限。手动验收为主。本任务只确保模块导出函数 + 静态 HTML/CSS 结构合理。

- [ ] **Step 1: 实现**

```js
// src/inject/overlay.js
const OVERLAY_ID = '__cmux_inspect_overlay';

function buildOverlayHTML(captured, terminalSurfaces, defaultTargetRef) {
  const targetOptions = terminalSurfaces.map(s => {
    const ref = s.id;
    const label = s.name ? `${s.name} [${ref}]` : ref;
    const selected = ref === defaultTargetRef ? ' selected' : '';
    return `<option value="${ref}" data-name="${s.name || ''}"${selected}>${label}</option>`;
  }).join('');

  return `
    <div id="${OVERLAY_ID}" style="
      position: fixed; z-index: 999999; min-width: 360px; max-width: 480px;
      background: rgba(20,20,30,0.96); color: #f0f0f5; border-radius: 8px;
      padding: 12px; font: 13px -apple-system, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
    ">
      <details style="margin-bottom: 8px; cursor: pointer;">
        <summary style="opacity: 0.7; word-break: break-all;">${escapeHtml(captured.selector)}</summary>
        <pre style="margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.3); overflow: auto; max-height: 120px; white-space: pre-wrap; font-size: 11px;">${escapeHtml(captured.outerHTML.slice(0, 500))}</pre>
      </details>
      <textarea data-role="request" placeholder="描述需求..." rows="3" style="
        width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3);
        color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
        padding: 6px; font: inherit; resize: vertical;
      "></textarea>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
        <span style="opacity: 0.6;">Target:</span>
        <select data-role="target" style="
          flex: 1; background: rgba(0,0,0,0.3); color: #fff;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 4px;
        ">${targetOptions}</select>
        <button data-action="cancel" style="
          background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.15);
          padding: 4px 10px; border-radius: 4px; cursor: pointer;
        ">ESC</button>
        <button data-action="submit" style="
          background: #3b82f6; color: #fff; border: none;
          padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;
        ">发送 ⏎</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function positionOverlay(overlay, anchorRect) {
  // 默认锚定到元素右下，超出视口则镜像
  const overlayW = overlay.offsetWidth || 400;
  const overlayH = overlay.offsetHeight || 200;
  let left = anchorRect.right + 8;
  let top = anchorRect.bottom + 8;
  if (left + overlayW > window.innerWidth) left = Math.max(8, anchorRect.left - overlayW - 8);
  if (top + overlayH > window.innerHeight) top = Math.max(8, anchorRect.top - overlayH - 8);
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function removeOverlay() {
  const old = document.getElementById(OVERLAY_ID);
  if (old) old.remove();
}

function showOverlay({ captured, terminalSurfaces, defaultTargetRef, anchorRect, onSubmit, onCancel }) {
  removeOverlay();
  const wrap = document.createElement('div');
  wrap.innerHTML = buildOverlayHTML(captured, terminalSurfaces, defaultTargetRef).trim();
  const overlay = wrap.firstChild;
  document.body.appendChild(overlay);
  positionOverlay(overlay, anchorRect);

  const textarea = overlay.querySelector('[data-role=request]');
  const select = overlay.querySelector('[data-role=target]');
  textarea.focus();

  const submit = () => {
    const request = textarea.value.trim();
    if (!request) { textarea.focus(); return; }
    const opt = select.selectedOptions[0];
    onSubmit({
      request: request.replace(/\n/g, ' '),
      target_ref: opt.value,
      target_name: opt.dataset.name || opt.value,
    });
    removeOverlay();
  };

  overlay.querySelector('[data-action=submit]').addEventListener('click', submit);
  overlay.querySelector('[data-action=cancel]').addEventListener('click', () => { onCancel(); removeOverlay(); });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    if (e.key === 'Escape') { onCancel(); removeOverlay(); }
  });

  return overlay;
}

module.exports = { showOverlay, removeOverlay, OVERLAY_ID };
```

- [ ] **Step 2: 烟测（jsdom）**

```bash
cd ~/cmux-inspect-bridge && node -e "
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
global.document = dom.window.document;
global.window = dom.window;
const { showOverlay } = require('./src/inject/overlay');
let submitted = null;
showOverlay({
  captured: { selector: 'button.test', outerHTML: '<button>x</button>' },
  terminalSurfaces: [{ id: 'surface:11', name: 'qwen' }],
  defaultTargetRef: 'surface:11',
  anchorRect: { left:0,top:0,right:100,bottom:30 },
  onSubmit: (data) => { submitted = data },
  onCancel: () => {},
});
console.log('overlay rendered:', !!document.getElementById('__cmux_inspect_overlay'));
console.log('select options:', document.querySelector('select').options.length);
"
```

Expected: `overlay rendered: true`，`select options: 1`

- [ ] **Step 3: Commit**

```bash
git add src/inject/overlay.js
git commit -m "feat(inject): overlay DOM 渲染"
```

---

## Task 10: src/inject/teardown.js — 幂等 teardown 机制

**Files:**
- Create: `src/inject/teardown.js`

- [ ] **Step 1: 实现**

```js
// src/inject/teardown.js
const TEARDOWN_KEY = '__cmuxInspectTeardown';

function registerTeardown(fn) {
  // 先调旧 teardown（如果存在）
  if (typeof window[TEARDOWN_KEY] === 'function') {
    try { window[TEARDOWN_KEY](); } catch (e) {}
  }
  window[TEARDOWN_KEY] = fn;
}

function callTeardown() {
  if (typeof window[TEARDOWN_KEY] === 'function') {
    try { window[TEARDOWN_KEY](); } catch (e) {}
    delete window[TEARDOWN_KEY];
  }
}

module.exports = { registerTeardown, callTeardown, TEARDOWN_KEY };
```

- [ ] **Step 2: Commit**

```bash
git add src/inject/teardown.js
git commit -m "feat(inject): 幂等 teardown 机制"
```

---

## Task 11: src/inject/main.js — 浏览器侧入口

**Files:**
- Create: `src/inject/main.js`

- [ ] **Step 1: 实现**

```js
// src/inject/main.js
const { genSelector } = require('./selector');
const { initQueue, pushItem, peekQueue, syncToStorage } = require('./queue');
const { showOverlay, removeOverlay } = require('./overlay');
const { registerTeardown } = require('./teardown');

function nonce() {
  return 'wt-' + Math.random().toString(36).slice(2, 8);
}

function isInsideOverlay(node) {
  while (node) {
    if (node.id === '__cmux_inspect_overlay') return true;
    node = node.parentElement;
  }
  return false;
}

function singleLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function captureElement(el) {
  return {
    selector: genSelector(el),
    outerHTML: singleLine(el.outerHTML).slice(0, 500),
    url: location.href,
  };
}

// 由 daemon 在 init 时通过 addinitscript 提供 cmux tree 快照（先简单约定为
// inject.js 启动时同步用 cmux tree 输出注入到 window.__cmuxTerminals）
function getTerminalSurfaces() {
  return (window.__cmuxTerminals || []).filter(s => s.type === 'terminal');
}

function main() {
  initQueue();

  const onClick = (e) => {
    if (!e.altKey) return;
    if (isInsideOverlay(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const captured = captureElement(e.target);
    const rect = e.target.getBoundingClientRect();

    showOverlay({
      captured,
      terminalSurfaces: getTerminalSurfaces(),
      defaultTargetRef: window.__cmuxDefaultTargetRef || (getTerminalSurfaces()[0] && getTerminalSurfaces()[0].id) || '',
      anchorRect: rect,
      onSubmit: ({ request, target_ref, target_name }) => {
        pushItem({
          id: nonce(),
          ts: Date.now(),
          url: captured.url,
          selector: captured.selector,
          outerHTML: captured.outerHTML,
          request,
          target_name,
          target_ref,
        });
        flashToast(`✓ 已捕获 / 总 ${peekQueue().length} 条`);
      },
      onCancel: () => {},
    });
  };

  document.addEventListener('click', onClick, true);

  registerTeardown(() => {
    document.removeEventListener('click', onClick, true);
    removeOverlay();
  });
}

function flashToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999998;
    background: rgba(20,20,30,0.92); color: #4ade80; padding: 8px 14px;
    border-radius: 6px; font: 12px -apple-system, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add src/inject/main.js
git commit -m "feat(inject): 主入口 — 监听器 + 浮层装配 + queue push"
```

---

## Task 12: scripts/build-inject.js — 拼装 dist/inject.js

**Files:**
- Create: `scripts/build-inject.js`
- Generated: `dist/inject.js`

- [ ] **Step 1: 实现 build 脚本**

```js
// scripts/build-inject.js
// 手工 bundle src/inject/*.js 为单个 dist/inject.js（IIFE 包裹，浏览器可直接 eval）
const fs = require('fs');
const path = require('path');

const MODULES = [
  'src/inject/teardown.js',
  'src/inject/queue.js',
  'src/inject/selector.js',
  'src/inject/overlay.js',
  'src/inject/main.js',
];

function inline() {
  let out = '(function(){\n  "use strict";\n  const __mods = {};\n  function __def(name, fn){ __mods[name] = {}; fn({ exports: __mods[name] }, __mods[name]); }\n  function require(name){ return __mods[name.replace(/^\\.\\//, "").replace(/^\\.\\.\\//, "").replace(/\\.js$/, "") + ""] || __mods[name.split("/").pop().replace(/\\.js$/, "")]; }\n';
  for (const file of MODULES) {
    const body = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const name = path.basename(file, '.js');
    out += `\n  __def('${name}', function(module, exports){\n${body}\n});\n`;
  }
  out += '\n})();';
  return out;
}

function main() {
  const bundled = inline();
  const outPath = path.join(__dirname, '..', 'dist', 'inject.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bundled, 'utf8');
  console.log(`✓ Bundled ${MODULES.length} modules → ${outPath} (${bundled.length} bytes)`);
}

main();
```

> 简易 CommonJS bundler：每个模块包成 `__def(name, function(module, exports){ ... })`，模块内的 `require('./teardown')` 会查 __mods table。**关键限制**：不支持嵌套路径，所有依赖必须 basename 唯一。本项目 inject/ 下文件名都唯一，OK。

- [ ] **Step 2: 运行 build + 验证产物**

```bash
cd ~/cmux-inspect-bridge && node scripts/build-inject.js
ls -la dist/inject.js
head -5 dist/inject.js
```

Expected: 文件存在，第一行 `(function(){`

- [ ] **Step 3: 浏览器侧烟测（用 jsdom）**

```bash
cd ~/cmux-inspect-bridge && node -e "
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<button id=t>x</button>', { runScripts: 'dangerously' });
global.window = dom.window;
global.document = dom.window.document;
dom.window.eval(require('fs').readFileSync('dist/inject.js', 'utf8'));
console.log('queue inited:', Array.isArray(dom.window.__cmuxInspectQueue));
console.log('teardown registered:', typeof dom.window.__cmuxInspectTeardown);
"
```

Expected: `queue inited: true` + `teardown registered: function`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-inject.js dist/inject.js
git commit -m "feat(build): inject.js bundle 脚本 + 首次构建产物"
```

---

## Task 13: src/watcher/daemon.js — 守护进程主循环

**Files:**
- Create: `src/watcher/daemon.js`

- [ ] **Step 1: 实现 daemon 主循环**

```js
// src/watcher/daemon.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listBrowserSurfaces, getKnownSurfaceIds } = require('../lib/surfaces');
const { browserEval, send, readScreen } = require('../lib/cmux');
const { isIdle } = require('../lib/idle');
const { formatPayload } = require('../lib/payload');

const LOG_PATH = path.join(os.homedir(), '.cmux-inspect', 'watcher.log');

function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch (e) {}
}

function pullQueue(surfaceId) {
  try {
    const raw = browserEval(surfaceId, 'JSON.stringify(window.__cmuxInspectQueue || [])');
    return JSON.parse(raw);
  } catch (e) {
    log('warn', `pullQueue failed for ${surfaceId}: ${e.message}`);
    return [];
  }
}

function spliceQueue(surfaceId, n) {
  try {
    const script = `window.__cmuxInspectQueue.splice(0, ${n}); sessionStorage.setItem('__cmuxInspectQueue', JSON.stringify(window.__cmuxInspectQueue));`;
    browserEval(surfaceId, script);
  } catch (e) {
    log('warn', `spliceQueue failed for ${surfaceId}: ${e.message}`);
  }
}

function isTargetIdle(targetRef) {
  try {
    const screen = readScreen(targetRef, 5);
    return isIdle(screen);
  } catch (e) {
    log('warn', `read-screen failed for ${targetRef}: ${e.message}`);
    return false;
  }
}

function tick({ defaultTargetRef }) {
  const browserSurfaces = listBrowserSurfaces();
  const knownIds = getKnownSurfaceIds();

  let pending = [];
  for (const bs of browserSurfaces) {
    const items = pullQueue(bs.id);
    for (const item of items) {
      pending.push({ ...item, __source_surface: bs.id });
    }
  }

  if (pending.length === 0) return 0;

  const consumed = {};
  for (const item of pending) {
    const targetRef = item.target_ref || defaultTargetRef;
    if (!targetRef) {
      log('warn', `item ${item.id} missing target_ref and no default; skipping`);
      continue;
    }
    if (!knownIds.has(targetRef)) {
      log('error', `target_ref ${targetRef} no longer exists (was ${item.target_name}); skipping`);
      continue;
    }
    if (!isTargetIdle(targetRef)) {
      log('info', `target ${targetRef} busy, defer item ${item.id}`);
      continue;
    }
    try {
      send(targetRef, formatPayload(item));
      log('info', `pushed item ${item.id} → ${targetRef}`);
      consumed[item.__source_surface] = (consumed[item.__source_surface] || 0) + 1;
    } catch (e) {
      log('error', `cmux send failed for ${targetRef}: ${e.message}`);
    }
  }

  for (const [bs, n] of Object.entries(consumed)) {
    spliceQueue(bs, n);
  }

  return Object.values(consumed).reduce((a, b) => a + b, 0);
}

async function run({ targetRef, interval = 1500 }) {
  log('info', `daemon started target=${targetRef} interval=${interval}ms pid=${process.pid}`);
  process.on('SIGTERM', () => { log('info', 'SIGTERM received, exiting'); process.exit(0); });
  process.on('SIGINT', () => { log('info', 'SIGINT received, exiting'); process.exit(0); });

  while (true) {
    try { tick({ defaultTargetRef: targetRef }); } catch (e) { log('error', `tick failed: ${e.stack}`); }
    await new Promise(r => setTimeout(r, interval));
  }
}

module.exports = { run, tick };

if (require.main === module) {
  // 通过 spawn 直接拉起：node src/watcher/daemon.js --target surface:11 --interval 1500
  const args = require('minimist')(process.argv.slice(2));
  run({ targetRef: args.target, interval: parseInt(args.interval, 10) || 1500 });
}
```

> 注意：daemon 用 require.main 入口，但 require('minimist') 会加依赖。把它去掉，手写参数解析：

替换最后一段为：

```js
if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  run({ targetRef: args.target, interval: parseInt(args.interval, 10) || 1500 });
}
```

- [ ] **Step 2: 烟测 tick 函数（mock cmux）**

```bash
cd ~/cmux-inspect-bridge && node -e "
const { tick } = require('./src/watcher/daemon');
// daemon 强依赖外部 cmux 命令，纯函数测试见 lib 层，这里只 require 不抛即可
console.log('module loaded ok');
"
```

Expected: `module loaded ok`

- [ ] **Step 3: Commit**

```bash
git add src/watcher/daemon.js
git commit -m "feat(watcher): daemon 主循环 + tick 逻辑"
```

---

## Task 14: src/watcher/lifecycle.js — daemon spawn/kill/status

**Files:**
- Create: `src/watcher/lifecycle.js`

- [ ] **Step 1: 实现**

```js
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
    const wait = Buffer.alloc(0); // noop
    require('child_process').execSync('sleep 0.05');
  }

  // force kill
  try { process.kill(info.pid, 'SIGKILL'); } catch (e) {}
  removePid(PID_FILE);
  return { stopped: true, signal: 'SIGKILL' };
}

module.exports = { start, status, stop, PID_FILE, LOG_FILE };
```

- [ ] **Step 2: 烟测**

```bash
cd ~/cmux-inspect-bridge && node -e "
const lc = require('./src/watcher/lifecycle');
const s = lc.status();
console.log('initial status:', s);
"
```

Expected: `initial status: { running: false }`（假设当前没有 daemon 在跑）

- [ ] **Step 3: Commit**

```bash
git add src/watcher/lifecycle.js
git commit -m "feat(watcher): daemon spawn/status/stop 三件套"
```

---

## Task 15: bin/cmux-inspect-bridge.js + src/cli/watch.js — watch 子命令

**Files:**
- Create: `bin/cmux-inspect-bridge.js`
- Create: `src/cli/watch.js`

- [ ] **Step 1: 实现 watch 子命令**

```js
// src/cli/watch.js
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
```

- [ ] **Step 2: 写 bin 入口**

```js
#!/usr/bin/env node
// bin/cmux-inspect-bridge.js
const argv = process.argv.slice(2);
const cmd = argv[0];

const commands = {
  watch: () => require('../src/cli/watch').run(argv.slice(1)),
  init: () => require('../src/cli/init').run(argv.slice(1)),
  inject: () => require('../src/cli/inject').run(argv.slice(1)),
  doctor: () => require('../src/cli/doctor').run(argv.slice(1)),
};

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`cmux-inspect-bridge v${require('../package.json').version}

用法：
  cmux-inspect-bridge init                注入到所有 browser surface + 装 skill
  cmux-inspect-bridge inject [--surface s | --all]
                                          补注入到指定/所有 browser surface
  cmux-inspect-bridge doctor              诊断状态
  cmux-inspect-bridge watch --target <name|ref> [--interval 1.5]
                                          启动 daemon
  cmux-inspect-bridge watch --status      查看 daemon 状态
  cmux-inspect-bridge watch --stop        停止 daemon`);
  process.exit(0);
}

if (cmd === '--version' || cmd === '-V') {
  console.log(require('../package.json').version);
  process.exit(0);
}

if (!commands[cmd]) {
  console.error(`Error: unknown subcommand "${cmd}"`);
  process.exit(2);
}

commands[cmd]();
```

- [ ] **Step 3: chmod + 烟测**

```bash
cd ~/cmux-inspect-bridge && chmod +x bin/cmux-inspect-bridge.js
node bin/cmux-inspect-bridge.js --version
node bin/cmux-inspect-bridge.js --help
node bin/cmux-inspect-bridge.js watch --status
```

Expected: 
- `0.1.0`
- 帮助文本
- `daemon: not running`

- [ ] **Step 4: Commit**

```bash
git add bin/cmux-inspect-bridge.js src/cli/watch.js
git commit -m "feat(cli): bin 入口 + watch 子命令（start/status/stop）"
```

---

## Task 16: src/cli/init.js + src/cli/inject.js — init 与 inject 子命令

**Files:**
- Create: `src/cli/init.js`
- Create: `src/cli/inject.js`

- [ ] **Step 1: 实现 inject.js（注入到指定/所有 browser surface）**

```js
// src/cli/inject.js
const fs = require('fs');
const path = require('path');
const { listBrowserSurfaces } = require('../lib/surfaces');
const { browserAddInitScript, browserAddScript, tree } = require('../lib/cmux');

function readBundle() {
  const dist = path.join(__dirname, '..', '..', 'dist', 'inject.js');
  if (!fs.existsSync(dist)) {
    throw new Error(`dist/inject.js missing; run 'node scripts/build-inject.js' first`);
  }
  return fs.readFileSync(dist, 'utf8');
}

function buildTerminalSnapshot() {
  // 把 terminal surface 列表注入到 window.__cmuxTerminals 供浮层填充下拉
  const terms = tree().surfaces.filter(s => s.type === 'terminal');
  const js = `window.__cmuxTerminals = ${JSON.stringify(terms.map(s => ({ id: s.id, name: s.name, type: 'terminal' })))};`;
  return js;
}

function injectTo(surface, bundle) {
  const snapshot = buildTerminalSnapshot();
  const combined = snapshot + '\n' + bundle;
  browserAddInitScript(surface.id, combined);
  browserAddScript(surface.id, combined);
}

function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--surface') args.surface = argv[++i];
    else if (argv[i] === '--all') args.all = true;
  }

  let targets;
  if (args.surface) {
    targets = listBrowserSurfaces().filter(s => s.id === args.surface);
    if (targets.length === 0) { console.error(`Error: browser surface ${args.surface} not found`); process.exit(2); }
  } else {
    targets = listBrowserSurfaces();
  }

  if (targets.length === 0) {
    console.log('No browser surfaces in current workspace. Open a cmux browser first.');
    return;
  }

  const bundle = readBundle();
  for (const s of targets) {
    try {
      injectTo(s, bundle);
      console.log(`✓ injected → ${s.id} (${s.name || ''})`);
    } catch (e) {
      console.error(`✗ inject failed for ${s.id}: ${e.message}`);
    }
  }
}

module.exports = { run, injectTo, readBundle };
```

- [ ] **Step 2: 实现 init.js（inject + 装 skill + 引导）**

```js
// src/cli/init.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listBrowserSurfaces } = require('../lib/surfaces');
const { injectTo, readBundle } = require('./inject');

const SKILLS_SRC = path.join(__dirname, '..', '..', 'skills', 'cmux-inspect');
const SKILLS_DEST = path.join(os.homedir(), '.claude', 'skills', 'cmux-inspect');

function copySkill() {
  fs.mkdirSync(SKILLS_DEST, { recursive: true });
  for (const f of fs.readdirSync(SKILLS_SRC)) {
    fs.copyFileSync(path.join(SKILLS_SRC, f), path.join(SKILLS_DEST, f));
  }
}

function run() {
  // 1. 枚举 browser surfaces
  const surfaces = listBrowserSurfaces();
  if (surfaces.length === 0) {
    console.error('⚠️  No browser surface in current workspace. Open a cmux browser first and retry.');
    process.exit(2);
  }

  // 2. 注入
  const bundle = readBundle();
  for (const s of surfaces) {
    try {
      injectTo(s, bundle);
      console.log(`✓ injected → ${s.id} (${s.name || ''})`);
    } catch (e) {
      console.error(`✗ inject failed for ${s.id}: ${e.message}`);
    }
  }

  // 3. 装 skill
  try {
    copySkill();
    console.log(`✓ skills installed → ${SKILLS_DEST}`);
  } catch (e) {
    console.error(`✗ skill install failed: ${e.message}`);
  }

  // 4. 引导
  console.log('');
  console.log('✅ Init 完成');
  console.log('');
  console.log('下一步：');
  console.log('  1. 在 cmux terminal 跑 /inspect-watch qwen 启动 daemon');
  console.log('  2. cmux browser Alt+Click 任意元素 → 浮层打需求 → 发送');
  console.log('  3. qwen 输入框出现 single-line payload，你补充后回车提交');
}

module.exports = { run };
```

- [ ] **Step 3: 烟测**

```bash
cd ~/cmux-inspect-bridge && node bin/cmux-inspect-bridge.js init
```

Expected：
- 若当前 workspace 有 browser surface：`✓ injected → surface:N` + `✓ skills installed` + 完成提示
- 若没有：`⚠️  No browser surface...`

- [ ] **Step 4: Commit**

```bash
git add src/cli/init.js src/cli/inject.js
git commit -m "feat(cli): init 与 inject 子命令"
```

---

## Task 17: src/cli/doctor.js — 诊断子命令

**Files:**
- Create: `src/cli/doctor.js`

- [ ] **Step 1: 实现**

```js
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
```

- [ ] **Step 2: 烟测**

```bash
cd ~/cmux-inspect-bridge && node bin/cmux-inspect-bridge.js doctor
```

Expected: 多行诊断输出。

- [ ] **Step 3: Commit**

```bash
git add src/cli/doctor.js
git commit -m "feat(cli): doctor 诊断子命令"
```

---

## Task 18: skills/cmux-inspect/SKILL.md — slash skill 三件套

**Files:**
- Create: `skills/cmux-inspect/SKILL.md`

- [ ] **Step 1: 实现**

```markdown
---
name: cmux-inspect
description: cmux browser 内 Alt+Click 元素提需求自动推到目标 surface 输入框。三个 slash command 包装 cmux-inspect-bridge CLI。Use when 用户提到 /inspect-watch /inspect-status /inspect-stop 或 "启动 inspect watcher" "看 inspect 状态" "停掉 inspect daemon" 这类场景。
---

# cmux-inspect

替代截图工作流：cmux browser Alt+Click 元素 → 浮层提需求 → 自动推到 target surface 输入框。

完整设计：https://github.com/hxppk/cmux-inspect-bridge

## 命令一览

### /inspect-watch <target>

启动 daemon，推送目标 surface 默认为 `<target>`。

执行：

```bash
cmux-inspect-bridge watch --target <target>
```

`<target>` 可以是名字（如 `qwen`、`claude`）或 surface ref（如 `surface:11`）。

### /inspect-status

查 daemon 状态。

执行：

```bash
cmux-inspect-bridge watch --status
```

### /inspect-stop

停止 daemon。

执行：

```bash
cmux-inspect-bridge watch --stop
```

## 触发时机

当用户输入：
- `/inspect-watch qwen` → 执行 `cmux-inspect-bridge watch --target qwen`，输出 pid + log 路径
- `/inspect-status` → 执行 `cmux-inspect-bridge watch --status`，输出状态
- `/inspect-stop` → 执行 `cmux-inspect-bridge watch --stop`，输出停止结果

执行完毕后**立刻返回**结果给用户，**不要继续轮询**或额外操作。

## 前置依赖

- 已运行 `cmux-inspect-bridge init`（注入 inject.js + 装本 skill）
- 当前 cmux workspace 内至少有 1 个 terminal surface 作为推送目标
```

- [ ] **Step 2: Commit**

```bash
git add skills/cmux-inspect/SKILL.md
git commit -m "feat(skill): /inspect-watch /inspect-status /inspect-stop slash 三件套"
```

---

## Task 19: README 终稿 + 集成手动验收

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 重写 README**

```markdown
# cmux-inspect-bridge

在 cmux browser pane 内 **Alt+Click** 元素 → 浮层提需求 → 自动推到 claude/qwen 输入框。

替代「截图 → 切窗口 → 粘贴 → 描述」 的传统工作流。

## 一次性安装

```bash
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 init
```

会：
- 检测当前 cmux workspace 内所有 browser surface 并逐个 inject
- 把 `cmux-inspect` slash skill 复制到 `~/.claude/skills/`
- 输出下一步引导

## 日常使用

1. 在任意 cmux terminal 启动 daemon（不要在 claude/qwen 的对话 surface 启动会阻塞主对话；用 background terminal 或者直接 `cmux-inspect-bridge watch --target qwen` 命令）：

   ```text
   /inspect-watch qwen
   ```

2. 在 cmux browser 任意页面 **Alt+Click** UI 元素 → 浮层弹出
3. 浮层 textarea 描述需求 → 选 target → 「发送」
4. **目标 surface 输入框立刻出现完整 payload**：

   ```text
   [cmux-inspect] url=https://.../page; selector=button.x; html=<button...>; 需求=把这个按钮颜色改浅
   ```

5. 你在输入框补充或直接回车提交

## CLI

```bash
cmux-inspect-bridge init                              # 完整初始化
cmux-inspect-bridge inject [--surface s | --all]      # 补注入
cmux-inspect-bridge doctor                            # 诊断
cmux-inspect-bridge watch --target <name|ref>         # 启 daemon
cmux-inspect-bridge watch --status                    # 看 daemon
cmux-inspect-bridge watch --stop                      # 停 daemon
```

## Slash Skill

- `/inspect-watch <target>` → `watch --target`
- `/inspect-status` → `watch --status`
- `/inspect-stop` → `watch --stop`

## 设计

完整设计文档：[docs/specs/2026-05-14-cmux-inspect-bridge-design.md](./docs/specs/2026-05-14-cmux-inspect-bridge-design.md)

经过三轮 AI agent (qwen) 协作审阅。

## 已知限制（v0.1.0）

- macOS Alt+Click 与系统窗口拖拽快捷键有冲突时，可在浏览器中按住 Shift+Alt+Click（未来加 `--trigger` 配置）
- iframe 内元素暂未捕获
- cmux 当前 CLI 无 remove-init-script，无 `uninject` 子命令；卸载需关闭 browser surface
- target surface 重名时浮层下拉用 `name [surface:N]` 区分

## 协作

- Issues: https://github.com/hxppk/cmux-inspect-bridge/issues
- 设计 / Plan 都在 `docs/` 下
```

- [ ] **Step 2: 跑全部测试 + build**

```bash
cd ~/cmux-inspect-bridge && npm test && node scripts/build-inject.js
```

Expected: 全部测试 PASS，dist/inject.js 重新生成。

- [ ] **Step 3: 手动验收（M0-M4 全量）**

按 spec §8 验收：

- **M0 浏览器侧**：
  ```bash
  node bin/cmux-inspect-bridge.js inject --all   # 注入到当前 cmux browser
  # 切到 cmux browser，按 Alt + 点任意元素
  # 验证：浮层弹出 + textarea + 下拉有 terminal surfaces
  ```
- **M1 单 surface 单 target**：
  ```bash
  node bin/cmux-inspect-bridge.js watch --target qwen
  # 在 browser 浮层填需求点发送
  # ≤1.5s 内 qwen 输入框出现 payload
  ```
- **M2 多 browser + busy**：开 2 个 cmux browser，故意让 qwen 处于非 idle 状态（比如让它在执行命令），验证 daemon log 里出现 `target busy, defer`
- **M3 CLI / Skill**：依次跑 `init / inject / doctor / watch --target/--status/--stop`，再在 claude pane 跑 `/inspect-watch /inspect-status /inspect-stop`
- **M4 干净安装**：
  ```bash
  # 在另一个空目录测试 npx
  cd /tmp && rm -rf cmux-inspect-bridge && \
    npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 init
  ```

- [ ] **Step 4: Commit README**

```bash
git add README.md
git commit -m "docs: 终稿 README 用户视角文档"
```

- [ ] **Step 5: 打 tag + push + Release**

```bash
cd ~/cmux-inspect-bridge && git push origin main && \
  git tag -a v0.1.0 -m "v0.1.0 — 首版：Alt+Click 替代截图工作流" && \
  git push origin v0.1.0 && \
  gh release create v0.1.0 -R hxppk/cmux-inspect-bridge \
    --title "v0.1.0 — Alt+Click 替代截图工作流" \
    --notes "首版。完整设计 + 三轮 AI agent 协作审阅。详见 README 和 docs/specs/。"
```

- [ ] **Step 6: Smoke `npx` 安装**

```bash
cd /tmp/smoke-test-$(date +%s) && mkdir -p . && cd . && \
  npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 --help
```

Expected: 帮助文本出现，证明 npx 入口可用。

---

## 验收清单（M0-M4 对照）

| Milestone | Spec 验收点 | 对应 Task |
|---|---|---|
| M0 | 浮层弹出 + textarea + sessionStorage | Task 8-12 |
| M1 | 1.5s 内 qwen 输入框出现 payload | Task 13-15 |
| M2 | 多 browser surface + busy defer | Task 13 (合并轮询) + Task 14 |
| M3 | CLI 4 个子命令 + skill 3 件套 | Task 15-18 |
| M4 | npx init 干净环境一键安装 | Task 19 |

---

## 自检（Spec → Plan 映射）

| Spec 章节 | 实现位置 |
|---|---|
| §2.1 setup + watcher | Task 15 (watch), Task 16 (init) |
| §2.4 single-line payload | Task 2 (payload.js) |
| §3.2 InspectItem 数据结构 + sessionStorage | Task 8 (queue.js) |
| §3.3 数据流（含 busy 检测、target_ref 优先）| Task 13 (daemon.js) |
| §4.1.3 selector 生成 + CSS.escape | Task 7 (selector.js) |
| §4.1.5 浮层 UI | Task 9 (overlay.js) |
| §4.1.6 Cmd+Enter / Esc | Task 9 (overlay.js keydown) |
| §4.2 daemon 主循环 | Task 13 (daemon.js tick) |
| §4.2.3 多 browser surface | Task 13 (listBrowserSurfaces 循环) |
| §4.2.4 is_target_idle + target_ref 校验 + known_surface_ids | Task 13 (daemon.js) |
| §4.2.5 spawn detached + unref + pid/log | Task 14 (lifecycle.js) |
| §4.3 init/inject/doctor 子命令 + 幂等 teardown | Task 10 (teardown), Task 16 (init), Task 17 (doctor) |
| §6 风险表（含 macOS setsid / 重名 / uninject 不支持）| 设计已落实到 Task 14 (spawn 不用 setsid), Task 9 (重名下拉显式), Task 18 (skill 没 uninject) |
| §8 M0-M4 验收 | Task 19 步骤 3 |
