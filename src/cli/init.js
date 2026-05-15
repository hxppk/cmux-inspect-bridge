// src/cli/init.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listBrowserSurfaces } = require('../lib/surfaces');
const { injectTo, readBundle } = require('./inject');

const SKILLS_SRC = path.join(__dirname, '..', '..', 'skills', 'inspect');
const SKILLS_DEST = path.join(os.homedir(), '.claude', 'skills', 'inspect');

function copySkill() {
  fs.mkdirSync(SKILLS_DEST, { recursive: true });
  // skip if source missing (Task 18 creates it; init can be re-run after)
  if (!fs.existsSync(SKILLS_SRC)) {
    return { copied: 0, missing: true };
  }
  let copied = 0;
  for (const f of fs.readdirSync(SKILLS_SRC)) {
    fs.copyFileSync(path.join(SKILLS_SRC, f), path.join(SKILLS_DEST, f));
    copied++;
  }
  return { copied, missing: false };
}

function run() {
  // 1. 枚举 browser surfaces
  const surfaces = listBrowserSurfaces();
  if (surfaces.length === 0) {
    console.error('⚠️  No browser surface in current workspace. Open a cmux browser first and retry.');
    process.exit(2);
  }

  // 2. 注入
  const bundle = readBundle();
  for (const s of surfaces) {
    try {
      injectTo(s, bundle);
      console.log(`✓ injected → ${s.id} (${s.name || ''})`);
    } catch (e) {
      console.error(`✗ inject failed for ${s.id}: ${e.message}`);
    }
  }

  // 3. 装 skill
  try {
    const r = copySkill();
    if (r.missing) {
      console.log(`⚠️  skills source missing (${SKILLS_SRC}) — skipping; will be created by Task 18`);
    } else {
      console.log(`✓ skills installed → ${SKILLS_DEST} (${r.copied} files)`);
    }
  } catch (e) {
    console.error(`✗ skill install failed: ${e.message}`);
  }

  // 4. 引导
  console.log('');
  console.log('✅ Init 完成');
  console.log('');
  console.log('下一步：');
  console.log('  1. 在 cmux terminal 跑 /inspect-watch qwen 启动 daemon');
  console.log('  2. cmux browser Alt+Click 任意元素 → 浮层打需求 → 发送');
  console.log('  3. qwen 输入框出现 single-line payload，你补充后回车提交');
}

module.exports = { run };
