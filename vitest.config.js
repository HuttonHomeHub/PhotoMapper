import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import { hhhVitest } from '@hhh/config/vitest';

// Coverage gate: the standard is 80% of lines. PhotoMapper starts phase 3 at the
// level measured on 2026-11-16 (35.2%) and every phase 3 PR must raise it; phase 3 ends at 80%.
const LINES_FLOOR = 35;

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
