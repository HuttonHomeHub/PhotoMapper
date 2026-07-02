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
    },
  },
})
