import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const uploadsDir = join(__dirname, 'uploads');
export const distDir = join(__dirname, '..', 'dist');

mkdirSync(uploadsDir, { recursive: true });
