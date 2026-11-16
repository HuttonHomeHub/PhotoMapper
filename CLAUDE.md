# CLAUDE.md

Guidance for AI assistants working in this repository. The rules in `~/projects/CLAUDE.md` apply here too. If the two ever disagree, the stricter one wins.

## Project

**PhotoMapper** — full-stack web app for photo geolocation mapping. Users upload photos; the app extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map.

Stack and scripts are in `package.json`. Backend listens on port `3001` (override with `PORT` env var). No `.env` file required.

## CT 106 (dev box)

- **Checks:** `npm run check` runs every CI check: the vendored-platform check, typecheck, lint, Prettier, Vitest with coverage, build, `npm audit`. Node is not installed on CT 106, so run it in Docker from the repo root:
  `docker run --rm --user 1000:1000 -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v "$PWD":/app -w /app node:22-bookworm sh -c 'npm ci && npm run check'`
  It writes only the gitignored `node_modules/`, `dist/` and `coverage/`.
- **Dev server:** `npm run dev` (Vite plus the API on `:3001`), in the same Docker image.
- **Test stack:** `docker compose up -d --build`, test data only. The git-excluded `compose.override.yaml` publishes port 3001 on all interfaces (the tracked `docker-compose.yml` binds loopback only, for the live layout). code-server's `/proxy/3001/` does not work, because the app loads its files from root paths.
- `.devcontainer/` is a leftover from Codespaces and is not used on CT 106.

## Shared platform (phase 3 of the HuttonHomeHub App Standard)

- `vendor/hhh-platform/` is a vendored hhh-platform release (version in its `VERSION`). Never edit it: `npm run vendor:check` fails CI if it differs from the release. Upgrade with `node vendor/hhh-platform/scripts/vendor.ts X.Y.Z` in its own PR. The Dockerfile copies `vendor/` before `npm ci`, and into the runtime image (`@hhh/server` runs from it).
- TypeScript, ESLint, Prettier and Vitest come from `@hhh/config`. Two TypeScript projects: `tsconfig.json` (server, tests) and `tsconfig.app.json` (browser, JSX). The server is TypeScript, run by Node directly (imports name the `.ts` file). The front end and tests are still JavaScript, allowed but not type-checked until they're converted.
- Transition overrides live at the end of `eslint.config.js`, each with when to remove it.
- Coverage gate: `LINES_FLOOR` in `vitest.config.js` is the measured level and only goes up; every phase 3 PR raises it, ending at the standard's 80%.

## Settings

- Named to the shared container standard in `~/projects/CLAUDE.md` and read once in `server/config.ts` with the kit's `loadSettings` (shared settings plus PhotoMapper's own). Old names (`PHOTOS_DB_PATH`, `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`) still work and are collected in `deprecatedSettings`, which `server/index.ts` logs at startup. `server/paths.ts` resolves `DATA_DIR`, `DB_PATH` and `UPLOADS_DIR`.
- The Express app is built on `@hhh/server` (`createBaseApp` … `finishApp` in `server/app.ts`): every write needs the CSRF header, so browser code calls the API with `apiFetch` from `@hhh/ui`, never bare `fetch`, and API tests send writes through their `write()` helper.
- Backups use Crane Charts' setting names (`BACKUP_DIR`, `BACKUP_ENABLED`, `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`, `BACKUP_INCLUDE_UPLOADS`, `MAX_RESTORE_MB`) and routes (`/api/backup…`, `/api/info`).
- `deploy/compose.example.yml` is the live layout; the root `docker-compose.yml` builds from source for local use.

## Release

