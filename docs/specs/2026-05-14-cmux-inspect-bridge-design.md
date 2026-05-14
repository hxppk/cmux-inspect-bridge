# cmux-inspect-bridge — 设计文档

> 在 cmux browser pane 内 Alt+Click 元素，浮层提需求，自动推到 claude/qwen 输入框。替代「截图 → 粘贴 → 描述」工作流。

- **作者**：何旭
- **日期**：2026-05-14
- **状态**：设计阶段 / 待 review

---

## 1. 背景与目标

### 1.1 当前痛点

用户工作流：cmux 三 pane 布局（claude / qwen 终端 + cmux browser）。看到 UI 问题时：

1. cmux browser 截图
2. 切到 claude/qwen pane
3. 粘贴截图
4. 描述需求："把这个按钮颜色调浅一点"

痛点：
- 截图本身就是断流
- 截图描述 element 不准确（要让 AI 看清是哪个按钮，往往要圈红框 + 描述位置）
- AI 看截图后还要再 grep / snapshot 才能锁定元素

### 1.2 目标

**核心**：把"截图 → 粘贴"替换成 **「在 cmux browser 里直接 Alt+Click 元素 + 打字提需求」**。

- 整个交互不离开 cmux browser pane
- 自动捕获精确的 element 上下文（selector + outerHTML + URL）
- 用户的需求文字 + 元素上下文 拼好后自动推到目标 surface 输入框
- 用户在 surface 输入框补充 / 直接回车提交

### 1.3 非目标

- **不做** file:line 源码映射（要 Vite 插件，不通用）
- **不做** 富文本 / 截图标注 / 设计稿对比
- **不做** Chrome 扩展形态（cmux 原生优先）

---

## 2. 工作流

### 2.1 一次性 setup

用户在任意 cmux terminal 跑一次：

```bash
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 init
```

执行内容：
1. 用 `cmux tree` 枚举当前 workspace 内所有 **browser** 类型的 surface
2. 对每个 browser surface：
   - `cmux browser addinitscript --surface surface:N --script "<inject-js>"` → **后续每次页面加载/导航自动运行**
   - `cmux browser addscript --surface surface:N --script "<inject-js>"` → **立刻在当前已加载页面运行一次**（避免要求用户 reload）
3. 把 `inspect-watch` skill 装到 `~/.claude/skills/cmux-inspect/`
4. 输出使用说明 + 检测到的 browser surface 列表

> **【关键约束】**
>
> - `cmux browser addinitscript` **作用域是单个 surface**，不是 `--workspace` 批量；init 命令必须枚举后逐个调用
> - `addinitscript` 只对**新加载**的页面生效，已加载的页面需要 `addscript` 单独注入或 reload
> - 后续 workspace 内若新开 browser surface，需要再跑一次 `cmux-inspect-bridge inject`（init 之外的子命令）

之后用户在任一 cmux terminal 启动后台 watcher（**不要在 claude/qwen 的 surface 内启动**，会阻塞主对话）：

```bash
cmux-inspect-bridge watch --target qwen [--interval 1.5]
```

该命令 fork 一个 **detached daemon**（用 `setsid + nohup`），关 terminal 不影响。daemon 会：
- 写 pid 到 `~/.cmux-inspect/watcher.pid`
- 日志到 `~/.cmux-inspect/watcher.log`
- 提供 `cmux-inspect-bridge watch --status` / `--stop` 子命令

> **【关键约束】**
>
> - 不用 slash skill 形式做长轮询，**因为 slash skill 在 claude/qwen 当前会话内执行会阻塞主对话**
> - 用 daemon 进程独立跑，符合"用户对 claude/qwen 提需求"的核心场景
> - skill `/inspect-watch` 改为薄包装：调 `cmux-inspect-bridge watch` 启动 daemon 然后立刻返回；同样有 `/inspect-stop` `/inspect-status`

### 2.2 日常使用

1. cmux browser 任意页面，**Alt + 点击** 某个 UI 元素
2. 浮层在元素旁弹出
3. 浮层内打字描述需求（如「把这个按钮颜色调浅」）
4. 选择 target surface（默认上次选择）
5. 点「发送」
6. 浮层消失，**qwen 输入框立刻出现拼好的内容**，光标停在末尾
7. 用户在 qwen 输入框补充（如果需要）或直接回车提交

