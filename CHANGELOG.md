# Changelog

All notable changes to PhotoMapper. Versions are the published Docker image tags
(`ghcr.io/huttonhomehub/photomapper:<version>`). The version lives in `package.json`.

Every PR into `dev` adds its line under `## Unreleased`, in `### Added`, `### Changed` or
`### Fixed`. At release, the Ship It skill turns that section into `## vX.Y.Z — <summary>`:
a minor bump if anything is under Added, otherwise a patch bump. The publish workflow uses
that section as the GitHub Release notes.

## Unreleased

### Added

- **New look, the HuttonHomeHub design system** (shared with Crane Charts): an app bar with the name,
  the running version, keyboard shortcuts, a light/dark toggle and Settings; a **light theme**
  alongside the dark one, following the system until you pick one; the Inter typeface on a 14px
  scale. On a phone, the sidebar opens from the app bar's menu button.
- **Settings panel** (the gear): this instance's version, library size, data folders, limits and proxy
  set-up, and its backups: status and schedule, back up now, download, restore, upload and restore.
- **Backups and restore**, the same as Crane Charts (shared kit): a zip of the database and uploads
  every `BACKUP_INTERVAL_HOURS` (24) into `BACKUP_DIR` (default `/config/backups`), keeping
  `BACKUP_KEEP` (7). `/api/backup` lists them, backs up now, downloads one or restores one (by name or
  an uploaded zip, checked first, with a `prerestore` backup taken). `/api/info` reports how the
  instance is set up. The Settings panel for these comes with the new look.

### Changed

