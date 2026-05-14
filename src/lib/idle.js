// 末尾严格 prompt 检测：用于 shell idle ($/>/#)
const STRICT_PROMPT_RE = /[❯>$#]\s*$/;

// 宽松 prompt 检测：扫描最后 N 行寻找 "❯ " 这种 TUI 输入框（qwen/claude/codex 类 agent
// 的尾部往往是状态栏 "⏵⏵ bypass permissions on · 1 shell" 而非 prompt 字符）。
// 命中 "❯ " 后面紧跟空白或文本，视为 agent 在等输入即 idle。
const AGENT_PROMPT_RE = /❯\s/;

function isIdle(screen) {
  if (!screen) return false;
  // 先严格匹配末尾
  if (STRICT_PROMPT_RE.test(screen.replace(/\s+$/, ' '))) return true;
  // 兜底：最后 10 行内任意出现 "❯ "（agent TUI 输入框标志）
  const tail = screen.split('\n').slice(-10).join('\n');
  return AGENT_PROMPT_RE.test(tail);
}

module.exports = { isIdle };