### 2.3 浮层 UI 示意

```
┌──────────────────────────────────────┐
│ ▸ button.ant-btn-primary    （折叠）│  ← 元素信息（可点开看 outerHTML）
│ ──────────────────────────────────  │
│ ┌──────────────────────────────┐    │
│ │ 把这个按钮颜色改浅一点         │    │  ← 用户需求 textarea (3 行)
│ │                              │    │
│ └──────────────────────────────┘    │
│                                      │
│ Target: [▾ qwen ]    [ESC] [发送]   │
└──────────────────────────────────────┘
```

### 2.4 推到 surface 的内容格式

**必须是真正的单行**（无 `\n`），因为 `cmux send` 把任何 LF 当作 Enter 提交，多行 payload 会破坏"不自动提交"原则。

```text
[cmux-inspect] url=https://example.com/page#/section; selector=button.ant-btn-primary[data-x="y"]; html=<button class="ant-btn ant-btn-primary"...>提交</button>; 需求=把这个按钮颜色改浅一点
```

- 各字段用 `; ` 分隔
- `html` 字段含 `<>` 但不含换行（outerHTML 取一次性 single-line）
- `需求` 字段是用户在浮层输入的文本，**输入侧已去掉换行**（textarea 提交前 `.replace(/\n/g, ' ')`）
- 整段长度上限 ~2KB；超过时截断 `html` 字段并标 `...truncated`

> **【关键约束】**
>
> - skill 通过 `cmux send --surface <target> "<single-line-payload>"` **只推文本，不发 Enter**
> - 用户在 surface 输入框看到这段后，可选择补充、修改、删除部分字段，再回车提交
> - 如需在 surface 内换行展示，依赖 AI 自己读完后做格式化，本协议不试图传多行

---

## 3. 架构

### 3.1 三个组件

```text
┌─────────────────────────┐         ┌──────────────────────────────┐
│ cmux browser surface(s) │         │ watcher daemon               │
│                         │         │ (independent Node process,   │
│ ┌─────────────────────┐ │         │  detached + unref)           │
│ │ inject.js (浮层 +   │ │ poll    │                              │
│ │ 监听器)             │◀┼─────────┤  cmux browser eval +         │
│ │                     │ │ 1.5s    │  is_target_idle 检测 +       │
│ │ window.__cmux       │ │         │  cmux send --surface         │
│ │ InspectQueue: [...] │ │         │                              │
│ └─────────────────────┘ │         │  ~/.cmux-inspect/            │
└─────────────────────────┘         │    watcher.pid / watcher.log │
                                    └──────────────────────────────┘
                                                 ↓
                                  ┌──────────────────────────┐
                                  │ target surface (qwen)    │
                                  │                          │
                                  │ ❯ [cmux-inspect] 资源.. │
                                  │   选择器: button..      │
                                  │   需求: ...             │
                                  └──────────────────────────┘
```

### 3.2 数据结构

`window.__cmuxInspectQueue` 是浏览器内 in-memory FIFO：

```ts
type InspectItem = {
  id: string             // 短 nonce
  ts: number             // unix ms
  url: string            // location.href
  selector: string       // best-effort CSS selector (经 CSS.escape 处理)
  outerHTML: string      // truncated to 500 chars，single-line（已去 \n）
  request: string        // 用户在浮层输入的需求文字（已去 \n）
  target_name: string    // 浮层下拉显示的友好名 e.g. "qwen"（仅日志用途）
  target_ref: string     // 固化的 surface ID，e.g. "surface:11"（daemon 推送依据）
}

window.__cmuxInspectQueue: InspectItem[]
```

#### 持久化与导航丢失

`window.__cmuxInspectQueue` 是 page-scoped，**SPA 路由切换**（hash/pushState）不丢失，但**整页 reload / 跨 origin 导航**会丢失。

策略：
- 主路径：**浮层发送是同步立刻 push**，期望 daemon 在下次轮询（≤1.5s）内消费完
- 兜底：每次 init script 重跑时，从 `sessionStorage['__cmuxInspectQueue']` 恢复未消费的 items
- 浮层 push 同时写 sessionStorage 一份；daemon 清队列时也同步清 sessionStorage
- 跨 origin 导航：sessionStorage 也会丢，已发送的请求若未消费就丢，daemon 检测到队列突变会记 warn

