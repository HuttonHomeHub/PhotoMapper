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
// Each migration is `{ version:number, name:string, up(db) }`. `up` manages its
// own atomicity (some legacy steps recreate tables with their own transactions),
// and is only recorded if it completes without throwing.

export function runMigrations(db, migrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version)
  );
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return { applied: [], backup: null };

  const backup = maybeBackup(db);

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );
  const done = [];
  for (const m of pending) {
    m.up(db);
    record.run(m.version, m.name, new Date().toISOString());
    done.push(m.version);
  }
  return { applied: done, backup };
}

// Snapshot the DB to a timestamped file before mutating it — but only when it
// already contains data worth protecting (skip brand-new and in-memory DBs).
function maybeBackup(db) {
  const path = db.name;
  if (!path || path === ':memory:') return null;

  const userTables = db
    .prepare(
      `
    SELECT count(*) AS c FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
  `
    )
    .get().c;
  if (userTables === 0) return null;

  const backupPath = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}
