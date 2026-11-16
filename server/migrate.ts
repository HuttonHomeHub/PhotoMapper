// ARCH-03: a small, versioned migration runner.
//
// Improvements over the previous approach (a pile of `try { ALTER } catch {}`
// that swallowed every error):
//   - records applied versions in `schema_migrations` (skips them next boot);
//   - takes a consistent VACUUM INTO backup before applying anything to a DB
//     that already holds data (safety net for the destructive steps);
//   - fails loudly — a genuine migration error propagates instead of being
//     silently ignored;
//   - gives future migrations a clean home (they no longer need to be written
//     defensively to tolerate re-running).
//
// Each migration is `{ version, name, up(db) }`. `up` manages its
// own atomicity (some legacy steps recreate tables with their own transactions),
// and is only recorded if it completes without throwing.

import type Database from 'better-sqlite3';

type Db = Database.Database;

export interface Migration {
  version: number;
  name: string;
  up(db: Db): void;
}

export function runMigrations(
  db: Db,
  migrations: Migration[]
): { applied: number[]; backup: string | null } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare<[], { version: number }>('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version)
  );
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return { applied: [], backup: null };

  const backup = maybeBackup(db);

  const record = db.prepare<[number, string, string]>(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );
  const done: number[] = [];
  for (const m of pending) {
    m.up(db);
    record.run(m.version, m.name, new Date().toISOString());
    done.push(m.version);
  }
  return { applied: done, backup };
}

// Snapshot the DB to a timestamped file before mutating it — but only when it
// already contains data worth protecting (skip brand-new and in-memory DBs).
function maybeBackup(db: Db): string | null {
  const path = db.name;
  if (!path || path === ':memory:') return null;

  const userTables = db
    .prepare<[], { c: number }>(
      `
    SELECT count(*) AS c FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
  `
    )
    .get()?.c;
  if (!userTables) return null;

  const backupPath = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}