### 3.3 关键数据流

1. **Alt+Click**：浮层捕获元素并写 selector / outerHTML / url 到浮层暂存对象。同时浮层启动时通过 `cmux tree` 缓存（见 §3.3.1）解析所有 terminal surface 的 `name → surface_id` 映射，下拉填充友好名
2. **点发送**：把下拉选中的 `target_name` 立刻**固化**成 `target_ref = "surface:N"`（如果同名多个 surface，浮层下拉显式区分如 `qwen [surface:11]`），写完整 `InspectItem` push 进 `window.__cmuxInspectQueue` + sessionStorage 同步 + 浮层关闭。**daemon 推送时只信 target_ref，不再按 name 重解析**，避免 race 期间 surface 变化导致误送
3. **daemon 轮询**：每 1.5s **对每个 browser surface** 单独 `cmux browser eval --surface surface:N "JSON.stringify(window.__cmuxInspectQueue || [])"` 拉队列
4. **daemon 推送**：对每个 item：
   - 解析 `item.target` 找目标 surface id（`cmux tree` 缓存）
   - **busy 检测**：`cmux read-screen --surface surface:M --lines 5` 看末尾是否有 idle prompt（如 `❯`/`$`/`>`），非 idle 时跳过该 item，下次重试
   - 发送：`cmux send --surface surface:M <single-line-payload>`（不发 Enter）
5. **daemon 清队列**：成功推送后 `cmux browser eval "window.__cmuxInspectQueue.splice(0, N); sessionStorage.setItem('__cmuxInspectQueue', JSON.stringify(window.__cmuxInspectQueue))"`

---

## 4. 详细设计

### 4.1 inject.js — 浮层与监听器

#### 4.1.1 注入时机

通过 `cmux browser addinitscript --script "<bundled-inject-js>"` 一次性注入。该 API 让脚本在每个新加载的 page 启动时自动运行（包括 SPA 路由切换不会丢失）。

#### 4.1.2 监听器逻辑

```js
let activeOverlay = null;

window.addEventListener('click', (e) => {
  if (!e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  if (activeOverlay) closeOverlay();
  showOverlay(e.target);
}, true); // capture phase, in case页面元素 stop propagation
```

#### 4.1.3 selector 生成

best-effort 算法（优先级降序）：
1. 如果元素有 `id` → `#${CSS.escape(id)}`
2. 如果元素有 `data-testid` / `data-test` → `[data-testid="${value}"]`
3. 否则按"标签 + class（最多 3 个，每个用 `CSS.escape()` 转义）+ 父元素 nth-of-type"组装

**注意**：所有 class / id / 属性值都必须经 `CSS.escape()` 处理，因为 antd 等会用 `:`、`/` 等特殊字符（如 `.ant-btn:not(.disabled)`）。

不追求 100% 唯一，因为 AI 可以根据 outerHTML 自己校准。

#### 4.1.4 浮层定位

- 默认锚定在被点击元素的右下角
- 如果屏幕右侧空间不足，自动镜像到左下角
- 始终在视口内可见

#### 4.1.5 浮层结构（minimal HTML）

```html
<div id="__cmux_inspect_overlay">
  <details>
    <summary>{selector}</summary>
    <pre>{outerHTML 前 500 字}</pre>
  </details>
  <textarea placeholder="描述需求..." rows="3"></textarea>
  <div>
    Target: <select><option>qwen</option><option>claude</option></select>
    <button data-action="cancel">ESC</button>
    <button data-action="submit">发送 ⏎</button>
  </div>
</div>
```

CSS 内联（避免依赖），样式醒目（半透明黑底 + 大字 + 高对比度）。

#### 4.1.6 键盘快捷键

- 浮层弹出时，focus 自动落在 textarea
- `Cmd+Enter`（macOS）/ `Ctrl+Enter` = 发送
- `Esc` = 关闭浮层不发送

### 4.2 watcher daemon — 轮询与推送

> 不是 slash skill 内的长循环，而是**独立 daemon 进程**。slash skill `/inspect-watch` 只是薄包装。

