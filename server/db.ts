import type Database from 'better-sqlite3';
import type { Client, Photo, Project } from '../shared/api.ts';
import { openDatabase, runMigrations } from '@hhh/server';
import { logger } from './logger.ts';
import { runLegacyMigrations, type LegacyMigration } from './migrate.ts';
import { backupDir, dbPath, migrationsDir } from './paths.ts';

type Db = Database.Database;

// ─── Row and API shapes ──────────────────────────────────────────────────────
// The API's shapes live in shared/api.ts (the browser uses them too).
export type { Client, Photo, Project };

interface PhotoRow {
  id: string;
  filename: string;
  thumbnail_filename: string | null;
  original_name: string;
  uploaded_at: string;
  has_gps: number;
  manual_gps: number;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  img_direction: number | null;
  date_taken: string | null;
  survey_date: string | null;
  camera_make: string | null;
  camera_model: string | null;
  focal_length: number | null;
  focal_length_in_35mm: number | null;
  pano_hfov: number | null;
  f_number: number | null;
  iso: number | null;
  exposure_time: string | null;
  location_name: string | null;
  description: string | null;
  tags: string | null;
  project_id: string | null;
}

/** The fields written when a photo is uploaded. */
export interface NewPhoto {
  id: string;
  filename: string;
  thumbnailFilename: string | null;
  originalName: string;
  uploadedAt: string;
  hasGps: 0 | 1;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  imgDirection: number | null;
  dateTaken: string | null;
  surveyDate: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  focalLength: number | null;
  fNumber: number | null;
  iso: number | null;
  exposureTime: string | null;
  fileHash: string;
  locationName: string | null;
  projectId: string | null;
  focalLengthIn35mm: number | null;
  panoHFov: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  status: string;
  color: string;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  photo_count: number;
}

interface ClientRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  project_count: number;
}

/**
 * Filters for queryPhotos/countPhotos. A key that is present with `null` means
 * "unassigned"; an absent key means "any".
 */
export interface PhotoQuery {
  projectId?: string | null;
  clientId?: string | null;
  surveyDate?: string | null;
  hasGps?: boolean;
  tag?: string;
  search?: string;
  from?: string;
  to?: string;
  bbox?: { south: number; west: number; north: number; east: number };
  limit?: number;
  offset?: number;
}

// The live handle. It is replaced when a backup is restored (closeDb, then openDb).
let db: Db;

interface NameRow {
  name: string;
}

