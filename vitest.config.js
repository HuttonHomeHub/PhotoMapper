import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Server/db and pure-logic tests run in Node. Component tests (TEST-03)
    // will add a jsdom project later.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**/*.js', 'src/**/*.{js,jsx}'],
      // TEST-05: gate only the surface currently under test so the threshold is
      // meaningful and non-flaky. Ratchet up and add global thresholds as
      // TEST-02 (server routes) and TEST-03 (components) land.
      thresholds: {
        'server/db.js': {
          statements: 75,
          branches: 50,
          functions: 65,
          lines: 75,
        },
      },
    },
  },
})