#### 4.2.1 CLI 语法（统一在 `watch` 子命令下）

```bash
# 启动 daemon（默认动作：传 --target 即视为 start）
cmux-inspect-bridge watch --target qwen [--interval 1.5]

# 查看状态
cmux-inspect-bridge watch --status

# 停止 daemon
cmux-inspect-bridge watch --stop
```

互斥规则：`--target` / `--status` / `--stop` 同一次调用只能出现一个，否则报错。

或通过 slash skill 间接调用：

```text
/inspect-watch qwen           # → 调 watch --target qwen
/inspect-status               # → 调 watch --status
/inspect-stop                 # → 调 watch --stop
```

启动后立刻输出 daemon pid + log 路径，skill 命令立即返回（不阻塞 claude/qwen 对话）。

#### 4.2.2 surface 解析与缓存

启动时 `cmux tree` 输出做基础校验 + 缓存：
- 至少 1 个 `[browser]` surface（否则 fail-fast）
- 目标 target surface（`qwen` / `claude` / specific id）必须存在（否则 fail-fast）
- 缓存 `browser_surfaces: [surface:11, ...]` 和 `name → surface_id` 映射
- 后续每 30s refresh 一次 `cmux tree`（处理新增/关闭 surface 的情况）

#### 4.2.3 多 browser surface 支持

cmux workspace 内可能有多个 browser surface。daemon 默认：
- 对每个 browser surface 都做 `cmux browser eval` 拉队列
- 合并所有 surface 的 items 统一处理
- 每个 item 单独标 `source_surface_id`（便于清队列定位）

#### 4.2.4 轮询循环（伪代码）

```python
import json, subprocess, time, shlex, os, signal

def is_target_idle(target_id):
    """检测目标 surface 末尾是否处于 idle prompt"""
    raw = run(f"cmux read-screen --surface {target_id} --lines 5")
    # 用 regex 匹配 ❯ / $ / > 等常见 prompt
    return re.search(r'[❯>\$#]\s*$', raw.rstrip()) is not None

while True:
    refresh_surfaces_if_stale()
    pending = []
    for bs in browser_surfaces:
        raw = run(f"cmux browser eval --surface {bs} 'JSON.stringify(window.__cmuxInspectQueue || [])'")
        try:
            items = json.loads(raw)
        except Exception:
            continue
        for item in items:
            item['__source_surface'] = bs
            pending.append(item)

    if not pending:
        time.sleep(interval)
        continue

    consumed_by_source = {}  # surface_id → count
    for item in pending:
        target_id = resolve_surface(item.get('target') or default_target)
        if not target_id:
            log.warn(f"unknown target {item.get('target')}, skip")
            continue
        if not is_target_idle(target_id):
            log.info(f"target {target_id} busy, defer item {item['id']}")
            continue
        msg = format_single_line(item)
        run(f"cmux send --surface {target_id} {shlex.quote(msg)}")
        # 不发 enter，留给用户补充后自己回车
        consumed_by_source.setdefault(item['__source_surface'], 0)
        consumed_by_source[item['__source_surface']] += 1

    # 清队列（只清 idle 被消费的部分）
    for bs, n in consumed_by_source.items():
        run(f"cmux browser eval --surface {bs} "
            f"'window.__cmuxInspectQueue.splice(0, {n}); "
            f"sessionStorage.setItem(\"__cmuxInspectQueue\", JSON.stringify(window.__cmuxInspectQueue));'")
```

#### 4.2.5 daemon 生命周期

- **启动**：Node `child_process.spawn` 直接做 detach（**避免依赖 setsid，macOS 默认没有**）
  ```js
  const fd = fs.openSync('~/.cmux-inspect/watcher.log', 'a')
  const child = spawn(process.execPath, [watcherScriptPath, '--target', target, '--interval', interval], {
    detached: true,
    stdio: ['ignore', fd, fd]
  })
  child.unref()
  fs.writeFileSync('~/.cmux-inspect/watcher.pid', `${child.pid}|${target}|${Date.now()}`)
  ```
  `detached: true` + `stdio: ignore/fd` + `child.unref()` 三件套足以做到关 terminal 不影响。**不使用 `setsid` / 不依赖系统命令**。