// ARCH-03: idempotent column-add that surfaces genuine errors instead of the
// previous blanket `try { ALTER } catch {}` (which hid every failure).
function addColumnIfMissing(db: Db, table: string, columnName: string, columnDef: string): void {
  const cols = db.prepare<[], NameRow>(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

// PhotoMapper's original migrations (1-6), frozen: they still build a new database and
// bring an old one up to date. Every schema change from now on is a numbered SQL file in
// server/migrations/ (from 007), run by the shared kit. Both record in schema_migrations.
//
// The historical schema evolution, preserved as a single recorded baseline
// migration (version 1). Every step is idempotent, so it is safe to run once
// against a legacy DB that predates the migration runner. New schema changes
// were added as further entries (version 2, 3, …) rather than edited in here.
const legacyMigrations: LegacyMigration[] = [
  {
    version: 1,
    name: 'baseline-schema',
    up(db: Db) {
      db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id                 TEXT PRIMARY KEY,
    filename           TEXT NOT NULL,
    thumbnail_filename TEXT,
    original_name      TEXT NOT NULL,
    uploaded_at        TEXT NOT NULL,
    has_gps            INTEGER NOT NULL DEFAULT 0,
    lat                REAL,
    lng                REAL,
    altitude           REAL,
    img_direction      REAL,
    date_taken         TEXT,
    camera_make        TEXT,
    camera_model       TEXT,
    focal_length       REAL,
    f_number           REAL,
    iso                INTEGER,
    exposure_time      TEXT,
    focal_length_in_35mm REAL,
    pano_hfov            REAL
  )
`);

      addColumnIfMissing(db, 'photos', 'thumbnail_filename', 'thumbnail_filename TEXT');
      addColumnIfMissing(db, 'photos', 'file_hash', 'file_hash TEXT');

      // Unique index on file_hash (SQLite UNIQUE indexes skip NULLs)
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_file_hash ON photos (file_hash)');

      addColumnIfMissing(db, 'photos', 'location_name', 'location_name TEXT');
      addColumnIfMissing(db, 'photos', 'description', 'description TEXT');
      addColumnIfMissing(db, 'photos', 'tags', 'tags TEXT');

      db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#e97b25',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

      db.exec(`
  CREATE TABLE IF NOT EXISTS photo_collections (
    photo_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (photo_id, collection_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
  )
`);

      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_photo_collections_collection_id ON photo_collections(collection_id)'
      );

      db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    client     TEXT,
    status     TEXT NOT NULL DEFAULT 'active',
    color      TEXT NOT NULL DEFAULT '#e97b25',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

      addColumnIfMissing(
        db,
        'photos',
        'project_id',
        'project_id TEXT REFERENCES projects(id) ON DELETE SET NULL'
      );

      db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

      addColumnIfMissing(
        db,
        'projects',
        'client_id',
        'client_id TEXT REFERENCES clients(id) ON DELETE SET NULL'
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)');

      // Migrate: add project_id FK to collections (requires table recreation to drop global UNIQUE on name)
      {
        const collsCols = db.prepare<[], NameRow>('PRAGMA table_info(collections)').all();
        const hasProjectId = collsCols.some((c) => c.name === 'project_id');
        if (!hasProjectId) {
          db.exec(`
      BEGIN;
      CREATE TABLE collections_new (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        color       TEXT DEFAULT '#e97b25',
        project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      INSERT INTO collections_new SELECT id, name, description, color, NULL, created_at, updated_at FROM collections;
      DROP TABLE collections;
      ALTER TABLE collections_new RENAME TO collections;
      COMMIT;
    `);
          db.exec(
            'CREATE INDEX IF NOT EXISTS idx_collections_project_id ON collections(project_id)'
          );
        }
      }

      // Migrate: promote existing project.client TEXT values into the clients table
      {
        const projCols = db.prepare<[], NameRow>('PRAGMA table_info(projects)').all();
        const hasClientCol = projCols.some((c) => c.name === 'client');

        const unmigrated = hasClientCol
          ? db
              .prepare<[], { id: string; client: string }>(
                `SELECT id, client FROM projects WHERE client IS NOT NULL AND client_id IS NULL`
              )
              .all()
          : [];

        if (unmigrated.length > 0) {
          const insertClientMigrate = db.prepare(
            `INSERT OR IGNORE INTO clients (id, name, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), @name, @now, @now)`
          );
          const setClientId = db.prepare(
            `UPDATE projects SET client_id = (SELECT id FROM clients WHERE name = @name) WHERE id = @projectId`
          );
          const migrate = db.transaction(() => {
            const now = new Date().toISOString();
            const seen = new Set<string>();
            for (const row of unmigrated) {
              const name = row.client.trim();
              if (!seen.has(name)) {
                insertClientMigrate.run({ name, now });
                seen.add(name);
              }
              setClientId.run({ name, projectId: row.id });
            }
          });
          migrate();
        }
      }

      addColumnIfMissing(db, 'photos', 'focal_length_in_35mm', 'focal_length_in_35mm REAL');
      addColumnIfMissing(db, 'photos', 'pano_hfov', 'pano_hfov REAL');
      addColumnIfMissing(db, 'photos', 'survey_date', 'survey_date TEXT');
      db.exec(
        `UPDATE photos SET survey_date = substr(date_taken, 1, 10) WHERE survey_date IS NULL AND date_taken IS NOT NULL`
      );

      // Migrate: fix projects.name uniqueness from global to per-client
      {
        const indexes = db.prepare<[], NameRow>('PRAGMA index_list(projects)').all();
        const hasGlobalUnique = indexes.some((i) => i.name === 'sqlite_autoindex_projects_1');
        if (hasGlobalUnique) {
          db.exec(`
      BEGIN;
      CREATE TABLE projects_new (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        client_id  TEXT REFERENCES clients(id) ON DELETE SET NULL,
        status     TEXT NOT NULL DEFAULT 'active',
        color      TEXT NOT NULL DEFAULT '#e97b25',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO projects_new SELECT id, name, client_id, status, color, created_at, updated_at FROM projects;
      DROP TABLE projects;
      ALTER TABLE projects_new RENAME TO projects;
      CREATE UNIQUE INDEX idx_projects_name_per_client ON projects(client_id, name);
      CREATE INDEX idx_projects_client_id2 ON projects(client_id);
      COMMIT;
    `);
        }
      }
    },
  },
  {
    // PERF-03: index the columns actually filtered/joined/ordered on. photos is
    // ordered by uploaded_at, grouped/joined by project_id, and filtered by
    // survey_date; without these SQLite full-scans photos on those queries.
    version: 2,
    name: 'performance-indexes',
    up(db: Db) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_photos_project_id ON photos(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_photos_uploaded_at ON photos(uploaded_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_photos_survey_date ON photos(survey_date)');
    },
  },
  {
    // BE-07/SEC-05: persistent reverse-geocode cache keyed by rounded lat/lng so
    // repeated/nearby coordinates don't re-hit Nominatim (survives restarts).
    version: 3,
    name: 'geocode-cache',
    up(db: Db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS geocode_cache (
          key           TEXT PRIMARY KEY,
          location_name TEXT,
          cached_at     TEXT NOT NULL
        )
      `);
    },
  },
  {
    // ARCH-04: drop the unused collections feature. The `collections` /
    // `photo_collections` tables were created by the baseline schema but no route,
    // query or UI ever read or wrote them (superseded by projects). Drop the child
    // table first so the FK reference is gone before its parent. Their indexes are
    // dropped automatically with the tables.
    version: 4,
    name: 'drop-unused-collections',
    up(db: Db) {
      db.exec('DROP TABLE IF EXISTS photo_collections');
      db.exec('DROP TABLE IF EXISTS collections');
    },
  },
  {
    // FEAT: manual GPS placement. Photos without EXIF GPS (has_gps = 0) can be
    // positioned by hand on the map. `manual_gps` flags those so the UI/export can
    // distinguish a hand-placed pin from a real EXIF fix, and so clearing a manual
    // pin never touches genuine EXIF coordinates.
    version: 5,
    name: 'photo-manual-gps',
    up(db: Db) {
      addColumnIfMissing(db, 'photos', 'manual_gps', 'manual_gps INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    // FEAT: per-project shareable read-only map. A project with a non-null
    // `share_token` is reachable via the public capability URL /share/:token. The
    // token is an unguessable secret; the UNIQUE index lets us look a project up by
    // it (SQLite UNIQUE indexes skip NULLs, so un-shared projects don't collide).
    version: 6,
    name: 'project-share-token',
    up(db: Db) {
      addColumnIfMissing(db, 'projects', 'share_token', 'share_token TEXT');
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_token ON projects(share_token)'
      );
    },
  },
];

// ─── Opening and closing ─────────────────────────────────────────────────────

// PhotoMapper's own runner records versions 1-6 in `schema_migrations` without a
// checksum; the kit's runner keeps the same table with a checksum per file. The column
// is added with the value 'legacy' for the six old rows. They stay where they were, so
// v1.2.0 still opens this database if it is ever rolled back to.
function handOverToKitMigrations(db: Db): void {
  const cols = db.prepare<[], NameRow>('PRAGMA table_info(schema_migrations)').all();
  if (!cols.some((c) => c.name === 'checksum')) {
    db.exec("ALTER TABLE schema_migrations ADD COLUMN checksum TEXT NOT NULL DEFAULT 'legacy'");
  }
}

function prepareStatements(db: Db) {
  const insertStmt = db.prepare<[NewPhoto]>(`
  INSERT INTO photos (
    id, filename, thumbnail_filename, original_name, uploaded_at, has_gps,
    lat, lng, altitude, img_direction,
    date_taken, survey_date, camera_make, camera_model,
    focal_length, f_number, iso, exposure_time, file_hash, location_name, project_id,
    focal_length_in_35mm, pano_hfov
  ) VALUES (
    @id, @filename, @thumbnailFilename, @originalName, @uploadedAt, @hasGps,
    @lat, @lng, @altitude, @imgDirection,
    @dateTaken, @surveyDate, @cameraMake, @cameraModel,
    @focalLength, @fNumber, @iso, @exposureTime, @fileHash, @locationName, @projectId,
    @focalLengthIn35mm, @panoHFov
  )
`);

  const selectAllStmt = db.prepare<[], PhotoRow>(`
  SELECT p.*
  FROM photos p
  ORDER BY p.uploaded_at DESC
`);

  const selectAllProjectsStmt = db.prepare<[], ProjectRow>(`
  SELECT pr.*, COUNT(p.id) as photo_count, cl.name as client_name
  FROM projects pr
  LEFT JOIN photos p ON p.project_id = pr.id
  LEFT JOIN clients cl ON cl.id = pr.client_id
  GROUP BY pr.id
  ORDER BY pr.created_at DESC
`);

  // PERF-02: single-project read-after-write, same aggregate shape as the list query.
  const selectProjectByIdStmt = db.prepare<[string], ProjectRow>(`
  SELECT pr.*, COUNT(p.id) as photo_count, cl.name as client_name
  FROM projects pr
  LEFT JOIN photos p ON p.project_id = pr.id
  LEFT JOIN clients cl ON cl.id = pr.client_id
  WHERE pr.id = ?
  GROUP BY pr.id
`);

  const insertProjectStmt = db.prepare(`
  INSERT INTO projects (id, name, client_id, status, color, created_at, updated_at)
  VALUES (@id, @name, @clientId, @status, @color, @createdAt, @updatedAt)
`);

  const deleteProjectStmt = db.prepare<[string]>('DELETE FROM projects WHERE id = ?');

  // Per-project share token (FEAT). A non-null token exposes the project via the
  // public /share/:token capability URL; clearing it revokes access immediately.
  const setShareTokenStmt = db.prepare(
    'UPDATE projects SET share_token = @token, updated_at = @updatedAt WHERE id = @id'
  );
  const clearShareTokenStmt = db.prepare(
    'UPDATE projects SET share_token = NULL, updated_at = @updatedAt WHERE id = @id'
  );
  const selectProjectByShareTokenStmt = db.prepare<[string], ProjectRow>(
    'SELECT * FROM projects WHERE share_token = ?'
  );

  const assignPhotosToProjectStmt = db.prepare(
    'UPDATE photos SET project_id = @projectId WHERE id = @id'
  );
  const selectByIdStmt = db.prepare<
    [string],
    Pick<PhotoRow, 'id' | 'filename' | 'thumbnail_filename'>
  >('SELECT id, filename, thumbnail_filename FROM photos WHERE id = ?');
  const selectByHashStmt = db.prepare<[string], PhotoRow>(
    'SELECT * FROM photos WHERE file_hash = ?'
  );
  // PERF-02: fetch a single fully-mapped photo by id (read-after-write) instead of
  // scanning every row with getAllPhotos().find().
  const selectPhotoByIdFullStmt = db.prepare<[string], PhotoRow>(
    'SELECT * FROM photos WHERE id = ?'
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM photos WHERE id = ?');
  const updateStmt = db.prepare(`
  UPDATE photos
  SET description = COALESCE(@description, description),
      tags        = COALESCE(@tags, tags),
      location_name = COALESCE(@locationName, location_name)
  WHERE id = @id
`);

  const updateSurveyDateStmt = db.prepare(
    'UPDATE photos SET survey_date = @surveyDate WHERE id = @id'
  );
  const updatePhotoProjectStmt = db.prepare(
    'UPDATE photos SET project_id = @projectId WHERE id = @id'
  );

  // Manual GPS placement (FEAT). Setting a location marks the pin as manually
  // placed; clearing only affects manual pins so real EXIF fixes are never wiped.
  const setPhotoLocationStmt = db.prepare(
    'UPDATE photos SET lat = @lat, lng = @lng, has_gps = 1, manual_gps = 1 WHERE id = @id'
  );
  const clearManualLocationStmt = db.prepare(
    'UPDATE photos SET lat = NULL, lng = NULL, has_gps = 0, manual_gps = 0 WHERE id = @id AND manual_gps = 1'
  );

  const selectGeocodeStmt = db.prepare<[string], { location_name: string | null }>(
    'SELECT location_name FROM geocode_cache WHERE key = ?'
  );
  const upsertGeocodeStmt = db.prepare(`
  INSERT INTO geocode_cache (key, location_name, cached_at)
  VALUES (@key, @locationName, @cachedAt)
  ON CONFLICT(key) DO UPDATE SET location_name = @locationName, cached_at = @cachedAt
`);

  const insertClientStmt = db.prepare(`
  INSERT INTO clients (id, name, created_at, updated_at)
  VALUES (@id, @name, @createdAt, @updatedAt)
`);

  const selectAllClientsStmt = db.prepare<[], ClientRow>(`
  SELECT cl.*, COUNT(DISTINCT pr.id) as project_count
  FROM clients cl
  LEFT JOIN projects pr ON pr.client_id = cl.id
  GROUP BY cl.id
  ORDER BY cl.name ASC
`);

  // PERF-02: single-client read-after-write, same aggregate shape as the list query.
  const selectClientByIdStmt = db.prepare<[string], ClientRow>(`
  SELECT cl.*, COUNT(DISTINCT pr.id) as project_count
  FROM clients cl
  LEFT JOIN projects pr ON pr.client_id = cl.id
  WHERE cl.id = ?
  GROUP BY cl.id
`);

  const updateClientStmt = db.prepare(`
  UPDATE clients SET name = @name, updated_at = @updatedAt WHERE id = @id
`);

  const deleteClientStmt = db.prepare<[string]>('DELETE FROM clients WHERE id = ?');

  return {
    insertStmt,
    selectAllStmt,
    selectAllProjectsStmt,
    selectProjectByIdStmt,
    insertProjectStmt,
    deleteProjectStmt,
    setShareTokenStmt,
    clearShareTokenStmt,
    selectProjectByShareTokenStmt,
    assignPhotosToProjectStmt,
    selectByIdStmt,
    selectByHashStmt,
    selectPhotoByIdFullStmt,
    deleteStmt,
    updateStmt,
    updateSurveyDateStmt,
    updatePhotoProjectStmt,
    setPhotoLocationStmt,
    clearManualLocationStmt,
    selectGeocodeStmt,
    upsertGeocodeStmt,
    insertClientStmt,
    selectAllClientsStmt,
    selectClientByIdStmt,
    updateClientStmt,
    deleteClientStmt,
  };
}

let s: ReturnType<typeof prepareStatements>;

/**
 * Opens the database (WAL, foreign keys, busy timeout), brings its schema up to date
 * and prepares every statement. Runs at startup and again after a restore.
 */
export function openDb(): void {
  db = openDatabase(dbPath);
  runLegacyMigrations(db, legacyMigrations);
  handOverToKitMigrations(db);
  runMigrations(db, { dir: migrationsDir, backupDir, logger });
  s = prepareStatements(db);
}

/** The live handle, for backups (it changes after a restore). */
export function getDb(): Db {
  return db;
}

openDb();

// ─── Exported functions ──────────────────────────────────────────────────────

export function insertPhoto(record: NewPhoto): void {
  s.insertStmt.run(record);
}

// Shared snake_case row → camelCase DTO mappers, so the list, by-hash and by-id
// queries can never drift out of sync (PERF-02 added the by-id readers).
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function mapPhotoRow(row: PhotoRow): Photo {
  return {
    id: row.id,
    filename: row.filename,
    thumbnailFilename: row.thumbnail_filename ?? null,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    hasGps: row.has_gps === 1,
    manualGps: row.manual_gps === 1,
    lat: row.lat,
    lng: row.lng,
    altitude: row.altitude,
    imgDirection: row.img_direction,
    dateTaken: row.date_taken,
    surveyDate: row.survey_date ?? null,
    cameraMake: row.camera_make,
    cameraModel: row.camera_model,
    focalLength: row.focal_length,
    focalLengthIn35mm: row.focal_length_in_35mm ?? null,
    panoHFov: row.pano_hfov ?? null,
    fNumber: row.f_number,
    iso: row.iso,
    exposureTime: row.exposure_time,
    locationName: row.location_name ?? null,
    description: row.description ?? null,
    tags: parseTags(row.tags),
    projectId: row.project_id ?? null,
  };
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    status: row.status,
    color: row.color,
    shareToken: row.share_token ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: row.photo_count,
  };
}

function mapClientRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectCount: row.project_count,
  };
}

export function getPhotoByHash(hash: string): Photo | null {
  const row = s.selectByHashStmt.get(hash);
  return row ? mapPhotoRow(row) : null;
}

// PERF-02: return only the affected photo after a write, instead of
// getAllPhotos().find() scanning the whole table.
export function getPhotoFullById(id: string): Photo | null {
  const row = s.selectPhotoByIdFullStmt.get(id);
  return row ? mapPhotoRow(row) : null;
}

export interface PhotoChanges {
  description?: string | null | undefined;
  tags?: string[] | null | undefined;
  locationName?: string | null | undefined;
}

export function updatePhoto(
  id: string,
  { description, tags, locationName }: PhotoChanges = {}
): void {
  s.updateStmt.run({
    id,
    description: description ?? null,
    tags: tags != null ? JSON.stringify(tags) : null,
    locationName: locationName ?? null,
  });
}

export function getPhotoById(
  id: string
): { id: string; filename: string; thumbnailFilename: string | null } | null {
  const row = s.selectByIdStmt.get(id);
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    thumbnailFilename: row.thumbnail_filename,
  };
}

