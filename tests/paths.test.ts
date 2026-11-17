import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Shared container standard: DATA_DIR holds all state; DB_PATH and UPLOADS_DIR default
// inside it; the old PHOTOS_DB_PATH still works and is reported as deprecated.
const NAMES = ['DATA_DIR', 'DB_PATH', 'PHOTOS_DB_PATH', 'UPLOADS_DIR'];
let saved: Record<string, string | undefined>;
let tmpDir: string;

async function loadPaths(env: Record<string, string>) {
  for (const n of NAMES) Reflect.deleteProperty(process.env, n);
  Object.assign(process.env, env);
  vi.resetModules();
  return import('../server/paths.ts');
}

beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-paths-'));
});

afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) Reflect.deleteProperty(process.env, n);
    else process.env[n] = saved[n] as string;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('data paths (shared container standard)', () => {
  it('DATA_DIR sets the default database and uploads locations', async () => {
    const paths = await loadPaths({ DATA_DIR: tmpDir });
    expect(paths.dbPath).toBe(join(tmpDir, 'photos.db'));
    expect(paths.uploadsDir).toBe(join(tmpDir, 'uploads'));
    expect(paths.deprecatedSettings).toEqual([]);
  });

  it('DB_PATH and UPLOADS_DIR override DATA_DIR', async () => {
    const paths = await loadPaths({
      DATA_DIR: tmpDir,
      DB_PATH: join(tmpDir, 'other.db'),
      UPLOADS_DIR: join(tmpDir, 'pics'),
    });
    expect(paths.dbPath).toBe(join(tmpDir, 'other.db'));
    expect(paths.uploadsDir).toBe(join(tmpDir, 'pics'));
  });

  it('the old PHOTOS_DB_PATH still works and is reported as deprecated', async () => {
    const paths = await loadPaths({ DATA_DIR: tmpDir, PHOTOS_DB_PATH: join(tmpDir, 'old.db') });
    expect(paths.dbPath).toBe(join(tmpDir, 'old.db'));
    expect(paths.deprecatedSettings).toEqual([['PHOTOS_DB_PATH', 'DB_PATH']]);
  });

  it('DB_PATH wins over PHOTOS_DB_PATH', async () => {
    const paths = await loadPaths({
      DB_PATH: join(tmpDir, 'new.db'),
      PHOTOS_DB_PATH: join(tmpDir, 'old.db'),
    });
    expect(paths.dbPath).toBe(join(tmpDir, 'new.db'));
    expect(paths.deprecatedSettings).toEqual([]);
  });
});
