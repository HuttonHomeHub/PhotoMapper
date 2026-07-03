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
});

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
};
