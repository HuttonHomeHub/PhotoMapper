// Every setting, read once at startup with the shared kit, to the container standard in
// ~/projects/CLAUDE.md: the shared names (LOG_LEVEL, TRUST_PROXY, DATA_DIR, DB_PATH,
// UPLOADS_DIR, APP_VERSION) plus PhotoMapper's own. A bad value stops startup listing
// every problem. Old names still work and are reported in `deprecatedSettings`.
import { loadSettings, parseRate, SettingsError, sharedSettings, type Rate } from '@hhh/server';
import { z } from 'zod';

const DEFAULT_API_RATE = '1000 per 15 minutes';

const shape = {
  ...sharedSettings,
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  // Comma-separated list of allowed CORS origins. Empty = same-origin only
  // (the default; the app serves its own frontend and sits behind a proxy).
  ALLOWED_ORIGINS: z.string().default(''),
  // Enables the destructive DELETE /api/reset endpoint (SEC-02). Off by default.
  ALLOW_RESET: z.enum(['true', 'false']).default('false'),
  // Upload size cap in bytes (SEC-07). Default 60 MB; keep in step with the
  // reverse proxy's client_max_body_size.
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1024 * 1024),
  // Per-IP request budget over all of /api (SEC-07), e.g. "1000 per 15 minutes".
  API_RATE: z.string().optional(),
  // The old form of API_RATE, as two numbers.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
};

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
  isTest: boolean;
  port: number;
  allowedOrigins: string[];
  allowReset: boolean;
  uploadMaxBytes: number;
  apiRate: Rate;
  logLevel: z.infer<typeof sharedSettings.LOG_LEVEL>;
  trustProxyHops: number;
  appVersion: string;
  dataDir: string | undefined;
  dbPath: string | undefined;
  uploadsDir: string | undefined;
}

/** Reads the settings from `env`; throws SettingsError listing every bad value. */
export function readConfig(env: Record<string, string | undefined>): {
  config: Config;
  deprecated: Array<[string, string]>;
} {
  const { settings: s, deprecated } = loadSettings(shape, {
    env,
    legacy: { DB_PATH: 'PHOTOS_DB_PATH' },
  });

  let apiRate: Rate;
  if (s.API_RATE !== undefined) {
    try {
      apiRate = parseRate(s.API_RATE);
    } catch (err) {
      throw new SettingsError([`API_RATE: ${(err as Error).message}`]);
    }
  } else if (s.RATE_LIMIT_WINDOW_MS !== undefined || s.RATE_LIMIT_MAX !== undefined) {
    const fallback = parseRate(DEFAULT_API_RATE);
    apiRate = {
      limit: s.RATE_LIMIT_MAX ?? fallback.limit,
      windowMs: s.RATE_LIMIT_WINDOW_MS ?? fallback.windowMs,
    };
    if (s.RATE_LIMIT_WINDOW_MS !== undefined) deprecated.push(['RATE_LIMIT_WINDOW_MS', 'API_RATE']);
    if (s.RATE_LIMIT_MAX !== undefined) deprecated.push(['RATE_LIMIT_MAX', 'API_RATE']);
  } else {
    apiRate = parseRate(DEFAULT_API_RATE);
  }

  return {
    config: {
      nodeEnv: s.NODE_ENV,
      isProd: s.NODE_ENV === 'production',
      isTest: s.NODE_ENV === 'test',
      port: s.PORT,
      allowedOrigins: s.ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      allowReset: s.ALLOW_RESET === 'true',
      uploadMaxBytes: s.UPLOAD_MAX_BYTES,
      apiRate,
      // Structured logs (CQ-05/OPS-06) are silenced under test.
      logLevel: s.NODE_ENV === 'test' ? 'silent' : s.LOG_LEVEL,
      trustProxyHops: s.TRUST_PROXY,
      appVersion: s.APP_VERSION,
      dataDir: s.DATA_DIR,
      dbPath: s.DB_PATH,
      uploadsDir: s.UPLOADS_DIR,
    },
    deprecated,
  };
}

const loaded = readConfig(process.env);

export const config = loaded.config;

/** Old setting names still in use, as [old, new] pairs; index.ts logs a warning for each. */
export const deprecatedSettings = loaded.deprecated;
