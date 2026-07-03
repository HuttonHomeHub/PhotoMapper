import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runMigrations } from '../server/migrate.js';

const cleanup = [];
afterAll(() => cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('runMigrations', () => {
  it('applies pending migrations once and records versions', () => {
    const db = new Database(':memory:');
    const migrations = [
      { version: 1, name: 'a', up: (d) => d.exec('CREATE TABLE a (x)') },
      { version: 2, name: 'b', up: (d) => d.exec('CREATE TABLE b (x)') },
    ];
    const first = runMigrations(db, migrations);
    expect(first.applied).toEqual([1, 2]);

    // second run is a no-op (already recorded)
    const second = runMigrations(db, migrations);
    expect(second.applied).toEqual([]);

    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    db.close();
  });

  it('fails loudly and does not record a throwing migration', () => {
    const db = new Database(':memory:');
    const migrations = [
      { version: 1, name: 'ok', up: (d) => d.exec('CREATE TABLE ok (x)') },
      {
        version: 2,
        name: 'boom',
        up: () => {
          throw new Error('migration failed');
        },
      },
    ];
    expect(() => runMigrations(db, migrations)).toThrow('migration failed');
    const recorded = db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version);
    expect(recorded).toContain(1);
    expect(recorded).not.toContain(2);
    db.close();
  });
});

describe('legacy upgrade path (db.js baseline)', () => {
  it('preserves existing data, adds new columns, and writes a backup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'photomapper-upgrade-'));
    cleanup.push(dir);
    const dbPath = join(dir, 'legacy.db');

    // Seed a pre-migration-runner ("v0") photos table with a row.
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE photos (
        id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT NOT NULL,
        uploaded_at TEXT NOT NULL, has_gps INTEGER NOT NULL DEFAULT 0,
        lat REAL, lng REAL, altitude REAL, img_direction REAL, date_taken TEXT,
        camera_make TEXT, camera_model TEXT, focal_length REAL, f_number REAL,
        iso INTEGER, exposure_time TEXT
      )
    `);
    legacy
      .prepare(
        'INSERT INTO photos (id, filename, original_name, uploaded_at, has_gps, date_taken) VALUES (?,?,?,?,?,?)'
      )
      .run('legacy-1', 'f.jpg', 'F.jpg', '2020-01-01T00:00:00.000Z', 0, '2020-05-05T10:00:00.000Z');
    legacy.close();

    // Import db.js against it → the baseline migration runs.
    process.env.PHOTOS_DB_PATH = dbPath;
    const dbmod = await import('../server/db.js');

    const all = dbmod.getAllPhotos();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('legacy-1');
    // new columns exist and back-fill worked
    expect(all[0].tags).toEqual([]);
    expect(all[0].surveyDate).toBe('2020-05-05'); // derived from date_taken by the migration

    // a backup snapshot was written before mutating the existing DB
    const backups = readdirSync(dir).filter((f) => f.startsWith('legacy.db.backup-'));
    expect(backups).toHaveLength(1);

    // ARCH-04: the unused collections tables are dropped by migration v4.
    const inspect = new Database(dbPath, { readonly: true });
    const tables = inspect
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    inspect.close();
    expect(tables).not.toContain('collections');
    expect(tables).not.toContain('photo_collections');
  });
});