- **Test coverage 91.7%** (from 35% at the start of this work, against the standard's 80%): 343 unit
  and component tests, including the map with real Leaflet, plus 12 end-to-end tests.
- **Tests in TypeScript:** every unit test is typed and type-checked, with shared factories for test
  data (development only; no change to the app).
- **Build: Vite 8** (Rolldown) with `@vitejs/plugin-react` 6; builds take about a second. The heatmap
  no longer needs its CommonJS build setting, and a new end-to-end test checks the heatmap really
  draws. Also updated: concurrently 10 and jsdom 31 (development tools).
- Dependabot no longer proposes major versions of `@types/node`: they follow the Node version the
  app runs on (22).
- **End-to-end tests:** 11 Playwright tests drive the built image in a browser (upload with GPS,
  placing a pin by hand, duplicates, notes and tags, delete, clients and projects, share links,
  backup and restore, theme, shortcuts, the phone menu). `scripts/check.sh` runs them after the
  unit checks, the same way on the dev box and in CI.
- **Front end in TypeScript.** Everything under `src/` is strictly typed, with the API's shapes
  defined once in `shared/api.ts` for both server and browser. Every API call now goes through a hook
  (location search, the share page, uploads and reset included). React's stricter hook rules apply
  throughout. No visible change.
- **Database:** opened in WAL mode by the shared kit. New schema changes are numbered SQL files run by
  the kit (from `007`); the original migrations 1–6 are frozen and stay recorded where v1.2.0 expects
  them, so rolling back to v1.2.0 still works.

- **Server on the shared kit (`@hhh/server`, hhh-platform 0.2.0) and Express 5.** The same security
  headers, request logs (one small line per request, no headers or cookies), health routes,
  shutdown and error replies as every HuttonHomeHub app. The page's script policy now also carries a
  per-request nonce.
- **CSRF protection:** every write must send the `hhh_csrf` cookie's token in an `X-CSRF-Token`
  header; the front end does this through `apiFetch` from `@hhh/ui`. A browser tab left open across
  the upgrade needs one reload before its changes save.
- **Settings:** the API rate limit is now one setting, `API_RATE` (default `1000 per 15 minutes`);
  `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` still work and log a deprecation warning. `TRUST_PROXY`
  is a hop count, as in every app (`1` live); an IP list now stops startup with a clear message.
  Server errors are never shown to the browser, in development too.

- **Shared tooling from hhh-platform.** The hhh-platform v0.1.0 release is vendored in
  `vendor/hhh-platform/` (checked in CI against the release); TypeScript 6, ESLint, Prettier and
  Vitest 5 settings now come from `@hhh/config`, with every tool pinned exactly. Lint, format and
  coverage now cover the whole repository, and the coverage gate covers the whole app at its
  measured level (35%), rising with each change to the standard's 80%.
- Removed unused code: an uncalled `clearSelection`, unused props in the photo list and comparison
  panel, and an unattached focus trap in the photo list (its confirm dialog already traps focus).
- **Server in TypeScript.** Everything under `server/` is now strictly typed TypeScript, run
  directly by Node 22 (no build step); the image starts `node server/index.ts`. Routers use named
  exports. No change to the API, settings or data.

### Fixed

- In multi-select mode, clicking a photo's thumbnail selected and immediately deselected it.
- Pressing Enter twice in the upload dialog's new-client fields created the client twice and uploaded
  every photo twice. A failed client creation now says why instead of silently re-enabling the button.
- Adding a tag to several photos said it had worked before the save finished, even when it failed.
- Changing a project between active and archived failed silently on an error; it now says so.
- The elevation chart drew nothing (NaN coordinates) when all photos were taken from one spot; it now
  spaces them evenly.
- The photo viewer's "Saved" note carried over to the next photo.
- With no photos on the map, the page re-rendered in an endless loop, quietly keeping a CPU core
  busy: resetting the map's view reported "new" bounds, which re-filtered the photos, which reset the
  view again.
- In development (`npm run dev`), the app bar's version didn't load (`/version` wasn't proxied).
- Picking photos with the file picker while no project was selected uploaded nothing (the dialog
  said "0 photos"); dragging and dropping was unaffected.
- Uploading crashed when the app was opened over plain HTTP (e.g. on the local network), because
  the upload log used a browser feature only available on HTTPS.
- A project's Share and Delete buttons in the tree only appeared on mouse hover, so they couldn't be
  reached by keyboard or on a touch screen.
- An unknown `/api` path returns a JSON 404 instead of the app's page; an unsupported upload type is
  a 400 and an oversize upload a 413, instead of a 500.
- A failed client, project or batch photo delete no longer leaves the list showing it as gone.

## v1.2.0 — shared container standard: DATA_DIR, DB_PATH, version at /health

### Added

- **The running version is reported** at `GET /health` (`{"status":"ok","version":"X.Y.Z"}`)
  and `GET /version`, from `APP_VERSION`, which the publish workflow sets from the release.
- **`deploy/compose.example.yml`** in the live layout (published port, one `/config` mount,
  shared settings).

### Changed

- **Settings follow the shared container standard**, the same as Crane Charts. The image sets
  `DATA_DIR=/config`, and `DB_PATH` / `UPLOADS_DIR` default inside it. `PHOTOS_DB_PATH` is
  renamed `DB_PATH`; **the old name still works** and logs a one-line warning naming the
  replacement.

## v1.1.1 — real client IP behind Cloudflare (docs)

### Changed

- **Deployment docs: real client IP behind Cloudflare.** nginx restores the visitor's IP from
  Cloudflare's `CF-Connecting-IP` header, and PhotoMapper trusts one hop (`TRUST_PROXY=1`,
  previously documented as `2`). Same setup as Crane Charts.

## v1.1.0 — versioned releases, React 19 and dependency updates

### Added

- **Version numbers for releases.** Each release now publishes the image as `X.Y.Z`, `X.Y`,
  `latest` and `sha-<short>`, and gets a `vX.Y.Z` tag and a GitHub Release with these notes,
  so you can see what is running and pin or roll back to a known version.
- **This changelog.**

### Changed

- **React 19.** `react` and `react-dom` move from 18.3 to 19.3 together. No app code changes
  were needed.
- **Dependency updates** (Dependabot): express-rate-limit 8.7, helmet 8.3, pino 10.4, prettier
  3.10, supertest 7.3 and testing-library patches (#43); better-sqlite3 13 with SQLite 3.54.1
  (#45); globals 17 (#46); GitHub Actions checkout 7, setup-node 7 and the Docker login,
  metadata, Buildx and build-push actions to their latest majors (#37–#42).
- **Publishing only happens on a release** (a merge of `dev` into `main`). The version comes
  from `package.json`; a release whose version already exists fails instead of overwriting an
  image. Pushing a `v*` tag and running the workflow by hand no longer publish.

## Before versioned releases

Releases up to 2026-11-15 (PRs #33 and #35) were published as `:latest` and `:sha-<short>`
only, with `package.json` left at `1.0.0`. They included the dev-branch workflow, dependency
security fixes, Dependabot, CI-gated publishing and the Ship It skill. The first numbered
release is `1.1.0`.
