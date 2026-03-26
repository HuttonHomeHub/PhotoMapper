# CLAUDE.md

This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**Repository:** `huttonhomehub/fuzzy-guide`

**fuzzy-guide** is a full-stack web application for photo geolocation mapping. Users upload photos, the app extracts GPS coordinates and EXIF metadata (camera settings, date taken, etc.), and displays the photos as interactive pins on a map.

**Tech stack:**
- **Frontend:** React 18, Vite 6, Leaflet 1.9 + MarkerCluster (map)
- **Backend:** Node.js (ES modules), Express 4
- **Database:** SQLite via better-sqlite3
- **EXIF parsing:** exifr
- **Package manager:** npm

**Supported image formats:** JPEG, PNG, HEIC, WebP (max 100 MB per file)

## Repository Structure

```
fuzzy-guide/
├── CLAUDE.md              # This file
├── package.json           # All dependencies + npm scripts
├── package-lock.json
├── vite.config.js         # Vite config; proxies /api and /uploads to :3001
├── index.html             # SPA HTML entry point
├── .gitignore
├── src/                   # React frontend
│   ├── main.jsx           # App entry; mounts React into #root
│   ├── App.jsx            # Root component; sidebar + map layout
│   ├── hooks/
│   │   └── usePhotos.js   # Fetches photos from API; handles deletion
│   ├── components/
│   │   ├── DropZone.jsx   # Drag-and-drop upload with per-file status
│   │   ├── PhotoList.jsx  # Sidebar photo list with thumbnails + delete
│   │   └── PhotoMap.jsx   # Leaflet map; custom pins, clustering, popups
│   └── styles/
│       └── index.css      # Global styles — dark theme, layout, pin/cluster CSS
└── server/
    ├── index.js           # Express server; API routes; static file serving
    ├── db.js              # SQLite schema, insertPhoto, getAllPhotos, deletePhoto
    ├── uploads/           # Uploaded image files — gitignored, created at runtime
    └── photos.db          # SQLite database — gitignored, created at runtime
```

## Build & Run

```bash
# Install dependencies
npm install

# Development (runs Vite frontend + Express backend concurrently)
npm run dev

# Backend only
npm run server

# Build frontend for production
npm run build

# Production server (serves built frontend + API)
npm start
```

The backend listens on port `3001` by default (override with `PORT` env var).
Vite dev server proxies `/api` and `/uploads` to `http://localhost:3001`.

## Environment Setup

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Express server port |

No `.env` file is required to run locally — `PORT` is the only variable. Never commit `.env` or credentials.

## API Reference

All routes are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/photos` | Upload a photo (multipart/form-data, field: `photo`); extracts EXIF and stores in DB |
| `GET` | `/api/photos` | Return all photos ordered by upload date descending |
| `DELETE` | `/api/photos/:id` | Delete a photo record and remove the file from disk |

**Photo object fields (JSON):**
`id`, `filename`, `originalName`, `hasGps`, `lat`, `lng`, `altitude`, `imgDirection`, `dateTaken`, `cameraMake`, `cameraModel`, `focalLength`, `fNumber`, `iso`, `exposureTime`, `uploadedAt`

Static uploads are served at `/uploads/<filename>`.

## Database Schema

**Table: `photos`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `filename` | TEXT | Stored filename (UUID-based) |
| `original_name` | TEXT | User's original filename |
| `uploaded_at` | TEXT | ISO timestamp |
| `has_gps` | INTEGER | 0 or 1 |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `altitude` | REAL | Meters |
| `img_direction` | REAL | Degrees 0–360 |
| `date_taken` | TEXT | ISO datetime from EXIF |
| `camera_make` | TEXT | e.g. "Canon" |
| `camera_model` | TEXT | e.g. "EOS R5" |
| `focal_length` | REAL | mm |
| `f_number` | REAL | Aperture |
| `iso` | INTEGER | ISO sensitivity |
| `exposure_time` | TEXT | e.g. "1/250s" |

DB columns are `snake_case`; the JS layer maps them to `camelCase` in `db.js:getAllPhotos`.

## Key Conventions

- **ES modules throughout** — `package.json` has `"type": "module"`. Use `import`/`export`, never `require`.
- **camelCase in JS/API, snake_case in DB** — mapping happens in `server/db.js`.
- **UUID filenames for uploads** — original name is preserved in the DB but the file on disk gets a UUID name to avoid collisions.
- **Dark theme** — background `#1a1a2e`, sidebar `#16213e`, accent `#e94560`. Keep new UI consistent with this palette.
- **Non-fatal EXIF parsing** — photos without GPS or EXIF data still upload; `has_gps` will be `0`.
- **No test suite yet** — there are no tests. Add them when implementing significant new features.

## Development Workflow

### Branching

- **`master`** — stable, production-ready code; never push directly without a review
- **`claude/<description>-<id>`** — branches for AI assistant tasks
- **Feature branches** — `feat/short-description`, `fix/issue-description`

### Commits

- Use concise, imperative commit messages: `add deletion endpoint`, `fix map clustering on zoom`
- Keep commits focused — one logical change per commit
- Reference issues when relevant: `fix: null GPS crash (#12)`

### Pull Requests

- All changes to `master` go through a PR
- Include a description of what changed and why
- AI assistants should create a PR and notify the user rather than merging directly

## Testing

No test suite is currently configured. When adding tests:
- Place test files under `tests/`
- Update this section with the run command once a framework is chosen

## AI Assistant Guidelines

### Branch
Always develop on the branch specified at the start of your session. If none is specified, create a `claude/<short-description>-<id>` branch off `master`.

### Workflow
1. Read relevant files before making changes — understand existing patterns first
2. Make focused, minimal changes scoped to the task
3. Commit with a clear message describing what and why
4. Push to the working branch; do NOT push to `master` directly
5. Do NOT create a pull request unless explicitly asked

### Project-specific notes
- Frontend state is managed in `usePhotos.js` — prefer extending this hook over adding new fetch calls elsewhere
- Map rendering logic lives entirely in `PhotoMap.jsx` — Leaflet refs and effects are managed there
- New API routes go in `server/index.js`; new DB operations go in `server/db.js`
- The `server/uploads/` directory is created automatically by multer on first upload; do not gittrack it

### Do
- Follow the code style already present in the file you're editing
- Reuse existing utilities and patterns rather than introducing new abstractions
- Ask for clarification when requirements are ambiguous

### Don't
- Don't add error handling, comments, or refactors beyond what was asked
- Don't introduce new dependencies without discussing it first
- Don't create backup files, scratch files, or temporary documentation
- Don't guess at environment-specific values (ports, hostnames, credentials)

## Updating This File

Keep this file current as the project evolves:
- When new routes, schema changes, or conventions are introduced, update the relevant sections
- When a test framework is added, replace the Testing placeholder with real commands
- When new contributors (human or AI) need context, add it here
