const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/dom/**/*.test.js', 'jsdom']
    ],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
