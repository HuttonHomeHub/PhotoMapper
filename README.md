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
- **Manual GPS placement** — position photos that have no EXIF GPS by clicking
  the map; hand-placed pins can be dragged to fine-tune or removed
- **Shareable read-only maps** — expose a single project via a public,
  revocable link (`/share/:token`); no login, no editing (see
  [Public share links](#public-share-links))
- **Reverse geocoding** of coordinates to place names (cached, rate-limited,
  off the upload request path)
- **Organisation** — clients → projects → survey dates; tags and field notes
- **Timeline playback**, elevation profile, photo comparison, full-screen
  lightbox, GeoJSON/KML export, PNG map export
- Keyboard shortcuts, dark theme, responsive/mobile layout

## Tech stack

- **Frontend:** React 18 + Vite 6, Leaflet (+ markercluster, heatmap)
- **Backend:** Express 5 on the shared `@hhh/server` kit (security headers and CSP,
  CSRF, rate limits, logging, settings), better-sqlite3 (SQLite), `sharp` (thumbnails),
  `exifr` (EXIF), `zod` (validation)
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

| Script                  | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | API + Vite dev server (concurrently)       |
| `npm run server`        | API only (`node server/index.ts`)          |
| `npm run build`         | Production build to `dist/`                |
| `npm start`             | Serve the built app + API from one process |
| `npm test`              | Run the Vitest suite once                  |
| `npm run test:watch`    | Vitest in watch mode                       |
| `npm run test:coverage` | Tests with coverage (enforces thresholds)  |
| `npm run lint`          | ESLint over `src` and `server`             |
| `npm run format`        | Prettier over `src` and `server`           |

## Configuration

All runtime config is validated on startup (`server/config.ts`). Copy
`.env.example` to `.env` for local overrides. Key variables:

Shared with every HuttonHomeHub app (same name and meaning everywhere):

| Var             | Default                                            | Purpose                                                                                                                                                                           |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUID` / `PGID` | `1000`                                             | User and group the app runs as in the image; data directories are chowned to them                                                                                                 |
| `TZ`            | UTC                                                | Time zone, e.g. `Europe/London`                                                                                                                                                   |
| `TRUST_PROXY`   | _(off)_                                            | Number of reverse-proxy hops in front whose `X-Forwarded-*` headers are trusted (`1` when nginx restores the real client IP). `true` means 1; anything but a number stops startup |
| `LOG_LEVEL`     | `info`                                             | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (`silent` under test; `warn` drops per-request logs)                                                                 |
| `DATA_DIR`      | `/config` in the image                             | Where all state lives; the next two default inside it                                                                                                                             |
| `DB_PATH`       | `$DATA_DIR/photos.db` (locally `server/photos.db`) | SQLite file. Replaces `PHOTOS_DB_PATH`, which still works and logs a deprecation warning                                                                                          |
| `UPLOADS_DIR`   | `$DATA_DIR/uploads` (locally `server/uploads`)     | Uploaded-image + thumbnail directory                                                                                                                                              |
| `APP_VERSION`   | `dev`                                              | Release version, set from the image tag at build time; reported at `/health` and `/version`                                                                                       |

PhotoMapper only:

| Var                      | Default                        | Purpose                                                                                                                                                        |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `3001`                         | API port inside the container (keep behind the reverse proxy in prod)                                                                                          |
| `ALLOWED_ORIGINS`        | _(empty)_                      | Comma-separated CORS allowlist; empty = same-origin                                                                                                            |
| `ALLOW_RESET`            | `false`                        | Enables the destructive `DELETE /api/reset`                                                                                                                    |
| `UPLOAD_MAX_BYTES`       | `62914560` (60 MB)             | Upload size cap                                                                                                                                                |
| `API_RATE`               | `1000 per 15 minutes`          | Per-IP rate limit over all of `/api`, e.g. `60 per minute`. Replaces `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`, which still work and log a deprecation warning |
| `BACKUP_DIR`             | `backups/` beside the database | Where backups are written                                                                                                                                      |
| `BACKUP_ENABLED`         | `1`                            | `0` turns off the schedule (backing up on demand still works)                                                                                                  |
| `BACKUP_INTERVAL_HOURS`  | `24`                           | Time between scheduled backups                                                                                                                                 |
| `BACKUP_KEEP`            | `7`                            | Backups kept of each kind (scheduled, prerestore)                                                                                                              |
| `BACKUP_INCLUDE_UPLOADS` | `1`                            | `0` for database-only backups, e.g. when uploads live on storage with its own snapshots                                                                        |
| `MAX_RESTORE_MB`         | `4096`                         | Largest backup (uncompressed) a restore accepts                                                                                                                |

A deployment in the standard layout is in [deploy/compose.example.yml](deploy/compose.example.yml).

## Architecture

```
server/
  index.ts         entry point: listens, backup schedule, graceful shutdown
  app.ts           createApp() on the @hhh/server kit: routers, static/SPA
  config.ts        every setting, read with the kit's loadSettings
  db.ts            SQLite open/close, frozen migrations 1-6, data access
  migrate.ts       the frozen runner for migrations 1-6
  migrations/      numbered SQL migrations from 007, run by the kit
  lock.ts          the write lock shared by uploads, deletes, reset and restore
  validation.ts    zod request-body schemas + validate() middleware
  logger.ts        the kit's pino logger
  paths.ts         data, uploads, backups, dist and migrations dirs
  routes/          photos, clients, projects, geocode, public, backups (Express routers)
  services/        hash, exif, geocode, geocodeQueue, thumbnail, exportPhotos, backups
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

SQLite via better-sqlite3, opened by the shared kit in WAL mode. Schema changes are
numbered SQL files in `server/migrations/`, starting at `007-…sql` and run by the kit,
which records each with its checksum in `schema_migrations` and copies a database that
holds data before migrating it. Never edit an applied migration. Versions 1–6 are
PhotoMapper's original JavaScript migrations in `server/db.ts`, frozen (see
[server/migrations/README.md](server/migrations/README.md)).

## Backups

A backup is one zip: a consistent snapshot of the database plus the `uploads/` folder.
PhotoMapper writes one every `BACKUP_INTERVAL_HOURS` (24) into `BACKUP_DIR` (default
`/config/backups`) and keeps the newest `BACKUP_KEEP` (7). `/api/backup` lists them,
makes one now, downloads one, or restores one (by name, or an uploaded zip). A restore
checks the archive thoroughly first and takes a `prerestore` backup, so it can be
undone. For copies that survive losing the host, mount `BACKUP_DIR` from another
disk or a NAS. Details in [docs/DEPLOYMENT-SECURITY.md](docs/DEPLOYMENT-SECURITY.md).

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

### Public share links

The 🔗 control on a project mints a public, read-only link
(`https://<host>/share/<token>`) that shows only that project's photos — no
login, no upload/edit/delete, no client data or other projects. It is opt-in per
project and revocable (**Stop sharing** invalidates the old link immediately).

This is the **one deliberately public surface** in the otherwise
proxy-authenticated app. For a client to open a link _without_ your proxy's
auth, allowlist the two public paths ahead of your catch-all `location /` — for
example, in Nginx (or an NPM host's _Advanced → Custom Nginx Configuration_):

```nginx
# Read-only share view + its data API — no auth. Everything else stays gated.
location /share/     { proxy_pass http://<upstream>; }
location /api/public/ { proxy_pass http://<upstream>; }
```

`<upstream>` is the same `scheme://host:port` your main host already forwards to.
Because these `location` blocks are more specific than `location /`, Nginx
matches them first and skips whatever auth (`auth_request`, an Access List,
Authelia, …) is attached to the rest of the host. Without this exemption the
links still work but prompt for your normal login, so they stay effectively
internal until allowlisted. Only enable sharing per project when you intend it —
anyone holding a live link can view that project's photos.

## Contributing

Setup, conventions, testing and workflow are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Project management

This repository is undergoing a tracked engineering-remediation programme.
Status, backlog, roadmap and architecture decisions live in
[`docs/project-management/`](docs/project-management/).
