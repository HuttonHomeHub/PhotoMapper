import sharp from 'sharp';
import { join } from 'path';
import { uploadsDir } from '../paths.js';

// Generates a 300x300 JPEG thumbnail next to the original. Non-fatal: returns
// null (and the photo still uploads) if generation fails.
export async function generateThumbnail(sourcePath, filename) {
  const thumbFilename = `thumb_${filename.replace(/\.[^.]+$/, '.jpg')}`;
  try {
    await sharp(sourcePath)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(join(uploadsDir, thumbFilename));
    return thumbFilename;
  } catch {
    return null;
  }
}
