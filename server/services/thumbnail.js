import sharp from 'sharp';
import { join } from 'path';
import { uploadsDir } from '../paths.js';

// CQ-02: named thumbnail parameters.
const THUMB_SIZE_PX = 300;
const THUMB_JPEG_QUALITY = 80;

// Generates a square JPEG thumbnail next to the original. Non-fatal: returns
// null (and the photo still uploads) if generation fails.
export async function generateThumbnail(sourcePath, filename) {
  const thumbFilename = `thumb_${filename.replace(/\.[^.]+$/, '.jpg')}`;
  try {
    await sharp(sourcePath)
      .resize(THUMB_SIZE_PX, THUMB_SIZE_PX, { fit: 'cover' })
      .jpeg({ quality: THUMB_JPEG_QUALITY })
      .toFile(join(uploadsDir, thumbFilename));
    return thumbFilename;
  } catch {
    return null;
  }
}
