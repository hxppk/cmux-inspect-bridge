#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv[0];

const commands = {
  watch: () => require('../src/cli/watch').run(argv.slice(1)),
  init: () => require('../src/cli/init').run(argv.slice(1)),
  inject: () => require('../src/cli/inject').run(argv.slice(1)),
  doctor: () => require('../src/cli/doctor').run(argv.slice(1)),
};

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`cmux-inspect-bridge v${require('../package.json').version}

用法：
  cmux-inspect-bridge init                注入到所有 browser surface + 装 skill
  cmux-inspect-bridge inject [--surface s | --all]
                                          补注入到指定/所有 browser surface
  cmux-inspect-bridge doctor              诊断状态
  cmux-inspect-bridge watch --target <name|ref> [--interval 1.5]
                                          启动 daemon
  cmux-inspect-bridge watch --status      查看 daemon 状态
  cmux-inspect-bridge watch --stop        停止 daemon`);
  process.exit(0);
}

if (cmd === '--version' || cmd === '-V') {
  console.log(require('../package.json').version);
  process.exit(0);
}

if (!commands[cmd]) {
  console.error(`Error: unknown subcommand "${cmd}"`);
  process.exit(2);
}

commands[cmd]();