export function deletePhoto(id: string): number {
  return s.deleteStmt.run(id).changes;
}

export function batchUpdatePhotos(updates: ({ id: string } & PhotoChanges)[]): void {
  const run = db.transaction(() => {
    for (const u of updates) {
      updatePhoto(u.id, { description: u.description, tags: u.tags });
    }
  });
  run();
}

export function updatePhotoSurveyDate(id: string, surveyDate: string | null | undefined): void {
  s.updateSurveyDateStmt.run({ id, surveyDate: surveyDate ?? null });
}

export function updatePhotoProject(id: string, projectId: string | null | undefined): void {
  s.updatePhotoProjectStmt.run({ id, projectId: projectId ?? null });
}

// FEAT: set a hand-placed location on a photo (marks it manual_gps = 1).
export function setPhotoLocation(id: string, lat: number, lng: number): void {
  s.setPhotoLocationStmt.run({ id, lat, lng });
}

// FEAT: remove a hand-placed location. Only affects manually-placed pins, so a
// real EXIF fix is never cleared. Returns the number of rows changed (0 = the
// photo had no manual location to clear).
export function clearManualLocation(id: string): number {
  return s.clearManualLocationStmt.run({ id }).changes;
}

// BE-07/SEC-05 reverse-geocode cache. Returns `undefined` on a cache miss and the
// stored value (a string or null) on a hit, so callers can tell "never looked up"
// from "looked up, no result".
export function getGeocodeCache(key: string): string | null | undefined {
  const row = s.selectGeocodeStmt.get(key);
  return row ? row.location_name : undefined;
}

