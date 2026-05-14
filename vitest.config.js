const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/inject/**', 'jsdom'],
    ],
  },
});
