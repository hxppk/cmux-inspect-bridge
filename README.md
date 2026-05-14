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