- Version: `version` in `package.json` (and `package-lock.json`). `CHANGELOG.md` has an `## Unreleased` section with `### Added` / `### Changed` / `### Fixed`; every PR into `dev` adds its line there.
- A release is merging `dev` into `main`. `.github/workflows/publish-image.yml` then runs CI (`ci.yml`), fails if `vX.Y.Z` already exists, publishes `ghcr.io/huttonhomehub/photomapper` as `X.Y.Z`, `X.Y`, `latest` and `sha-<short>`, and creates the `vX.Y.Z` tag and GitHub Release from that CHANGELOG section. Pushing a tag or running the workflow by hand publishes nothing.
- "Ship It" follows `.claude/skills/ship-it/SKILL.md`, which sets the version and CHANGELOG on `dev` before merging the release PR.
- `ci.yml` runs on pushes to `dev` and `claude/**` and PRs into `dev` and `main`. Its one job, `build`, is the required check.
- Dependabot (`.github/dependabot.yml`) opens weekly PRs into `dev` for npm, GitHub Actions and the Node base image. New Node major versions aren't proposed: changing Node also means changing `ci.yml` and the Dockerfile.

## File Map

```
src/
  main.jsx              App entry point
  App.jsx               Root layout: sidebar + map
  hooks/use*.js         Photo, project and client API calls (via apiFetch)
  components/
    DropZone.jsx        Drag-and-drop upload with per-file status + client-side duplicate detection
    PhotoList.jsx       Sidebar list with thumbnails + delete
    PhotoMap.jsx        Leaflet map — all refs and effects stay in this file; forwardRef exposes flyTo/getBounds to App.jsx
    UploadDrawer.jsx    Slide-in drawer showing per-file upload results
    PhotoLightbox.jsx   Full-screen image viewer with EXIF panel and keyboard nav
  styles/index.css      Global styles (dark theme)
server/
  index.ts              Entry point: listens, graceful shutdown
  app.ts                Express app: middleware, probes, routers, error handler
  routes/*.ts           API routers (named exports)
  db.ts                 openDb/closeDb, frozen migrations 1-6, every query; API row types
  migrations/           numbered SQL migrations from 007 (README there); never edit an applied one
  lock.ts               write lock: uploads, deletes, reset and restore take it
  validation.ts         zod request-body schemas
  services/*.ts         EXIF, thumbnails, hashing, geocoding, export, backups
  uploads/              Runtime only — gitignored
  photos.db             Runtime only — gitignored
```

## Non-obvious Conventions

- **ES modules only** — `"type": "module"` in package.json; never use `require()`
- **camelCase ↔ snake_case** — DB columns are `snake_case`; `db.js:getAllPhotos` maps them to `camelCase` for the API
- **UUID filenames** — uploaded files get UUID names on disk; original name stored in `original_name` DB column
- **Non-fatal EXIF** — photos without GPS still upload successfully; `has_gps = 0`
- **Dark theme palette** — `#1a1a2e` bg, `#16213e` sidebar, `#e97b25` accent — match this in new UI
- Vite dev server proxies `/api` and `/uploads` to `:3001`
- Tests live under `tests/` (Vitest). Run `npm run lint`, `npm run format:check` and `npm run test:coverage` before handing work back, because CI enforces them.

## Subagents

Use these for focused work to avoid loading irrelevant context:

- **frontend** — React components, hooks, styles, Leaflet map (`src/`)
- **backend** — Express routes, DB operations, EXIF parsing (`server/`)

## Development Workflow

- Commits: imperative, focused — `add deletion endpoint`, `fix map clustering on zoom`

## AI Assistant Rules

**Do:**

- Read relevant files before making changes
- Extend `usePhotos.js` for new API interactions; keep Leaflet logic inside `PhotoMap.jsx`
- New routes → `server/routes/`; new DB ops → `server/db.ts`

**Don't:**

- Add error handling, comments, or refactors beyond what was asked
- Introduce new dependencies without discussing first (Dependabot bumps of existing ones are fine)
- Create backup files, scratch files, or temporary docs

## Updating This File

Keep only what Claude cannot infer from source files. If it's already in `package.json`, `server/app.ts`, or `server/db.ts` — don't repeat it here. Keep it consistent with `~/projects/CLAUDE.md`.
