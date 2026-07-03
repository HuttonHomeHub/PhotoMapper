import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// OPS-02: uploads location is overridable so a container can point it at a
// mounted data volume (alongside PHOTOS_DB_PATH). Defaults to server/uploads.
export const uploadsDir = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : join(__dirname, 'uploads');
export const distDir = join(__dirname, '..', 'dist');

mkdirSync(uploadsDir, { recursive: true });
