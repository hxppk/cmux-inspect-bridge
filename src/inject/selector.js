// CSS.escape polyfill for jsdom/test environments
function cssEscape(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(str);
  }
  // Simple polyfill: escape special CSS characters
  return str.replace(/[!"#$%&'()*+,./:;=?@[\\\]^`{|}~\s]/g, '\\$&');
}

function genSelector(el) {
  if (!el || el.nodeType !== 1) return '';

  // 1. prefer id
  if (el.id) return '#' + cssEscape(el.id);

  // 2. data-testid / data-test
  const testid = el.getAttribute('data-testid') || el.getAttribute('data-test');
  if (testid) return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;

  // 3. tag + class[0..3] + nth-of-type
  const tag = el.tagName.toLowerCase();
  const classes = (el.className && typeof el.className === 'string')
    ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
    : [];
  const classPart = classes.map(c => '.' + cssEscape(c)).join('');

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
module.exports.default = { genSelector };
