import { hhhConfig } from '@hhh/config/eslint';

export default hhhConfig({
  browser: ['src/**/*.{js,jsx,ts,tsx}', 'tests/components/**', 'tests/hooks/**'],
  // The React rules (hooks included) cover hooks in .ts files too.
  react: ['src/**/*.{ts,tsx}', 'tests/**/*.tsx'],
  node: [
    'server/**/*.{js,ts}',
    'tests/**/*.ts',
    'e2e/**/*.ts',
    '*.config.{js,ts}',
    'scripts/**/*.ts',
  ],
  ignores: ['dist/**', 'coverage/**', 'e2e-results/**', 'src/lib/heatmap-patched.js'],
});
