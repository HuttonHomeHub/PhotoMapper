import { describe, it, expect, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// A database written by v1.2.0 records migrations 1-6 in `schema_migrations` without a
// checksum column. Opening it adds the column ('legacy' for those rows), so the shared
// kit's runner can use the table, keeps the rows where v1.2.0 expects them, and
// switches the database to WAL.
const dir = mkdtempSync(join(tmpdir(), 'photomapper-handover-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('migration hand-over from v1.2.0', () => {
  it('keeps the data and the old records, and adds the checksum column', async () => {
    const dbPath = join(dir, 'photos.db');
    process.env.DB_PATH = dbPath;
    process.env.BACKUP_DIR = join(dir, 'backups');

    // Build a current database, then put schema_migrations back in v1.2.0's shape.
    vi.resetModules();
    let dbmod = await import('../server/db.ts');
    dbmod.createClient({ id: 'c1', name: 'Kept', createdAt: 'x', updatedAt: 'x' });
    dbmod.closeDb();
    const old = new Database(dbPath);
    old.exec('ALTER TABLE schema_migrations DROP COLUMN checksum');
    old.pragma('journal_mode = DELETE');
    old.close();

    vi.resetModules();
    dbmod = await import('../server/db.ts');
    expect(dbmod.getAllClients().map((c) => c.name)).toEqual(['Kept']);

    const db = dbmod.getDb();
    const rows = db
      .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
      .all();
    expect(rows).toEqual([1, 2, 3, 4, 5, 6].map((version) => ({ version, checksum: 'legacy' })));
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

    // v1.2.0's runner would insert without a checksum; the default keeps that working.
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, ?, ?)').run(
      'old-style',
      'now'
    );
    db.prepare('DELETE FROM schema_migrations WHERE version = 99').run();

    // Opening again changes nothing.
    dbmod.closeDb();
    vi.resetModules();
    dbmod = await import('../server/db.ts');
    const count = dbmod
      .getDb()
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')
      .get();
    expect(count?.n).toBe(6);
    dbmod.closeDb();
  });
});