- **pid 文件**：`~/.cmux-inspect/watcher.pid`，内容 `pid|target_ref|started_at_ms`
- **log**：`~/.cmux-inspect/watcher.log`，stdout/stderr 都 redirect 到此（append 模式）
- **状态查询**：`--status` 读 pid 文件 + `process.kill(pid, 0)` 验活（不 throw 即存活）
- **停止**：`--stop` 读 pid → `process.kill(pid, 'SIGTERM')` → 等 5s → `process.kill(pid, 'SIGKILL')` 兜底
- **重复启动保护**：启动前检测 pid 文件 + 进程存活，若已在跑则报错引导用户先 `--stop`

#### 4.2.6 错误处理

| 场景 | 处理 |
|---|---|
| `cmux browser eval` 失败（页面未加载完 / surface 关闭）| skip 该 surface 本轮 + log warn；连续 5 轮失败该 surface 摘除候选 |
| 目标 surface 消失 | log error + 跳过该 item（item 保留在 queue 中，等用户起新 surface 或改 target） |
| 目标 surface busy（非 idle prompt）| log info + 跳过本轮，下次重试；超过 30s 仍 busy 提示用户 |
| 队列堆积 > 10 条 | 浮层显示警告条 "queue 堆积 10+，请检查 daemon"；daemon 同时 log warn |
| inject.js 未注入（`window.__cmuxInspectQueue === undefined`）| 浮层根本不会出现；用户用 init 子命令注入新 surface 修复 |
| daemon 进程崩溃 | pid 文件残留但 `kill -0` 失败 → 用户 `--status` 看得到 → 手动 `--stop` 清 pid 文件再 `--start` |

### 4.3 init 脚本

```bash
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 init
```

执行步骤（伪代码）：

```python
# 1. 枚举 workspace 内的 browser surfaces
tree = run("cmux tree --json")
browser_surfaces = [s for s in tree.surfaces if s.type == "browser"]

if not browser_surfaces:
    print("⚠️ 当前 workspace 没有 browser surface，请先开一个 cmux browser 再 init")
    exit(1)

inject_js = read_bundled_asset("inject.js")  # bundle 后的浮层 + 监听器代码

# 2. 对每个 browser surface 注入（addinitscript = 未来加载, addscript = 立即生效）
# 注：inject.js 内部会先检测 window.__cmuxInspectTeardown 并调用之（自我幂等），
#    然后重新挂载，避免重复注入导致多个监听器叠加。
for bs in browser_surfaces:
    run(f"cmux browser addinitscript --surface {bs.id} --script {shlex.quote(inject_js)}")
    run(f"cmux browser addscript --surface {bs.id} --script {shlex.quote(inject_js)}")

# 3. 安装 skill
copy_dir("skills/cmux-inspect", "~/.claude/skills/cmux-inspect")

# 4. 安装 CLI 到 PATH
ensure_cli_link("cmux-inspect-bridge")  # symlink 或 npm link

# 5. 输出引导
print("✅ Init 完成")
print(f"  浏览器注入：{len(browser_surfaces)} 个 surface")
print(f"  CLI：cmux-inspect-bridge --version")
print(f"  Skills：/inspect-watch, /inspect-status, /inspect-stop")
print()
print("下一步：")
print("  1. 在 cmux terminal 跑 /inspect-watch qwen 启动 daemon")
print("  2. cmux browser Alt+Click 任意元素试试")
```

#### CLI 子命令一览

- `init`：完整初始化（注入所有 browser surface + 装 skill + 装 CLI）
- `inject [--surface surface:N | --all]`：仅注入到指定 / 所有 browser surface（用于新开 browser 后补注入）
- `doctor`：诊断当前 workspace 状态（browser surface 数 / 注入状态 / daemon pid / 队列长度 / target 可达性）
- `watch --target <name|ref>`：启动 daemon
- `watch --status`：daemon 状态
- `watch --stop`：停止 daemon

