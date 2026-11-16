import { hhhConfig } from '@hhh/config/eslint';

const config = hhhConfig({
  browser: ['src/**/*.{js,jsx,ts,tsx}', 'tests/components/**', 'tests/hooks/**'],
  react: ['src/**/*.{jsx,tsx}', 'tests/**/*.{jsx,tsx}'],
  node: ['server/**/*.{js,ts}', 'tests/**/*.{js,ts}', '*.config.{js,ts}', 'scripts/**/*.ts'],
  ignores: ['dist/**', 'coverage/**', 'src/lib/heatmap-patched.js'],
});

// Transition (phase 3): the JavaScript that hasn't been converted to TypeScript yet
// keeps its default exports. Remove this block once nothing under src/ or server/ is
// .js/.jsx (phase 3, PR 4).
export default [
  ...config,
  {
    files: ['**/*.{js,jsx}'],
    rules: {
      'no-restricted-exports': 'off',
      // Fixed during the TypeScript conversion (Maps instead of delete; derived state
      // instead of setState in effects).
      '@typescript-eslint/no-dynamic-delete': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
