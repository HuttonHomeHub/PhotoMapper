# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project

**fuzzy-guide** — full-stack web app for photo geolocation mapping. Users upload photos; the app extracts GPS/EXIF data and plots them as interactive pins on a Leaflet map.

Stack and scripts are in `package.json`. Backend listens on port `3001` (override with `PORT` env var). No `.env` file required.

## Development Environment

- **Editor:** GitHub Codespaces + Claude Code VS Code plugin
- **App access:** Vite and the API are accessed via Codespaces forwarded port URLs (`*.app.github.dev`), not `localhost`
- **Dev server:** Start manually with `npm run dev`; `.devcontainer/` exists for Codespaces setup

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
- **Dark theme palette** — `#1a1a2e` bg, `#16213e` sidebar, `#e94560` accent — match this in new UI
- Vite dev server proxies `/api` and `/uploads` to `:3001`
- No test suite yet — place tests under `tests/` when adding one

## Subagents

Use these for focused work to avoid loading irrelevant context:

- **frontend** — React components, hooks, styles, Leaflet map (`src/`)
- **backend** — Express routes, DB operations, EXIF parsing (`server/`)

## Development Workflow

- Branch: `claude/<description>-<id>` for AI tasks; never push directly to `main`
- Commits: imperative, focused — `add deletion endpoint`, `fix map clustering on zoom`
- Claude makes file changes only — user handles all git operations (stage, commit, push, PR) via VS Code source control or terminal

## AI Assistant Rules

**Do:**
- Read relevant files before making changes
- Extend `usePhotos.js` for new API interactions; keep Leaflet logic inside `PhotoMap.jsx`
- New routes → `server/index.js`; new DB ops → `server/db.js`

**Don't:**
- Add error handling, comments, or refactors beyond what was asked
- Introduce new dependencies without discussing first
- Run any git commands — no `git add`, `git commit`, `git push`, or `gh pr create`; user owns all git operations
- Create backup files, scratch files, or temporary docs

## Updating This File

Keep only what Claude cannot infer from source files. If it's already in `package.json`, `server/index.js`, or `server/db.js` — don't repeat it here.
