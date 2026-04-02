import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, 'photos.db'))

db.pragma('foreign_keys = ON')

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
`)

// Migrate existing DBs that predate the thumbnail_filename column
try {
  db.exec('ALTER TABLE photos ADD COLUMN thumbnail_filename TEXT')
} catch {
  // Column already exists — ignore
}

// Migrate: add file_hash column for duplicate detection
try {
  db.exec('ALTER TABLE photos ADD COLUMN file_hash TEXT')
} catch {
  // Column already exists — ignore
}

// Migrate: unique index on file_hash (SQLite UNIQUE indexes skip NULLs)
try {
  db.exec('CREATE UNIQUE INDEX idx_photos_file_hash ON photos (file_hash)')
} catch {
  // Index already exists — ignore
}

// Migrate: add location_name for reverse geocoding
try {
  db.exec('ALTER TABLE photos ADD COLUMN location_name TEXT')
} catch {
  // Column already exists — ignore
}

// Migrate: add description and tags for field notes
try {
  db.exec('ALTER TABLE photos ADD COLUMN description TEXT')
} catch {
  // Column already exists — ignore
}

try {
  db.exec('ALTER TABLE photos ADD COLUMN tags TEXT')
} catch {
  // Column already exists — ignore
}

// Migrate: add collections table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT DEFAULT '#e97b25',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
} catch {
  // Table already exists — ignore
}

// Migrate: add photo_collections join table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_collections (
      photo_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (photo_id, collection_id),
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
  `)
} catch {
  // Table already exists — ignore
}

// Migrate: index on photo_collections.collection_id
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_photo_collections_collection_id ON photo_collections(collection_id)')
} catch {
  // Index already exists — ignore
}

// Migrate: add projects table
try {
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
  `)
} catch {
  // Table already exists — ignore
}

// Migrate: add project_id FK to photos
try {
  db.exec('ALTER TABLE photos ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL')
} catch {
  // Column already exists — ignore
}

// Migrate: add clients table
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

// Migrate: add client_id FK to projects
try {
  db.exec('ALTER TABLE projects ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL')
} catch {
  // Column already exists — ignore
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)')
} catch {
  // Index already exists — ignore
}

// Migrate: add project_id FK to collections (requires table recreation to drop global UNIQUE on name)
{
  const collsCols = db.prepare('PRAGMA table_info(collections)').all()
  const hasProjectId = collsCols.some(c => c.name === 'project_id')
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
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_collections_project_id ON collections(project_id)')
  }
}

// Migrate: promote existing project.client TEXT values into the clients table
{
  const projCols = db.prepare('PRAGMA table_info(projects)').all()
  const hasClientCol = projCols.some(c => c.name === 'client')

  const unmigrated = hasClientCol
    ? db.prepare(`SELECT id, client FROM projects WHERE client IS NOT NULL AND client_id IS NULL`).all()
    : []

  if (unmigrated.length > 0) {
    const insertClientMigrate = db.prepare(
      `INSERT OR IGNORE INTO clients (id, name, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), @name, @now, @now)`
    )
    const setClientId = db.prepare(
      `UPDATE projects SET client_id = (SELECT id FROM clients WHERE name = @name) WHERE id = @projectId`
    )
    const migrate = db.transaction(() => {
      const now = new Date().toISOString()
      const seen = new Set()
      for (const row of unmigrated) {
        const name = row.client.trim()
        if (!seen.has(name)) {
          insertClientMigrate.run({ name, now })
          seen.add(name)
        }
        setClientId.run({ name, projectId: row.id })
      }
    })
    migrate()
  }
}

// Migrate: add focal_length_in_35mm for accurate FOV calculation
try {
  db.exec('ALTER TABLE photos ADD COLUMN focal_length_in_35mm REAL')
} catch {
  // Column already exists — ignore
}

// Migrate: add pano_hfov for panoramic photo FOV
try {
  db.exec('ALTER TABLE photos ADD COLUMN pano_hfov REAL')
} catch {
  // Column already exists — ignore
}

// Migrate: add survey_date (date part only, YYYY-MM-DD, derived from date_taken)
try {
  db.exec('ALTER TABLE photos ADD COLUMN survey_date TEXT')
} catch {
  // Column already exists — ignore
}
db.exec(`UPDATE photos SET survey_date = substr(date_taken, 1, 10) WHERE survey_date IS NULL AND date_taken IS NOT NULL`)

// Migrate: fix projects.name uniqueness from global to per-client
{
  const indexes = db.prepare('PRAGMA index_list(projects)').all()
  const hasGlobalUnique = indexes.some(i => i.name === 'sqlite_autoindex_projects_1')
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
    `)
  }
}

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
`)

const selectAllStmt = db.prepare(`
  SELECT p.*
  FROM photos p
  ORDER BY p.uploaded_at DESC
`)

const selectAllProjectsStmt = db.prepare(`
  SELECT pr.*, COUNT(p.id) as photo_count, cl.name as client_name
  FROM projects pr
  LEFT JOIN photos p ON p.project_id = pr.id
  LEFT JOIN clients cl ON cl.id = pr.client_id
  GROUP BY pr.id
  ORDER BY pr.created_at DESC
