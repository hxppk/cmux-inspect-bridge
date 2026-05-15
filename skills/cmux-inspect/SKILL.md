---
name: cmux-inspect
description: cmux browser Alt+Click 元素 → 浮层提需求 → 自动推到目标 terminal surface 输入框（替代截图工作流）。一个 toggle slash command 控制 daemon 开关。Use when 用户输入 /inspect / /inspect-watch / /inspect-status / /inspect-stop / /inspect-on / /inspect-off 或表达 "启动 inspect" "停掉 inspect daemon" "开 inspect 推到 qwen" 这类意图。
---

# cmux-inspect

替代「截图 → 切窗口 → 粘贴 → 描述」工作流：cmux browser Alt+Click 元素 → 浮层提需求 → 自动推到目标 terminal surface 输入框。

完整设计：https://github.com/hxppk/cmux-inspect-bridge

## 主命令：`/inspect`

**单命令 toggle 模式**，参数决定行为：

| 用户输入 | 你的动作 |
|---|---|
| `/inspect` | 先 `--status`：未运行 → 用默认 target（先 qwen，其次任意 terminal surface）`--target qwen` 启动；已运行 → `--stop` |
| `/inspect <target>` | `--target <target>` 启动（如 `/inspect codex`、`/inspect surface:11`）|
| `/inspect on [<target>]` | 与 `/inspect <target>` 同义；缺省 target = qwen |
| `/inspect off` 或 `/inspect stop` | `--stop` |
| `/inspect status` | `--status` |

执行映射到 CLI（**不要直接调底层 bin，统一走 bash 包装**，可用 `~/cmux-inspect-bridge/bin/cmux-inspect-bridge.js` 路径调用 node）：

```bash
node ~/cmux-inspect-bridge/bin/cmux-inspect-bridge.js watch --target <target>
node ~/cmux-inspect-bridge/bin/cmux-inspect-bridge.js watch --status
node ~/cmux-inspect-bridge/bin/cmux-inspect-bridge.js watch --stop
```

如果用户 `npm link` 过，则可直接 `cmux-inspect-bridge watch ...`。先试简短形式，失败再 fallback 用绝对 node 路径。

## 行为细节

### toggle 判断流程

1. 跑 `watch --status`
2. 如果输出含 `daemon: running` → 跑 `watch --stop`
3. 否则跑 `watch --target <target>`（无参数时 target = qwen，若 qwen 不存在则取 `cmux tree` 中第一个 terminal surface name）

### 输出格式给用户

- 启动成功：返回 `pid` + `target_ref` + log 路径
- 停止成功：返回 `daemon stopped` 标识
- 已经在运行（toggle 触发停止）：返回 `daemon stopped`，并提示用户「再 /inspect 一次启动」

### 触发后立刻返回，不要 babysit

执行命令拿到输出后**直接报告**，**不要轮询 status / 不要循环检查 / 不要等用户 Alt+Click**。toggle 完成即任务完成。

## 兼容历史命令

为兼容，以下旧命令保留，行为映射到 `/inspect`：

- `/inspect-watch <target>` → `/inspect <target>`
- `/inspect-status` → `/inspect status`
- `/inspect-stop` → `/inspect off`
- `/inspect-on [<target>]` → `/inspect on <target>`
- `/inspect-off` → `/inspect off`

## 前置依赖

- 已运行过 `cmux-inspect-bridge init`（注入 inject.js 到 browser surface + 装本 skill）
- 当前 cmux workspace 内至少 1 个 terminal surface 可作为推送目标

## 故障排查（运行时遇到）

| 现象 | 处理 |
|---|---|
| `target "qwen" not found` | 跑 `cmux tree` 看实际名字，给用户选；或建议改用 `surface:N` 直接定位 |
| `daemon already running` | toggle 流程应已自动 stop；如果用户直接 `/inspect codex` 想换 target，先 `--stop` 再 `--target` |
| 用户 Alt+Click 没浮层 | 提示先 `cmux-inspect-bridge inject --all` 或 `cmux-inspect-bridge doctor` 看注入状态 |
