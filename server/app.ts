import express, { type Express } from 'express';
import cors from 'cors';
import { join } from 'path';
import { readdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { createBaseApp, finishApp, notFound, rateLimiter } from '@hhh/server';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { uploadsDir, distDir } from './paths.ts';
import { resetAll, pingDb } from './db.ts';
import { photosRouter } from './routes/photos.ts';
import { clientsRouter } from './routes/clients.ts';
import { projectsRouter } from './routes/projects.ts';
import { geocodeRouter } from './routes/geocode.ts';
import { publicRouter } from './routes/public.ts';

export function createApp(): Express {
  // The shared kit's front half, the same in every app: proxy trust (TRUST_PROXY hops),
  // security headers with a strict CSP, compression, header-free request logs,
  // /health, /version and /ready (which pings the database), JSON bodies, and CSRF
  // protection on every write (the browser sends the token via apiFetch).
  const app = createBaseApp({
    logger,
    version: config.appVersion,
    trustProxyHops: config.trustProxyHops,
    ready: pingDb,
    // Map tiles. Location search goes through /api/geocode (FE-05), so connect-src
    // stays 'self'.
    csp: {
      imgSrc: [
        'https://server.arcgisonline.com',
        'https://*.tile.openstreetmap.org',
        'https://*.basemaps.cartocdn.com',
        'https://*.tile.opentopomap.org',
      ],
    },
  });

  // SEC-04: no cross-origin access by default (app is same-origin behind the
  // proxy). Enable only for explicitly configured origins.
  if (config.allowedOrigins.length > 0) {
    app.use(cors({ origin: config.allowedOrigins }));
  }

  // SEC-07: per-IP rate limit on the API surface (API_RATE).
  app.use('/api', rateLimiter(config.apiRate));

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
      res.status(403).json({ error: 'Reset is disabled. Set ALLOW_RESET=true to enable it.' });
      return;
    }
    resetAll();
    const files = readdirSync(uploadsDir);
    await Promise.all(files.map((f) => unlink(join(uploadsDir, f)).catch(() => {})));
    res.json({ ok: true });
  });

  // BE-01 regression hook: an async route that rejects, used only by the test
  // suite to assert async errors reach the error handler (500, not a hang).
  if (config.isTest) {
    app.get('/__test/async-error', async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });
  }

  // An unknown /api path is a JSON 404, not the SPA page below.
  app.use('/api', notFound);

  app.use('/uploads', express.static(uploadsDir));

  // Serve the built frontend and fall back to the SPA entry point.
  app.use(express.static(distDir));
  app.get('/{*path}', (_req, res) => res.sendFile(join(distDir, 'index.html')));

  // The kit's error handler, last: every error leaves as JSON {"error": ...}; 5xx
  // details are logged, never sent (SEC-08).
  finishApp(app, logger);
  return app;
}

export const app = createApp();