`)

const insertProjectStmt = db.prepare(`
  INSERT INTO projects (id, name, client_id, status, color, created_at, updated_at)
  VALUES (@id, @name, @clientId, @status, @color, @createdAt, @updatedAt)
`)

const updateProjectStmt = db.prepare(`
  UPDATE projects
  SET name       = COALESCE(@name, name),
      client_id  = COALESCE(@clientId, client_id),
      status     = COALESCE(@status, status),
      color      = COALESCE(@color, color),
      updated_at = @updatedAt
  WHERE id = @id
`)

const deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ?')

const assignPhotosToProjectStmt = db.prepare('UPDATE photos SET project_id = @projectId WHERE id = @id')
const selectByIdStmt = db.prepare('SELECT id, filename, thumbnail_filename FROM photos WHERE id = ?')
const selectByHashStmt = db.prepare('SELECT * FROM photos WHERE file_hash = ?')
const deleteStmt = db.prepare('DELETE FROM photos WHERE id = ?')
const updateStmt = db.prepare(`
  UPDATE photos
  SET description = COALESCE(@description, description),
      tags        = COALESCE(@tags, tags),
      location_name = COALESCE(@locationName, location_name)
  WHERE id = @id
`)

const updateSurveyDateStmt = db.prepare('UPDATE photos SET survey_date = @surveyDate WHERE id = @id')
const updatePhotoProjectStmt = db.prepare('UPDATE photos SET project_id = @projectId WHERE id = @id')


const insertClientStmt = db.prepare(`
  INSERT INTO clients (id, name, created_at, updated_at)
  VALUES (@id, @name, @createdAt, @updatedAt)
`)

const selectAllClientsStmt = db.prepare(`
  SELECT cl.*, COUNT(DISTINCT pr.id) as project_count
  FROM clients cl
  LEFT JOIN projects pr ON pr.client_id = cl.id
  GROUP BY cl.id
  ORDER BY cl.name ASC
`)

const updateClientStmt = db.prepare(`
  UPDATE clients SET name = @name, updated_at = @updatedAt WHERE id = @id
`)

const deleteClientStmt = db.prepare('DELETE FROM clients WHERE id = ?')

// ─── Exported functions ──────────────────────────────────────────────────────

export function insertPhoto(record) {
  insertStmt.run(record)
}

export function getPhotoByHash(hash) {
  const row = selectByHashStmt.get(hash)
  if (!row) return null
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
    tags: row.tags ? (() => { try { return JSON.parse(row.tags) } catch { return [] } })() : []
  }
}

export function updatePhoto(id, { description, tags, locationName } = {}) {
  updateStmt.run({
    id,
    description: description ?? null,
    tags: tags != null ? JSON.stringify(tags) : null,
    locationName: locationName ?? null
  })
}

export function getPhotoById(id) {
  const row = selectByIdStmt.get(id)
  if (!row) return null
  return {
    id: row.id,
    filename: row.filename,
    thumbnailFilename: row.thumbnail_filename,
  }
}

export function deletePhoto(id) {
  return deleteStmt.run(id).changes
}

export function batchUpdatePhotos(updates) {
  const run = db.transaction(() => {
    for (const u of updates) {
      updatePhoto(u.id, { description: u.description, tags: u.tags })
    }
  })
  run()
}

export function updatePhotoSurveyDate(id, surveyDate) {
  updateSurveyDateStmt.run({ id, surveyDate: surveyDate ?? null })
}

export function updatePhotoProject(id, projectId) {
  updatePhotoProjectStmt.run({ id, projectId: projectId ?? null })
}

export function getAllPhotos() {
  return selectAllStmt.all().map(row => ({
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
    tags: row.tags ? (() => { try { return JSON.parse(row.tags) } catch { return [] } })() : [],
    surveyDate: row.survey_date ?? null,
    projectId: row.project_id ?? null
  }))
}

export function getAllProjects() {
  return selectAllProjectsStmt.all().map(row => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    status: row.status,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: row.photo_count
  }))
}

export function createProject({ id, name, clientId, status, color, createdAt, updatedAt }) {
  insertProjectStmt.run({ id, name, clientId: clientId ?? null, status, color, createdAt, updatedAt })
}

export function updateProject(id, { name, clientId, status, color, updatedAt }) {
  updateProjectStmt.run({ id, name: name ?? null, clientId: clientId ?? null, status: status ?? null, color: color ?? null, updatedAt })
}

export function deleteProject(id) {
  return deleteProjectStmt.run(id).changes
}

export function assignPhotosToProject(projectId, photoIds) {
  const run = db.transaction(() => {
    for (const id of photoIds) {
      assignPhotosToProjectStmt.run({ projectId: projectId ?? null, id })
    }
  })
  run()
}

export function createClient({ id, name, createdAt, updatedAt }) {
  insertClientStmt.run({ id, name, createdAt, updatedAt })
}

export function getAllClients() {
  return selectAllClientsStmt.all().map(row => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectCount: row.project_count
  }))
}

export function updateClient(id, { name, updatedAt }) {
  updateClientStmt.run({ id, name, updatedAt })
}

export function deleteClient(id) {
  return deleteClientStmt.run(id).changes
}
