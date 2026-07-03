import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DB path is injectable so tests can run against a throwaway file (PHOTOS_DB_PATH).
const dbPath = process.env.PHOTOS_DB_PATH || join(__dirname, 'photos.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

// ARCH-03: idempotent column-add that surfaces genuine errors instead of the
// previous blanket `try { ALTER } catch {}` (which hid every failure).
function addColumnIfMissing(db, table, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

// The historical schema evolution, preserved as a single recorded baseline
// migration (version 1). Every step is idempotent, so it is safe to run once
// against a legacy DB that predates the migration runner. New schema changes
// should be added as further entries (version 2, 3, …) rather than edited in here.
const migrations = [
  {
    version: 1,
    name: 'baseline-schema',
    up(db) {
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
        const collsCols = db.prepare('PRAGMA table_info(collections)').all();
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
        const projCols = db.prepare('PRAGMA table_info(projects)').all();
        const hasClientCol = projCols.some((c) => c.name === 'client');

        const unmigrated = hasClientCol
          ? db
              .prepare(
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
            const seen = new Set();
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
        const indexes = db.prepare('PRAGMA index_list(projects)').all();
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
    up(db) {
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
    up(db) {
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
    up(db) {
      db.exec('DROP TABLE IF EXISTS photo_collections');
      db.exec('DROP TABLE IF EXISTS collections');
    },
  },
];

// Applies any pending migrations (records versions, backs up existing data first,
// fails loudly on error). See server/migrate.js.
runMigrations(db, migrations);

// ─── Prepared statements ────────────────────────────────────────────────────

const insertStmt = db.prepare(`
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

const selectAllStmt = db.prepare(`
  SELECT p.*
  FROM photos p
  ORDER BY p.uploaded_at DESC
`);

const selectAllProjectsStmt = db.prepare(`
  SELECT pr.*, COUNT(p.id) as photo_count, cl.name as client_name
  FROM projects pr
  LEFT JOIN photos p ON p.project_id = pr.id
  LEFT JOIN clients cl ON cl.id = pr.client_id
  GROUP BY pr.id
  ORDER BY pr.created_at DESC
`);

// PERF-02: single-project read-after-write, same aggregate shape as the list query.
const selectProjectByIdStmt = db.prepare(`
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

const deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ?');

const assignPhotosToProjectStmt = db.prepare(
  'UPDATE photos SET project_id = @projectId WHERE id = @id'
);
const selectByIdStmt = db.prepare(
  'SELECT id, filename, thumbnail_filename FROM photos WHERE id = ?'
);
const selectByHashStmt = db.prepare('SELECT * FROM photos WHERE file_hash = ?');
// PERF-02: fetch a single fully-mapped photo by id (read-after-write) instead of
// scanning every row with getAllPhotos().find().
const selectPhotoByIdFullStmt = db.prepare('SELECT * FROM photos WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM photos WHERE id = ?');
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

const selectGeocodeStmt = db.prepare('SELECT location_name FROM geocode_cache WHERE key = ?');
const upsertGeocodeStmt = db.prepare(`
  INSERT INTO geocode_cache (key, location_name, cached_at)
  VALUES (@key, @locationName, @cachedAt)
  ON CONFLICT(key) DO UPDATE SET location_name = @locationName, cached_at = @cachedAt
`);

const insertClientStmt = db.prepare(`
  INSERT INTO clients (id, name, created_at, updated_at)
  VALUES (@id, @name, @createdAt, @updatedAt)
`);

const selectAllClientsStmt = db.prepare(`
  SELECT cl.*, COUNT(DISTINCT pr.id) as project_count
  FROM clients cl
  LEFT JOIN projects pr ON pr.client_id = cl.id
  GROUP BY cl.id
  ORDER BY cl.name ASC
`);

// PERF-02: single-client read-after-write, same aggregate shape as the list query.
const selectClientByIdStmt = db.prepare(`
  SELECT cl.*, COUNT(DISTINCT pr.id) as project_count
  FROM clients cl
  LEFT JOIN projects pr ON pr.client_id = cl.id
  WHERE cl.id = ?
  GROUP BY cl.id
`);

const updateClientStmt = db.prepare(`
  UPDATE clients SET name = @name, updated_at = @updatedAt WHERE id = @id
`);

const deleteClientStmt = db.prepare('DELETE FROM clients WHERE id = ?');

// ─── Exported functions ──────────────────────────────────────────────────────

export function insertPhoto(record) {
  insertStmt.run(record);
}

// Shared snake_case row → camelCase DTO mappers, so the list, by-hash and by-id
// queries can never drift out of sync (PERF-02 added the by-id readers).
function parseTags(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function mapPhotoRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    thumbnailFilename: row.thumbnail_filename ?? null,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    hasGps: row.has_gps === 1,
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

function mapProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    status: row.status,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: row.photo_count,
  };
}

function mapClientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectCount: row.project_count,
  };
}

export function getPhotoByHash(hash) {
  return mapPhotoRow(selectByHashStmt.get(hash));
}

// PERF-02: return only the affected photo after a write, instead of
// getAllPhotos().find() scanning the whole table.
export function getPhotoFullById(id) {
  return mapPhotoRow(selectPhotoByIdFullStmt.get(id));
}

export function updatePhoto(id, { description, tags, locationName } = {}) {
  updateStmt.run({
    id,
    description: description ?? null,
    tags: tags != null ? JSON.stringify(tags) : null,
    locationName: locationName ?? null,
  });
}

export function getPhotoById(id) {
  const row = selectByIdStmt.get(id);
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    thumbnailFilename: row.thumbnail_filename,
  };
}

export function deletePhoto(id) {
  return deleteStmt.run(id).changes;
}

export function batchUpdatePhotos(updates) {
  const run = db.transaction(() => {
    for (const u of updates) {
      updatePhoto(u.id, { description: u.description, tags: u.tags });
    }
  });
  run();
}

export function updatePhotoSurveyDate(id, surveyDate) {
  updateSurveyDateStmt.run({ id, surveyDate: surveyDate ?? null });
}

export function updatePhotoProject(id, projectId) {
  updatePhotoProjectStmt.run({ id, projectId: projectId ?? null });
}

// BE-07/SEC-05 reverse-geocode cache. Returns `undefined` on a cache miss and the
// stored value (a string or null) on a hit, so callers can tell "never looked up"
// from "looked up, no result".
export function getGeocodeCache(key) {
  const row = selectGeocodeStmt.get(key);
  return row ? row.location_name : undefined;
}

export function setGeocodeCache(key, locationName) {
  upsertGeocodeStmt.run({
    key,
    locationName: locationName ?? null,
    cachedAt: new Date().toISOString(),
  });
}

export function getAllPhotos() {
  return selectAllStmt.all().map(mapPhotoRow);
}

// PERF-01: shared WHERE builder for the filtered photo query/count. Only keys that
// are actually present in `opts` contribute a clause; `null` means "unassigned"
// (project/client/surveyDate). Returns whether a projects join is needed (client
// filter). Draw-region polygon filtering is not expressible here — callers apply
// it client-side over a bbox-loaded set.
function buildPhotoWhere(opts) {
  const where = [];
  const params = {};
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
export function queryPhotos(opts = {}) {
  const { clause, join, params } = buildPhotoWhere(opts);
  let sql = `SELECT p.* FROM photos p ${join} ${clause} ORDER BY p.uploaded_at DESC`;
  if (opts.limit != null) {
    sql += ' LIMIT @limit OFFSET @offset';
    params.limit = opts.limit;
    params.offset = opts.offset ?? 0;
  }
  return db.prepare(sql).all(params).map(mapPhotoRow);
}

// PERF-01: total number of rows matching the same filters (for pagination).
export function countPhotos(opts = {}) {
  const { clause, join, params } = buildPhotoWhere(opts);
  return db.prepare(`SELECT COUNT(*) AS n FROM photos p ${join} ${clause}`).get(params).n;
}

export function getAllProjects() {
  return selectAllProjectsStmt.all().map(mapProjectRow);
}

// PERF-02: return only the affected project after a write.
export function getProjectById(id) {
  return mapProjectRow(selectProjectByIdStmt.get(id));
}

export function createProject({ id, name, clientId, status, color, createdAt, updatedAt }) {
  insertProjectStmt.run({
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
export function updateProject(id, changes = {}) {
  const sets = [];
  const params = { id, updatedAt: changes.updatedAt ?? new Date().toISOString() };
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

export function deleteProject(id) {
  return deleteProjectStmt.run(id).changes;
}

export function assignPhotosToProject(projectId, photoIds) {
  const run = db.transaction(() => {
    for (const id of photoIds) {
      assignPhotosToProjectStmt.run({ projectId: projectId ?? null, id });
    }
  });
  run();
}

export function createClient({ id, name, createdAt, updatedAt }) {
  insertClientStmt.run({ id, name, createdAt, updatedAt });
}

export function getAllClients() {
  return selectAllClientsStmt.all().map(mapClientRow);
}

// PERF-02: return only the affected client after a write.
export function getClientById(id) {
  return mapClientRow(selectClientByIdStmt.get(id));
}

export function updateClient(id, { name, updatedAt }) {
  return updateClientStmt.run({ id, name, updatedAt }).changes;
}

export function deleteClient(id) {
  return deleteClientStmt.run(id).changes;
}

export function resetAll() {
  db.pragma('foreign_keys = OFF');
  db.exec(
    'DELETE FROM photos; DELETE FROM projects; DELETE FROM clients; DELETE FROM geocode_cache;'
  );
  db.pragma('foreign_keys = ON');
}

// OPS-04: cheap readiness probe — throws if the database is unreachable.
export function pingDb() {
  db.prepare('SELECT 1').get();
}

// OPS-05: flush and release the SQLite handle during graceful shutdown.
export function closeDb() {
  db.close();
}