export function setGeocodeCache(key: string, locationName: string | null | undefined): void {
  s.upsertGeocodeStmt.run({
    key,
    locationName: locationName ?? null,
    cachedAt: new Date().toISOString(),
  });
}

export function getAllPhotos(): Photo[] {
  return s.selectAllStmt.all().map(mapPhotoRow);
}

// PERF-01: shared WHERE builder for the filtered photo query/count. Only keys that
// are actually present in `opts` contribute a clause; `null` means "unassigned"
// (project/client/surveyDate). Returns whether a projects join is needed (client
// filter). Draw-region polygon filtering is not expressible here — callers apply
// it client-side over a bbox-loaded set.
function buildPhotoWhere(opts: PhotoQuery): {
  clause: string;
  join: string;
  params: Record<string, string | number | undefined>;
} {
  const where: string[] = [];
  const params: Record<string, string | number | undefined> = {};
  const needsProjectsJoin = 'clientId' in opts;

  if ('projectId' in opts) {
    if (opts.projectId === null) where.push('p.project_id IS NULL');
    else {
      where.push('p.project_id = @projectId');
      params.projectId = opts.projectId;
    }
  }
  if ('clientId' in opts) {
    if (opts.clientId === null) where.push('pr.client_id IS NULL');
    else {
      where.push('pr.client_id = @clientId');
      params.clientId = opts.clientId;
    }
  }
  if ('surveyDate' in opts) {
    if (opts.surveyDate === null) where.push('p.survey_date IS NULL');
    else {
      where.push('p.survey_date = @surveyDate');
      params.surveyDate = opts.surveyDate;
    }
  }
  if (opts.hasGps === true) where.push('p.has_gps = 1');
  if (opts.tag != null) {
    // json1 (bundled with better-sqlite3). Guard NULL tags so json_each doesn't error.
    where.push(
      'p.tags IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = @tag)'
    );
    params.tag = opts.tag;
  }
  if (opts.search) {
    // FEAT-02: full-text-ish search across name/location/description and tags
    // (tags are JSON TEXT, matched via json1 so the search covers them too).
    where.push(
      '(p.original_name LIKE @q OR p.location_name LIKE @q OR p.description LIKE @q' +
        ' OR (p.tags IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value LIKE @q)))'
    );
    params.q = `%${opts.search}%`;
  }
  if (opts.from) {
    where.push('substr(p.date_taken, 1, 10) >= @from');
    params.from = opts.from;
  }
  if (opts.to) {
    where.push('substr(p.date_taken, 1, 10) <= @to');
    params.to = opts.to;
  }
  if (opts.bbox) {
    where.push(
      'p.has_gps = 1 AND p.lat BETWEEN @south AND @north AND p.lng BETWEEN @west AND @east'
    );
    params.south = opts.bbox.south;
    params.north = opts.bbox.north;
    params.west = opts.bbox.west;
    params.east = opts.bbox.east;
  }

  return {
    clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    join: needsProjectsJoin ? 'LEFT JOIN projects pr ON pr.id = p.project_id' : '',
    params,
  };
}

