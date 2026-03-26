# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project

**fuzzy-guide** — full-stack web app for photo geolocation mapping. Users upload photos; the app extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map.

Stack and scripts are in `package.json`. Backend listens on port `3001` (override with `PORT` env var). No `.env` file required.

## File Map

```
src/
  main.jsx              App entry point
  App.jsx               Root layout: sidebar + map
  hooks/usePhotos.js    ALL photo API calls live here — do not fetch elsewhere
  components/
    DropZone.jsx        Drag-and-drop upload with per-file status
    PhotoList.jsx       Sidebar list with thumbnails + delete
    PhotoMap.jsx        Leaflet map — all refs and effects stay in this file
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
- **Dark theme palette** — `#1a1a2e` bg, `#16213e` sidebar, `#e94560` accent — match this in new UI
- Vite dev server proxies `/api` and `/uploads` to `:3001`
- No test suite yet — place tests under `tests/` when adding one

## Subagents

Use these for focused work to avoid loading irrelevant context:

- **frontend** — React components, hooks, styles, Leaflet map (`src/`)
- **backend** — Express routes, DB operations, EXIF parsing (`server/`)

## Development Workflow

- Branch: `claude/<description>-<id>` for AI tasks; never push directly to `master`
- Commits: imperative, focused — `add deletion endpoint`, `fix map clustering on zoom`
- All `master` changes go through a PR; AI assistants create the PR and notify the user

## AI Assistant Rules

**Do:**
- Read relevant files before making changes
- Extend `usePhotos.js` for new API interactions; keep Leaflet logic inside `PhotoMap.jsx`
- New routes → `server/index.js`; new DB ops → `server/db.js`

**Don't:**
- Add error handling, comments, or refactors beyond what was asked
- Introduce new dependencies without discussing first
- Push to `master` directly or create a PR unless explicitly asked
- Create backup files, scratch files, or temporary docs

## Updating This File

Keep only what Claude cannot infer from source files. If it's already in `package.json`, `server/index.js`, or `server/db.js` — don't repeat it here.
