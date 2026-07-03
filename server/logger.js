import pino from 'pino';
import { config } from './config.js';

// CQ-05/OPS-06: single structured logger. Level comes from config (silent under
// test). Request logging is wired via pino-http in app.js, which attaches
// `req.log` with a per-request id.
export const logger = pino({ level: config.logLevel });
