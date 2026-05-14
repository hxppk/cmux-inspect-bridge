const MAX_LEN = 2048;

function singleLine(s) {
  return String(s || '').replace(/\r?\n/g, ' ');
}

function formatPayload(item) {
  const fields = [
    `url=${singleLine(item.url)}`,
    `selector=${singleLine(item.selector)}`,
    `html=${singleLine(item.outerHTML)}`,
    `需求=${singleLine(item.request)}`,
  ];
  let out = `[cmux-inspect] ${fields.join('; ')}`;
  if (out.length > MAX_LEN) {
    // truncate html field
    const overflow = out.length - MAX_LEN + '...truncated'.length;
    const htmlIdx = fields.findIndex(f => f.startsWith('html='));
    const html = fields[htmlIdx].slice('html='.length);
    fields[htmlIdx] = `html=${html.slice(0, html.length - overflow)}...truncated`;
    out = `[cmux-inspect] ${fields.join('; ')}`;
  }
  return out;
}

module.exports = { formatPayload };
