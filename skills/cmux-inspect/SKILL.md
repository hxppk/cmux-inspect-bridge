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