> **【v0.1.0 范围说明】**
>
> - cmux 当前 CLI 没有 `remove-init-script` 类 API，因此 v0.1.0 **不提供 `uninject` 子命令**
> - 浮层注入侧内置幂等：`inject.js` 入口检测 `window.__cmuxInspectTeardown`，存在则先调（移除旧 listener + 旧 DOM），再挂载新版。这样重复注入不会叠加
> - 用户要彻底"卸载"需关掉 browser surface 重开（addinitscript 内容随 surface 生命周期清理）
> - 未来如果 cmux 加了 `remove-init-script`，再实现真正的 `uninject` 子命令

---

## 5. 分发与版本

- **GitHub**：[hxppk/cmux-inspect-bridge](https://github.com/hxppk/cmux-inspect-bridge)
- **首版 tag**：`v0.1.0`（语义化版本，全文统一使用 `v0.1.0` 形式，不写 `v0.1` 简写）
- **安装命令**：`npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1.0 init`
- **package.json bin**：暴露 `cmux-inspect-bridge` CLI

---

## 6. 风险与未决

| 风险 | 缓解 |
|---|---|
| Alt+Click 与系统快捷键冲突（Mac Alt+Click 拖拽窗口）| 提供 `--trigger` 参数切换为 Shift+Alt+Click |
| iframe 内元素无法捕获 | 注入时通过 `--all-frames`（如 cmux 支持）兜底；不支持则文档说明限制 |
| 轮询造成 CPU 浪费 | 默认 1.5s 间隔，可配置；空闲时 daemon 自动延长间隔到 5s |
| Shadow DOM 元素 selector 不准 | best-effort，附 outerHTML 让 AI 兜底识别 |
| SPA 路由切换 / 整页 reload 后 queue 丢失 | `addinitscript` 在每次新 page load 自动重跑（重建 init script），同时 sessionStorage 作为 page-scoped 持久化兜底；浮层 send 同步双写（见 §3.2 持久化）|
| addinitscript scope 是 per-surface，不是 workspace | init 子命令枚举所有 browser surface 单独注入；新开 browser surface 需要重新 `cmux-inspect-bridge inject` |
| target surface 正在执行别的任务 | daemon `is_target_idle` 检测末尾 prompt，busy 时延后推送 |
| cmux send 把 LF 当 Enter 触发提交 | payload 强制单行，textarea 输入侧 `.replace(/\n/g, ' ')` |
| target name 重名造成误送 | 浮层下拉显式区分如 `qwen [surface:11]`；send 时固化 `target_ref="surface:N"`，daemon 只信 ref |
| macOS 没有 `setsid` 命令 | daemon 启动改用 Node `child_process.spawn(..., {detached:true, stdio:[ignore,fd,fd]}); child.unref()`，不依赖系统 setsid/nohup |
| cmux 当前 CLI 没有 remove-init-script API | v0.1.0 不提供 `uninject`；改靠 inject.js 自身的幂等 teardown（`window.__cmuxInspectTeardown`）；用户彻底卸载需关 browser surface |

---

## 7. 后续可加（YAGNI 范围外）

- 浮层加历史记录（最近 N 条点击）
- 浮层加"截图区域"（捕获元素 bounding rect 的 png base64）→ 装修类需求可用
- 浮层加多元素批量选择
- 浏览器扩展形态（脱离 cmux）

---

## 8. 实现里程碑（粗）

- **M0**：基础注入 + 监听 + 浮层骨架（浏览器侧能跑）；手动用 `cmux browser eval` 喂 inject.js 验证浮层弹出 + queue push 正常
- **M1**：daemon 单 browser surface + 单 target 推送；包含 idle 检测和 sessionStorage 兜底
- **M2**：多 browser surface 合并轮询 + busy 重试 + 错误日志
- **M3**：CLI 包装 (`init` / `inject` / `uninject` / `doctor` / `watch --start/--status/--stop`) + slash skill 三件套
- **M4**：分发包 + npx init + README + tag `v0.1.0` + Pages 演示页

每个 milestone 结束时手动验收：
- M0：浮层弹出 + textarea 输入 + sessionStorage 写入正常
- M1：cmux browser 点元素 → 浮层发送 → 1.5s 内 qwen 输入框出现 single-line payload
- M2：开 2 个 cmux browser surface + 故意让 target busy → 验证 busy defer + 双 surface 合并
- M3：CLI 各子命令 + skill triple 都跑得通
- M4：从空仓干净环境 `npx init` 一键安装
