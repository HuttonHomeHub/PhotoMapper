import { createReadStream } from 'fs';
import { createHash } from 'crypto';

// SHA-256 of a file's contents, used for upload de-duplication.
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}
