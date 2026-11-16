import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Data locations, named to the shared container standard (~/projects/CLAUDE.md).
// DATA_DIR holds all state; the image sets it to /config. DB_PATH and UPLOADS_DIR
// default to photos.db and uploads/ inside it. Outside a container (no DATA_DIR)
// they default to server/photos.db and server/uploads, as before.
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : __dirname;

// Old setting names still in use, as [old, new] pairs; index.js logs a warning each.
export const deprecatedSettings = [];

function setting(name, legacyName) {
  if (process.env[name]) return process.env[name];
  if (legacyName && process.env[legacyName]) {
    deprecatedSettings.push([legacyName, name]);
    return process.env[legacyName];
  }
  return undefined;
}

const dbSetting = setting('DB_PATH', 'PHOTOS_DB_PATH');
export const dbPath = dbSetting ? resolve(dbSetting) : join(dataDir, 'photos.db');

// OPS-02: uploads location is overridable so a container can point it at a
// mounted data volume.
const uploadsSetting = setting('UPLOADS_DIR');
export const uploadsDir = uploadsSetting ? resolve(uploadsSetting) : join(dataDir, 'uploads');
export const distDir = join(__dirname, '..', 'dist');

mkdirSync(uploadsDir, { recursive: true });
