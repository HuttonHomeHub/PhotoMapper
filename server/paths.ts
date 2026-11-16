import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { resolveDataPaths } from '@hhh/server';
import { config } from './config.ts';

const serverDir = dirname(fileURLToPath(import.meta.url));

// Data locations, to the shared container standard. DATA_DIR holds all state; the image
// sets it to /config. DB_PATH and UPLOADS_DIR default to photos.db and uploads/ inside
// it. Outside a container (no DATA_DIR) they default to server/photos.db and
// server/uploads, as before.
const paths = resolveDataPaths(
  { DATA_DIR: config.dataDir, DB_PATH: config.dbPath, UPLOADS_DIR: config.uploadsDir },
  {
    dbFile: 'photos.db',
    fallbackDir: serverDir,
    join,
  }
);

export const dataDir = resolve(paths.dataDir);
export const dbPath = resolve(paths.dbPath);
export const uploadsDir = resolve(paths.uploadsDir);
export const distDir = join(serverDir, '..', 'dist');

// Kept here so the paths tests can check old names alongside the paths they set.
export { deprecatedSettings } from './config.ts';

mkdirSync(uploadsDir, { recursive: true });
