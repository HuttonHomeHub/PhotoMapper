import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashFile } from '../server/services/hash.js';

// TEST-02: content hashing underpins upload de-duplication (SEC/PERF-07), so it
// gets a direct, deterministic test.

const dir = mkdtempSync(join(tmpdir(), 'photomapper-hash-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fileWith(name, contents) {
  const p = join(dir, name);
  writeFileSync(p, contents);
  return p;
}

describe('hashFile', () => {
  it('computes the known SHA-256 of a file', async () => {
    const p = fileWith('hello.txt', 'hello');
    expect(await hashFile(p)).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('is stable for identical content and differs for different content', async () => {
    const a = fileWith('a.bin', 'same-bytes');
    const b = fileWith('b.bin', 'same-bytes');
    const c = fileWith('c.bin', 'other-bytes');
    const [ha, hb, hc] = await Promise.all([hashFile(a), hashFile(b), hashFile(c)]);
    expect(ha).toBe(hb);
    expect(ha).not.toBe(hc);
  });

  it('rejects when the file does not exist', async () => {
    await expect(hashFile(join(dir, 'nope.bin'))).rejects.toThrow();
  });
});
