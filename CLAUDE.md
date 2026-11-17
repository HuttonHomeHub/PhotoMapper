# CLAUDE.md

Guidance for AI assistants working in this repository. The rules in `~/projects/CLAUDE.md` apply here too. If the two ever disagree, the stricter one wins.

## Project

**PhotoMapper** — full-stack web app for photo geolocation mapping. Users upload photos; the app extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map.

Stack and scripts are in `package.json`. Backend listens on port `3001` (override with `PORT` env var). No `.env` file required.

## CT 106 (dev box)

- **Checks:** `sh scripts/check.sh`, from the repo root, runs exactly what CI runs (`ci.yml` calls the same script): `npm run check` in the `node:22-bookworm` container (vendored-platform check, typecheck, lint, Prettier, Vitest with coverage, build, `npm audit`), then `scripts/e2e.sh`. It writes only the gitignored `node_modules/`, `dist/`, `coverage/` and `e2e-results/`.
- **End-to-end tests:** `sh scripts/e2e.sh [filter]` builds the image, runs it on a throwaway Docker network as host `photomapper` (not `app`: browsers force `.app` onto HTTPS) with an in-memory `/config` and `ALLOW_RESET=true`, and runs `e2e/` from the pinned Playwright image (Node 26 there, so the tests never start the app themselves). The user has agreed to these running on CT 106. The app is reached over plain HTTP there, as on the dev copy: browser-only APIs that need HTTPS (`crypto.randomUUID`, clipboard reads) must not be relied on.
- **Dev server:** `npm run dev` (Vite plus the API on `:3001`), in the same Docker image.
- **Test stack:** `docker compose up -d --build`, test data only. The git-excluded `compose.override.yaml` publishes port 3001 on all interfaces (the tracked `docker-compose.yml` binds loopback only, for the live layout). code-server's `/proxy/3001/` does not work, because the app loads its files from root paths.
- `.devcontainer/` is a leftover from Codespaces and is not used on CT 106.

## Shared platform (phase 3 of the HuttonHomeHub App Standard)

- `vendor/hhh-platform/` is a vendored hhh-platform release (version in its `VERSION`). Never edit it: `npm run vendor:check` fails CI if it differs from the release. Upgrade with `node vendor/hhh-platform/scripts/vendor.ts X.Y.Z` in its own PR. The Dockerfile copies `vendor/` before `npm ci`, and into the runtime image (`@hhh/server` runs from it).
- TypeScript, ESLint, Prettier and Vitest come from `@hhh/config`. Two TypeScript projects: `tsconfig.json` (server, tests) and `tsconfig.app.json` (browser, JSX). The server and front end are TypeScript (imports name the `.ts`/`.tsx` file): Node runs the server directly, Vite bundles `src/` (`moduleResolution: bundler`). The API's shapes live once in `shared/api.ts`, used by both; never redeclare them. Types for untyped libraries go in `src/types/`. Tests are TypeScript too: `tests/**/*.ts` (server, pure logic) in `tsconfig.json`, `tests/**/*.tsx` (components, hooks, jsdom) in `tsconfig.app.json`. Shared test helpers: `tests/factories.ts` (`photo()`, `project()`, `client()`, and `must()` instead of `!`), `tests/helpers.ts` (CSRF `write()`, binary bodies), `tests/fetchStub.ts` (a typed fetch for jsdom tests).
- `eslint.config.js` is the shared config with no overrides; keep it that way (the React rules cover `src/**/*.ts` hooks too).
- Coverage gate: `LINES_FLOOR` in `vitest.config.js` is the measured level (91.6%, above the standard's 80%) and only goes up: new code comes with tests. Components are tested in jsdom with real Leaflet; jsdom needs `clientWidth`/`clientHeight` stubbed for the map to have a view, and `leaflet-heatmap` mocked (no canvas). Run coverage with `--coverage.reportsDirectory=/tmp/...` when several runs share the checkout.

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
- Dependabot (`.github/dependabot.yml`) opens weekly PRs into `dev` for npm, GitHub Actions and the Node base image. New Node major versions aren't proposed, nor `@types/node` majors: changing Node also means changing `scripts/check.sh`, the Dockerfile and `@types/node` together.

## File Map

```
src/
  main.tsx              App entry point
  App.tsx               Root layout: app bar, sidebar + map
  hooks/use*.ts         Every API call (via apiFetch): photos, projects, clients, upload, settings, share, geocode, reset
  components/
    DropZone.tsx        Drag-and-drop upload with per-file status
    PhotoList.tsx       Sidebar list with thumbnails + delete
    PhotoMap.tsx        Leaflet map — all refs and effects stay in this file; its handle exposes flyTo/getBounds/fitToBounds to App.tsx
    UploadDrawer.tsx    Slide-in drawer showing per-file upload results
    PhotoLightbox.tsx   Full-screen image viewer with EXIF panel and keyboard nav
    SettingsDialog.tsx  The app bar's gear: instance info and backups (kit cards)
  styles/index.css      PhotoMapper's styles, on the @hhh/ui tokens (light and dark)
shared/
  api.ts                The API's request/response types, for server and browser
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
- **camelCase ↔ snake_case** — DB columns are `snake_case`; `db.ts` maps them to `camelCase` for the API
- **UUID filenames** — uploaded files get UUID names on disk; original name stored in `original_name` DB column
- **Non-fatal EXIF** — photos without GPS still upload successfully; `has_gps = 0`
- **Look** — the shell is the kit's `AppBar` (brand and version, shortcuts, theme toggle, Settings). Colours, type and spacing are `@hhh/ui` tokens (`tokens.css`, then `base.css` and `components.css`, imported in `main.tsx`); `index.css` maps its older `--color-*`/`--font-*` names onto them. Never hard-code a colour or font size. Accent or status text never sits on `--bg-surface-sunken`.
- `index.html` loads `/theme-init.js` (the kit's, served and emitted by a plugin in `vite.config.js`) so a saved theme applies before first paint.
- Vite dev server proxies `/api` and `/uploads` to `:3001`
- Unit tests live under `tests/` (Vitest), end-to-end tests under `e2e/` (Playwright). Run `sh scripts/check.sh` before every push.

## Subagents

Use these for focused work to avoid loading irrelevant context:

- **frontend** — React components, hooks, styles, Leaflet map (`src/`)
- **backend** — Express routes, DB operations, EXIF parsing (`server/`)

## Development Workflow

- Commits: imperative, focused — `add deletion endpoint`, `fix map clustering on zoom`

## AI Assistant Rules

**Do:**

- Read relevant files before making changes
- Put new API calls in a hook under `src/hooks/` (components never call `fetch` or `apiFetch`); keep Leaflet logic inside `PhotoMap.tsx`
- React rules are strict: no `setState` directly in an effect (derive the value, or adjust state when a prop changes during render), no dynamic `delete` (use a `Map`), named exports only
- New routes → `server/routes/`; new DB ops → `server/db.ts`

**Don't:**

- Add error handling, comments, or refactors beyond what was asked
- Introduce new dependencies without discussing first (Dependabot bumps of existing ones are fine)
- Create backup files, scratch files, or temporary docs

## Updating This File

Keep only what Claude cannot infer from source files. If it's already in `package.json`, `server/app.ts`, or `server/db.ts` — don't repeat it here. Keep it consistent with `~/projects/CLAUDE.md`.
