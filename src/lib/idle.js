const PROMPT_RE = /[❯>$#]\s*$/;

function isIdle(screen) {
  if (!screen) return false;
  return PROMPT_RE.test(screen.replace(/\s+$/, ' '));
}

module.exports = { isIdle };
