# PhotoMapper

A full-stack web app for **photo geolocation mapping**. Upload photos; the app
extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map, with
tools for organising them into clients, projects and survey dates.

## Features

- **Drag-and-drop upload** with per-file status and server-side de-duplication
- **EXIF/GPS extraction** — date taken, camera, focal length, aperture, ISO,
  altitude, image direction, panorama FOV. Photos without GPS still upload.
- **Interactive map** (Leaflet) — clustered pins, photo thumbnails, FOV cones,
  heatmap, trip route, draw-a-region filter, multiple base layers
- **Reverse geocoding** of coordinates to place names (cached, rate-limited,
  off the upload request path)
- **Organisation** — clients → projects → survey dates; tags and field notes
- **Timeline playback**, elevation profile, photo comparison, full-screen
  lightbox, GeoJSON/KML export, PNG map export
- Keyboard shortcuts, dark theme, responsive/mobile layout

## Tech stack

- **Frontend:** React 18 + Vite 6, Leaflet (+ markercluster, heatmap)
- **Backend:** Express 4, better-sqlite3 (SQLite), `sharp` (thumbnails),
  `exifr` (EXIF), `zod` (validation), `helmet`/`compression`/`express-rate-limit`,
  `pino` (structured logging)
- **Tests:** Vitest (Node + jsdom), Testing Library, supertest

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev      # starts the API (:3001) and Vite dev server together
```

Vite proxies `/api` and `/uploads` to the backend on port 3001. Open the Vite
URL it prints (or the Codespaces forwarded port).

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API + Vite dev server (concurrently) |
| `npm run server` | API only (`node server/index.js`) |
| `npm run build` | Production build to `dist/` |
| `npm start` | Serve the built app + API from one process |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Tests with coverage (enforces thresholds) |
| `npm run lint` | ESLint over `src` and `server` |
| `npm run format` | Prettier over `src` and `server` |

## Configuration

All runtime config is validated on startup (`server/config.js`). Copy
`.env.example` to `.env` for local overrides. Key variables:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | API port (keep behind the reverse proxy in prod) |
| `PHOTOS_DB_PATH` | `server/photos.db` | SQLite file (point at a persistent volume) |
| `ALLOWED_ORIGINS` | _(empty)_ | Comma-separated CORS allowlist; empty = same-origin |
| `ALLOW_RESET` | `false` | Enables the destructive `DELETE /api/reset` |
| `UPLOAD_MAX_BYTES` | `62914560` (60 MB) | Upload size cap |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `900000` / `1000` | Per-IP API rate limit |
| `LOG_LEVEL` | `info` | pino level (`silent` under test) |

## Architecture

```
server/
  index.js         entry point (imports app, listens)
  app.js           createApp(): middleware, routers, static/SPA, error handler
  config.js        zod-validated runtime configuration
  db.js            SQLite schema + data access (repository layer)
  migrate.js       versioned migration runner (records versions, backs up, fails loudly)
  validation.js    zod request-body schemas + validate() middleware
  logger.js        pino structured logger
  paths.js         shared uploads/dist dirs
  routes/          photos.js, clients.js, projects.js (Express routers)
  services/        hash, exif, geocode, geocodeQueue, thumbnail, exportPhotos
src/
  main.jsx         entry (ErrorBoundary + ToastProvider + App)
  App.jsx          root layout: sidebar + map
  components/      PhotoMap, PhotoList, PhotoLightbox, DropZone, FilterChips,
                   TimelinePanel, LocationSearch, PhotoPopup, Toast, …
  hooks/           usePhotos, useClients, useProjects, useTimeline, useFocusTrap
  lib/             filterPhotos, geo, format, heatmap-patched
```

Conventions: ES modules only; DB columns are `snake_case` and mapped to
`camelCase` in `db.js`; uploaded files get UUID names on disk (original name
stored in the DB).

## Database & migrations

SQLite via better-sqlite3. Schema changes are versioned migrations in
`server/db.js`, applied by `server/migrate.js`, which records applied versions in
a `schema_migrations` table, takes a `VACUUM INTO` backup before mutating an
existing database, and fails loudly on error. Add a new schema change as the next
`{ version, name, up(db) }` entry — never edit an applied migration.

## API

All endpoints live under `/api` (plus `/health` and `/ready`). See the full
reference — routes, request/response shapes, status codes and errors — in
[`docs/API.md`](docs/API.md).

The non-obvious FOV-cone / focal-length / distance math is documented in
[`docs/geo-math.md`](docs/geo-math.md).

## Testing

```bash
npm test
```

Vitest runs Node tests (data layer, API via supertest, pure libs) and jsdom
component/hook tests (Testing Library). Component test files opt into jsdom with
a `// @vitest-environment jsdom` docblock. Coverage thresholds are enforced in
CI.

## Production deployment

**Authentication is enforced at a reverse proxy, not in the app** — see
[`docs/DEPLOYMENT-SECURITY.md`](docs/DEPLOYMENT-SECURITY.md) for the required
setup (TLS, HTTP auth, keeping the Node port private, backups). Do not expose the
Node port directly to the internet.

## Project management

This repository is undergoing a tracked engineering-remediation programme.
Status, backlog, roadmap and architecture decisions live in
[`docs/project-management/`](docs/project-management/).