// PERF-01: filtered + paginated photo query. With no `limit` it returns all
// matching rows (ordered newest-first), matching the legacy behaviour.
export function queryPhotos(opts: PhotoQuery = {}): Photo[] {
  const { clause, join, params } = buildPhotoWhere(opts);
  let sql = `SELECT p.* FROM photos p ${join} ${clause} ORDER BY p.uploaded_at DESC`;
  if (opts.limit != null) {
    sql += ' LIMIT @limit OFFSET @offset';
    params.limit = opts.limit;
    params.offset = opts.offset ?? 0;
  }
  return db.prepare<[typeof params], PhotoRow>(sql).all(params).map(mapPhotoRow);
}

// PERF-01: total number of rows matching the same filters (for pagination).
export function countPhotos(opts: PhotoQuery = {}): number {
  const { clause, join, params } = buildPhotoWhere(opts);
  const row = db
    .prepare<[typeof params], { n: number }>(`SELECT COUNT(*) AS n FROM photos p ${join} ${clause}`)
    .get(params);
  return row?.n ?? 0;
}

export function getAllProjects(): Project[] {
  return s.selectAllProjectsStmt.all().map(mapProjectRow);
}

// PERF-02: return only the affected project after a write.
export function getProjectById(id: string): Project | null {
  const row = s.selectProjectByIdStmt.get(id);
  return row ? mapProjectRow(row) : null;
}

