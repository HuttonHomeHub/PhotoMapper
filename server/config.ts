import { z } from 'zod';

// OPS-07: single, validated source of runtime configuration. Fail fast on bad
// input rather than discovering it at request time. See docs/DEPLOYMENT-SECURITY.md.

const schema = z.object({
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
  // Per-IP request budget for the rate limiter (SEC-07).
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  // Structured-log level (CQ-05/OPS-06). Forced to 'silent' under test.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Express `trust proxy` setting for deployments behind a reverse proxy, so
  // req.ip / rate-limiting / protocol reflect the real client (X-Forwarded-For)
  // instead of the proxy. Off by default. Accepts a hop count (e.g. "1" when nginx
  // restores the real client IP), "true"/"false", or a comma-separated IP/subnet list.
  TRUST_PROXY: z.string().default(''),
  // Release version, passed in by publish-image.yml as a build arg; 'dev' locally.
  APP_VERSION: z.string().default('dev'),
});

// Parse TRUST_PROXY into a value Express accepts: false (off), true, a hop count,
// or a raw string (comma-separated IPs/subnets or a preset like "loopback").
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const s = (value ?? '').trim();
  if (s === '' || s === 'false') return false;
  if (s === 'true') return true;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  allowReset: env.ALLOW_RESET === 'true',
  uploadMaxBytes: env.UPLOAD_MAX_BYTES,
  rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX },
  logLevel: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  appVersion: env.APP_VERSION,
};
