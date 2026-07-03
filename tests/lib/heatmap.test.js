import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Production blank-screen regression: heatmap.js's UMD wrapper used the module's
// top-level `this` as its global context, which is `undefined` in an ES module
// (Vite/Rollup) → "Cannot set properties of undefined (setting 'h337')" → the
// whole bundle throws and the SPA renders blank. The patch passes `window`.
//
// This can't be reproduced by importing the file here: vitest provides a CJS
// `module`, so the file takes the `module.exports` branch rather than the
// production-only global-assignment branch that fails. So we guard the patch
// source directly — if someone re-vendors heatmap.js and drops it, this fails.
describe('heatmap-patched UMD context patch', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../src/lib/heatmap-patched.js', import.meta.url)),
    'utf8'
  );

  it('passes window (not bare top-level `this`) as the h337 global context', () => {
    expect(src).toContain('"h337", typeof window !== "undefined" ? window : this');
    expect(src).not.toMatch(/\}\)\("h337",\s*this,/);
  });
});
