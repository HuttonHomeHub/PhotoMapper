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

const insertStmt = db.prepare(`
  INSERT INTO photos (
    id, filename, thumbnail_filename, original_name, uploaded_at, has_gps,
    lat, lng, altitude, img_direction,
    date_taken, camera_make, camera_model,
    focal_length, f_number, iso, exposure_time
  ) VALUES (
    @id, @filename, @thumbnailFilename, @originalName, @uploadedAt, @hasGps,
    @lat, @lng, @altitude, @imgDirection,
    @dateTaken, @cameraMake, @cameraModel,
    @focalLength, @fNumber, @iso, @exposureTime
  )
`)

const selectAllStmt = db.prepare('SELECT * FROM photos ORDER BY uploaded_at DESC')
const selectByIdStmt = db.prepare('SELECT id, filename, thumbnail_filename FROM photos WHERE id = ?')
const deleteStmt = db.prepare('DELETE FROM photos WHERE id = ?')

export function insertPhoto(record) {
  insertStmt.run(record)
}

export function getPhotoById(id) {
  return selectByIdStmt.get(id) ?? null
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
    exposureTime: row.exposure_time
  }))
}
