# cmux-inspect-bridge

在 cmux browser pane 内 **Alt+Click** 元素 → 浮层提需求 → 自动推到 claude/qwen 输入框。

替代 「截图 → 切窗口 → 粘贴 → 描述」 的传统工作流。

## 状态

🚧 设计阶段。完整设计文档：[docs/specs/2026-05-14-cmux-inspect-bridge-design.md](./docs/specs/2026-05-14-cmux-inspect-bridge-design.md)

## 核心交互

1. cmux terminal 启动一次后台轮询：
   ```bash
   /inspect-watch qwen
   ```
2. cmux browser 任意页面 **Alt+Click** UI 元素
3. 浮层弹出，textarea 里描述需求 → 选 target surface → 发送
4. qwen 输入框出现 `(元素信息 + 需求文字)`，光标在末尾，回车提交

## 设计要点

- 零外部 daemon，纯 cmux 原生（`browser eval` + `browser addinitscript` + `send` 三个 CLI）
- 浏览器 in-memory 队列 + skill 后台轮询（1.5s）
- best-effort selector + outerHTML 让 AI 自己 grep 源码
- 不依赖 Vite 插件，dev / prod / GitHub Pages 都能用

## 安装（设计稿）

```bash
npx --yes cmux-inspect-bridge@github:hxppk/cmux-inspect-bridge#v0.1 init
```
