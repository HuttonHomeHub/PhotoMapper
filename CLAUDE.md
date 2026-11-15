# CLAUDE.md

Guidance for AI assistants working in this repository. The rules in `~/projects/CLAUDE.md` apply here too. If the two ever disagree, the stricter one wins.

## Project

**PhotoMapper** — full-stack web app for photo geolocation mapping. Users upload photos; the app extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map.

Stack and scripts are in `package.json`. Backend listens on port `3001` (override with `PORT` env var). No `.env` file required.

## Development Environment

- **Where:** CT 106, development only. The live copy runs on VM 113 and is never touched from here.
- **Editor:** Claude Code VS Code plugin
- **Dev server:** `npm run dev` (Vite plus the API on `:3001`). Node is not installed on CT 106, so run it in Docker (see Build and Release) or use `docker compose up --build`.
- **Docker test stack:** `docker compose up --build`, test data only. A local, git-excluded `compose.override.yaml` publishes port 3001 on all interfaces, so the stack is reachable at CT 106's address on port 3001. code-server's `/proxy/3001/` does not work, because the app loads its files from root paths.
- `.devcontainer/` is a leftover from Codespaces and is not used on CT 106

## Build and Release

- GitHub Actions builds and publishes the image (`.github/workflows/publish-image.yml`) to `ghcr.io/huttonhomehub/photomapper`. Never build-and-push it from CT 106.
- A push or merge to `main` publishes a new `:latest`. A `v*` tag publishes `:vX.Y.Z`. A manual workflow run publishes whatever branch it is run on.
- `ci.yml` (lint, Prettier, tests with coverage, build, `npm audit`) runs on `dev`, `claude/**` and PRs into `main` or `dev`. `publish-image.yml` calls it first and only builds the image if it passes, so a red build never reaches GHCR.
- Merging `dev` into `main` is the release. It happens only when the user decides: either they merge it themselves, or their own message is "Ship It" (or `/ship-it`) and Claude follows `.claude/skills/ship-it/SKILL.md`. Only the user tags or triggers a publish by hand. Pushing a `claude/*` branch runs CI only and publishes nothing.
- Release PRs are merged with a merge commit, not squash. The user may leave one `dev` → `main` PR open while work builds up. Keep its description listing what `dev` contains whenever something is merged into `dev`.
- After a release, if `git log --no-merges origin/dev..origin/main` is not empty (the release was squash-merged), open a PR from `main` into `dev` and merge it with a merge commit (not squash) once CI passes, so the next release PR only shows new work. `main` and `dev` require the `build` check, so direct pushes to them are blocked.
- Dependabot (`.github/dependabot.yml`) opens weekly PRs into `dev` for npm, GitHub Actions and the Docker base image. Treat them like any other PR: run `npm run check` on the branch, and test major bumps properly before merging into `dev`. Dependabot security updates stay off, because they always target `main`.
- `npm run check` runs every CI check locally. Run it before every push. Node is not installed on CT 106, so run it in Docker from the repo root:
  `docker run --rm --user 1000:1000 -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v "$PWD":/app -w /app node:22-bookworm sh -c 'npm ci && npm run check'`
- Nothing deploys automatically. The user updates VM 113 by pulling the new image by hand, when they choose.
- Changes to the `Dockerfile`, `docker-compose.yml` or `.github/workflows/` change what gets released. Say so before editing them.

## File Map

```
src/
  main.jsx              App entry point
  App.jsx               Root layout: sidebar + map
  hooks/usePhotos.js    ALL photo API calls live here — do not fetch elsewhere
  components/
    DropZone.jsx        Drag-and-drop upload with per-file status + client-side duplicate detection
    PhotoList.jsx       Sidebar list with thumbnails + delete
    PhotoMap.jsx        Leaflet map — all refs and effects stay in this file; forwardRef exposes flyTo/getBounds to App.jsx
    UploadDrawer.jsx    Slide-in drawer showing per-file upload results
    PhotoLightbox.jsx   Full-screen image viewer with EXIF panel and keyboard nav
  styles/index.css      Global styles (dark theme)
server/
  index.js              Express routes (POST/GET/DELETE /api/photos)
  db.js                 SQLite schema + insertPhoto / getAllPhotos / deletePhoto
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

- Branches: `dev` is the integration branch. Work on `claude/<description>-<id>`, branched from `dev`. Never push directly to `main`.
- Commits: imperative, focused — `add deletion endpoint`, `fix map clustering on zoom`
- Flow: run `npm run check`, push the branch, open a PR into `dev`, and merge it into `dev` when CI is green. Claude decides when.
- Claude may run any git command on CT 106, and push `claude/*` branches only (`dev` and `main` are protected and change only through PRs)
- Releases: the user merges the `dev` → `main` PR, or says "Ship It" for Claude to do it via the `ship-it` skill. If the user asks about releasing in any other words, report the CI state and what `dev` contains, and do not merge.

## AI Assistant Rules

**Do:**
- Read relevant files before making changes
- Extend `usePhotos.js` for new API interactions; keep Leaflet logic inside `PhotoMap.jsx`
- New routes → `server/index.js`; new DB ops → `server/db.js`

**Don't:**
- Add error handling, comments, or refactors beyond what was asked
- Introduce new dependencies without discussing first
- Push to or merge into `main` (the only exception is the `ship-it` skill on the user's "Ship It"), create or push tags, run `gh workflow run`, or use `gh pr merge --admin` or any other bypass
- Connect to VM 113 or any live service, or use live data, passwords or tokens
- Create backup files, scratch files, or temporary docs

## Updating This File

Keep only what Claude cannot infer from source files. If it's already in `package.json`, `server/index.js`, or `server/db.js` — don't repeat it here. Keep it consistent with `~/projects/CLAUDE.md`.
