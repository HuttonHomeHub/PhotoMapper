import { createLock } from '@hhh/server';

// One lock around every write that touches files and the database together (an upload
// saves its file then inserts its row; a delete removes both; reset and restore replace
// everything), so a backup or restore never sees the two disagree.
export const withLock = createLock();