export interface NewProject {
  id: string;
  name: string;
  clientId?: string | null | undefined;
  status: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export function createProject({
  id,
  name,
  clientId,
  status,
  color,
  createdAt,
  updatedAt,
}: NewProject): void {
  s.insertProjectStmt.run({
    id,
    name,
    clientId: clientId ?? null,
    status,
    color,
    createdAt,
    updatedAt,
  });
}

// BE-03: build the SET clause only from the keys actually provided, so an
// explicit `clientId: null` unassigns the client (was impossible under COALESCE,
// which could not tell "not provided" from "set to null").
export interface ProjectChanges {
  name?: string | undefined;
  clientId?: string | null | undefined;
  status?: string | undefined;
  color?: string | undefined;
  updatedAt?: string | undefined;
}

export function updateProject(id: string, changes: ProjectChanges = {}): number {
  const sets: string[] = [];
  const params: Record<string, string | null | undefined> = {
    id,
    updatedAt: changes.updatedAt ?? new Date().toISOString(),
  };
  if ('name' in changes) {
    sets.push('name = @name');
    params.name = changes.name;
  }
  if ('clientId' in changes) {
    sets.push('client_id = @clientId');
    params.clientId = changes.clientId ?? null;
  }
  if ('status' in changes) {
    sets.push('status = @status');
    params.status = changes.status;
  }
  if ('color' in changes) {
    sets.push('color = @color');
    params.color = changes.color;
  }
  if (sets.length === 0) return 0;
  sets.push('updated_at = @updatedAt');
  return db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = @id`).run(params).changes;
}

export function deleteProject(id: string): number {
  return s.deleteProjectStmt.run(id).changes;
}

// FEAT: set/replace a project's share token (enables the public share link).
export function setProjectShareToken(id: string, token: string): number {
  return s.setShareTokenStmt.run({ id, token, updatedAt: new Date().toISOString() }).changes;
}

// FEAT: revoke a project's share link.
export function clearProjectShareToken(id: string): number {
  return s.clearShareTokenStmt.run({ id, updatedAt: new Date().toISOString() }).changes;
}

// FEAT: resolve a share token to its project. Returns only the minimal fields the
// public share view needs — never client data or the token itself downstream.
export function getProjectByShareToken(
  token: string
): { id: string; name: string; color: string } | null {
  const row = s.selectProjectByShareTokenStmt.get(token);
  if (!row) return null;
  return { id: row.id, name: row.name, color: row.color };
}

export function assignPhotosToProject(projectId: string | null, photoIds: string[]): void {
  const run = db.transaction(() => {
    for (const id of photoIds) {
      s.assignPhotosToProjectStmt.run({ projectId: projectId ?? null, id });
    }
  });
  run();
}

export function createClient({
  id,
  name,
  createdAt,
  updatedAt,
}: {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}): void {
  s.insertClientStmt.run({ id, name, createdAt, updatedAt });
}

export function getAllClients(): Client[] {
  return s.selectAllClientsStmt.all().map(mapClientRow);
}

// PERF-02: return only the affected client after a write.
export function getClientById(id: string): Client | null {
  const row = s.selectClientByIdStmt.get(id);
  return row ? mapClientRow(row) : null;
}

export function updateClient(
  id: string,
  { name, updatedAt }: { name: string; updatedAt: string }
): number {
  return s.updateClientStmt.run({ id, name, updatedAt }).changes;
}

export function deleteClient(id: string): number {
  return s.deleteClientStmt.run(id).changes;
}

export function resetAll(): void {
  db.pragma('foreign_keys = OFF');
  db.exec(
    'DELETE FROM photos; DELETE FROM projects; DELETE FROM clients; DELETE FROM geocode_cache;'
  );
  db.pragma('foreign_keys = ON');
}

// OPS-04: cheap readiness probe — throws if the database is unreachable.
export function pingDb(): void {
  db.prepare('SELECT 1').get();
}

// OPS-05: flush and release the SQLite handle during graceful shutdown.
export function closeDb(): void {
  db.close();
}

/** Row counts for the Settings panel's instance information. */
export function countRows(): { photos: number; projects: number; clients: number } {
  const count = (table: string) =>
    db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
  return { photos: count('photos'), projects: count('projects'), clients: count('clients') };
}
