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
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1 init
```

执行内容：
- 把 `inject.js` 通过 `cmux browser addinitscript` 注入到当前 workspace 的所有 browser surface
- 把 `inspect-watch` skill 装到 `~/.claude/skills/cmux-inspect/`
- 输出使用说明

之后用户在任一 cmux terminal 启动 polling：

```text
/inspect-watch qwen
```

skill 在后台运行（输出"Watching... target=qwen, interval=1.5s"），关掉 terminal 不影响。

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

skill 推送到 qwen 输入框的拼好文本：

```text
[cmux-inspect] 资源位置: https://example.com/page#/section
选择器: button.ant-btn-primary[data-x="y"]
HTML 片段: <button class="ant-btn ant-btn-primary" type="button"><span>提交</span></button>

需求: 把这个按钮颜色改浅一点
```

格式紧凑 + 单行 + AI 解析友好。

---

## 3. 架构

### 3.1 三个组件

```text
┌─────────────────────────┐         ┌─────────────────────────┐
│ cmux browser surface    │         │ cmux terminal surface   │
│                         │         │ (claude or qwen)        │
│ ┌─────────────────────┐ │         │                         │
│ │ inject.js (浮层 +   │ │ poll    │  /inspect-watch skill   │
│ │ 监听器)             │◀┼─────────┤  (background loop)     │
│ │                     │ │ 1.5s    │                         │
│ │ window.__cmux       │ │         │  cmux browser eval +    │
│ │ InspectQueue: [...] │ │         │  cmux send --surface    │
│ └─────────────────────┘ │         │                         │
└─────────────────────────┘         └─────────────────────────┘
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
  id: string         // 短 nonce
  ts: number         // unix ms
  url: string        // location.href
  selector: string   // best-effort CSS selector
  outerHTML: string  // truncated to 500 chars
  request: string    // 用户在浮层输入的需求文字
  target: string     // surface 名 e.g. "qwen"
}

window.__cmuxInspectQueue: InspectItem[]
```

### 3.3 关键数据流

1. **Alt+Click**：浮层捕获元素并写 selector / outerHTML / url 到浮层暂存对象
2. **点发送**：拼好 `InspectItem` push 进 `window.__cmuxInspectQueue` + 浮层关闭
3. **skill 轮询**：每 1.5s 用 `cmux browser eval "JSON.stringify(window.__cmuxInspectQueue)"` 拉队列
4. **skill 推送**：对每个 item：
   ```bash
   cmux send --surface surface:<target_id> "<format_message(item)>"
   ```
   注意不发 enter（保留用户补充机会）
5. **skill 清队列**：成功推送后 `cmux browser eval "window.__cmuxInspectQueue.splice(0, N)"`

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
1. 如果元素有 `id` → `#<id>`
2. 如果元素有 `data-testid` / `data-test` → `[data-testid="..."]`
3. 否则按"标签 + class（最多 3 个）+ 父元素 nth-of-type"组装

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

### 4.2 inspect-watch skill — 轮询与推送

#### 4.2.1 启动语法

```text
/inspect-watch [target_surface] [--interval 1.5]
```

- `target_surface`：默认 surface 名（如 qwen / claude），未指定时报错引导
- 启动后输出："Watching... target=qwen, interval=1.5s"

#### 4.2.2 surface 解析

启动时调 `cmux tree` 校验目标 surface 存在；不存在则 fail-fast 报错。

#### 4.2.3 轮询循环（伪代码）

```python
while True:
    raw = run("cmux browser eval --surface surface:N 'JSON.stringify(window.__cmuxInspectQueue || [])'")
    items = json.loads(raw)
    if not items:
        sleep(interval)
        continue

    for item in items:
        target_id = resolve_surface(item.target or default_target)
        msg = format_message(item)
        run(f"cmux send --surface {target_id} {shlex.quote(msg)}")
        # 不发 enter

    # 清队列
    n = len(items)
    run(f"cmux browser eval 'window.__cmuxInspectQueue.splice(0, {n})'")
```

#### 4.2.4 错误处理

| 场景 | 处理 |
|---|---|
| `cmux browser eval` 失败（页面未加载完）| skip 本轮，等下次 |
| 目标 surface 消失（被关）| 浮层下次发送时给出明显错误提示；skill 报错并退出 |
| 队列堆积 > 10 条 | 浮层显示警告"queue 堆积 10+，请检查 /inspect-watch 是否在运行" |
| inject.js 未注入（队列 undefined）| 浮层不会出现；skill 检测到 undefined 时提示"请先 init" |

### 4.3 init 脚本

```bash
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1 init
```

做三件事：

1. 把 `inject.js` 内容通过 `cmux browser addinitscript --workspace <current> --script <content>` 注入到当前 workspace 的所有 browser surface
2. clone / 复制 `skills/inspect-watch/SKILL.md` 到 `~/.claude/skills/cmux-inspect/`
3. 输出多行 setup 完成提示 + 下一步引导

---

## 5. 分发与版本

- **GitHub**：[hxppk/cmux-inspect-bridge](https://github.com/hxppk/cmux-inspect-bridge)
- **首版 tag**：`v0.1.0`
- **安装命令**：`npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1 init`
- **package.json bin**：暴露 `cmux-inspect-bridge` CLI

---

## 6. 风险与未决

| 风险 | 缓解 |
|---|---|
| Alt+Click 与系统快捷键冲突（Mac Alt+Click 拖拽窗口）| 提供 `--trigger` 参数切换为 Shift+Alt+Click |
| iframe 内元素无法捕获 | 注入时通过 `--all-frames`（如 cmux 支持）兜底；不支持则文档说明限制 |
| 轮询造成 CPU 浪费 | 默认 1.5s 间隔，可配置；空闲时 skill 自动延长间隔到 5s |
| Shadow DOM 元素 selector 不准 | best-effort，附 outerHTML 让 AI 兜底识别 |
| Pages 部署后 SPA 路由切换 `window.__cmuxInspectQueue` 是否保留？| 是的，全局 `window` 跨路由仍存在，但需测试 SPA 框架的 history.pushState 不会让 init-script 重跑 |

---

## 7. 后续可加（YAGNI 范围外）

- 浮层加历史记录（最近 N 条点击）
- 浮层加"截图区域"（捕获元素 bounding rect 的 png base64）→ 装修类需求可用
- 浮层加多元素批量选择
- 浏览器扩展形态（脱离 cmux）

---

## 8. 实现里程碑（粗）

- M0：基础注入 + 监听 + 浮层骨架（浏览器侧能跑）
- M1：skill 单独 surface 单条推送
- M2：错误处理 + 队列清理
- M3：分发包 + npx init + README + tag v0.1.0
