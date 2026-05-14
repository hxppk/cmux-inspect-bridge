const PROMPT_RE = /[❯>$#]\s*$/;

export function isIdle(screen) {
  if (!screen) return false;
  return PROMPT_RE.test(screen.replace(/\s+$/, ' '));
}
