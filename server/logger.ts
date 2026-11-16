import { createLogger } from '@hhh/server';
import { config } from './config.ts';

// CQ-05/OPS-06: the one structured logger, from the shared kit (silent under test).
// Request logs come from the kit's httpLogger in createBaseApp: one small line per
// request, with no headers or cookies.
export const logger = createLogger({ level: config.logLevel, name: 'photomapper' });
