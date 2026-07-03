import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // React plugin so component tests can render JSX (server/logic tests ignore it).
  plugins: [react()],
  test: {
    // Default environment is Node (server/db/logic). Component tests opt into
    // jsdom per-file via a `// @vitest-environment jsdom` docblock (TEST-03).
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
});
