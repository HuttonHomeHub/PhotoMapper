import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, 'photos.db'))

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
    exposure_time      TEXT
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

const insertStmt = db.prepare(`
  INSERT INTO photos (
    id, filename, thumbnail_filename, original_name, uploaded_at, has_gps,
    lat, lng, altitude, img_direction,
    date_taken, camera_make, camera_model,
    focal_length, f_number, iso, exposure_time, file_hash, location_name
  ) VALUES (
    @id, @filename, @thumbnailFilename, @originalName, @uploadedAt, @hasGps,
    @lat, @lng, @altitude, @imgDirection,
    @dateTaken, @cameraMake, @cameraModel,
    @focalLength, @fNumber, @iso, @exposureTime, @fileHash, @locationName
  )
`)

const selectAllStmt = db.prepare('SELECT * FROM photos ORDER BY uploaded_at DESC')
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
    cameraMake: row.camera_make,
    cameraModel: row.camera_model,
    focalLength: row.focal_length,
    fNumber: row.f_number,
    iso: row.iso,
    exposureTime: row.exposure_time,
    locationName: row.location_name ?? null,
    description: row.description ?? null,
    tags: row.tags ? JSON.parse(row.tags) : []
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
    fNumber: row.f_number,
    iso: row.iso,
    exposureTime: row.exposure_time,
    locationName: row.location_name ?? null,
    description: row.description ?? null,
    tags: row.tags ? JSON.parse(row.tags) : []
  }))
}
