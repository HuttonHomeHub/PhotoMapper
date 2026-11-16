import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import { hhhVitest } from '@hhh/config/vitest';

// Coverage gate: the standard is 80% of lines. PhotoMapper started phase 3 at 35.2%
// (2026-11-16); each phase 3 PR raises this to the level it measures, ending at 80%.
const LINES_FLOOR = 41.1;

export default mergeConfig(
  hhhVitest({
    include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
    coverageInclude: ['server/**/*.{js,ts}', 'src/**/*.{js,jsx,ts,tsx}'],
  }),
  defineConfig({
    // React plugin so component tests can render JSX. Server and logic tests run in
    // Node; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    plugins: [react()],
    test: {
      coverage: {
        // A patched copy of the third-party heatmap.js library, not PhotoMapper's code.
        exclude: ['src/lib/heatmap-patched.js'],
        thresholds: { lines: LINES_FLOOR },
      },
    },
  })
);
