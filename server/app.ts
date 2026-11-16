import express, { type ErrorRequestHandler, type Express } from 'express';
// BE-01: patches Express 4 so errors thrown/rejected in async route handlers are
// forwarded to the error middleware instead of hanging the request.
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { join } from 'path';
import { readdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { uploadsDir, distDir } from './paths.ts';
import { resetAll, pingDb } from './db.ts';
import { photosRouter } from './routes/photos.ts';
import { clientsRouter } from './routes/clients.ts';
import { projectsRouter } from './routes/projects.ts';
import { geocodeRouter } from './routes/geocode.ts';
import { publicRouter } from './routes/public.ts';

/** An error a route throws; `status`/`statusCode` < 500 are shown to the client. */
interface RouteError extends Error {
  status?: number;
  statusCode?: number;
}

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy, trust it so req.ip, the rate limiter, and protocol
  // detection use the real client from X-Forwarded-For instead of the proxy IP.
  // Off by default; set TRUST_PROXY (e.g. "1" when nginx restores the real client IP).
  app.set('trust proxy', config.trustProxy);

  // SEC-09: security headers + CSP. The CSP allowlists the map tile hosts and the
  // client-side Nominatim search; 'unsafe-inline' styles are permitted because
  // Leaflet/markercluster inject inline styles (script stays 'self' only).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://server.arcgisonline.com',
            'https://*.tile.openstreetmap.org',
            'https://*.basemaps.cartocdn.com',
            'https://*.tile.opentopomap.org',
          ],
          // FE-05: the browser no longer calls Nominatim directly (forward search
          // is proxied via /api/geocode/search), so connect-src stays 'self' only.
          connectSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          // Leave to HSTS + the proxy's HTTP->HTTPS redirect (ADR-0007). Setting it
          // here would break direct HTTP access (health checks, local runs).
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // PERF-08: gzip/brotli responses.
  app.use(compression());

  // CQ-05/OPS-06: structured request logging with a per-request id (req.log).
  app.use(pinoHttp({ logger }));

  // SEC-04: no cross-origin access by default (app is same-origin behind the
  // proxy). Enable only for explicitly configured origins.
  if (config.allowedOrigins.length > 0) {
    app.use(cors({ origin: config.allowedOrigins }));
  }

  app.use(express.json());

  // OPS-04: liveness/readiness probes for the reverse proxy and container
  // orchestrator. Deliberately outside /api so they skip the rate limiter, and
  // registered before the routers so a probe never touches application state.
  // /health is a pure liveness check (process is up); /ready also confirms the
  // database is reachable and returns 503 if it is not.
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: config.appVersion }));
  app.get('/version', (_req, res) => res.json({ version: config.appVersion }));
  app.get('/ready', (_req, res) => {
    try {
      pingDb();
      res.json({ status: 'ready' });
    } catch (err) {
      (res.req.log ?? logger).error({ err }, 'Readiness check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // SEC-07: per-IP rate limit on the API surface.
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use('/api/photos', photosRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/geocode', geocodeRouter);
  // FEAT: the single public, unauthenticated surface — read-only project shares
  // via capability token. Still rate-limited (mounted under /api). See routes/public.ts.
  app.use('/api/public', publicRouter);

  // SEC-02: destructive full wipe. Disabled unless explicitly enabled via env, as
  // defense-in-depth behind the reverse-proxy auth (ADR-0007).
  app.delete('/api/reset', async (_req, res) => {
    if (!config.allowReset) {
      return res
        .status(403)
        .json({ error: 'Reset is disabled. Set ALLOW_RESET=true to enable it.' });
    }
    resetAll();
    const files = readdirSync(uploadsDir);
    await Promise.all(files.map((f) => unlink(join(uploadsDir, f)).catch(() => {})));
    res.json({ ok: true });
  });

  app.use('/uploads', express.static(uploadsDir));

  // BE-01 regression hook: an async route that rejects, used only by the test
  // suite to assert async errors reach the error handler (500, not a hang).
  if (config.isTest) {
    app.get('/__test/async-error', async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });
  }

  // Serve the built frontend and fall back to the SPA entry point.
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')));

  // BE-06: error-handling middleware is registered LAST so it catches errors from
  // every route above it (previously it sat before the reset/SPA routes).
  const errorHandler: ErrorRequestHandler = (err: RouteError, req, res, _next) => {
    (req.log ?? logger).error({ err }, 'Unhandled request error');
    const status = err.status || err.statusCode || 500;
    // SEC-08: don't leak internal error detail to clients in production. Client
    // (4xx) errors keep their message; server (5xx) errors are masked in prod.
    const message =
      status < 500 || !config.isProd
        ? err.message || 'Internal server error'
        : 'Internal server error';
    res.status(status).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}

export const app = createApp();
