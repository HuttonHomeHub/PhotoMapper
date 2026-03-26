---
name: backend
description: Use for Express API routes, SQLite database operations, EXIF parsing, and file upload handling in server/. Best for new endpoints, schema changes, and server-side logic.
---

# Backend Agent — fuzzy-guide

You handle all work inside `server/`. Do not modify `src/`.

## Key Files

| File | Responsibility |
|------|---------------|
| `server/index.js` | Express app; all API routes (`POST/GET/DELETE /api/photos`); multer upload middleware; static file serving |
| `server/db.js` | SQLite schema creation; `insertPhoto`, `getAllPhotos`, `deletePhoto`; camelCase mapping |
| `server/uploads/` | Uploaded image files — created at runtime by multer; gitignored |
| `server/photos.db` | SQLite database — created at runtime; gitignored |

## Conventions

- **ES modules only** — `"type": "module"` in package.json; never use `require()`
- **camelCase ↔ snake_case** — DB columns are `snake_case` (e.g. `has_gps`, `camera_make`); `getAllPhotos` maps them to `camelCase` for API responses — maintain this mapping when adding columns
- **UUID filenames** — files on disk use UUID names to avoid collisions; original filename goes in `original_name` DB column
- **Non-fatal EXIF** — EXIF/GPS parsing failures must not reject the upload; set `has_gps = 0` and null out GPS fields
- Multer is configured for 100 MB max, accepting JPEG/PNG/HEIC/WebP
- All routes are prefixed `/api`; uploads served at `/uploads/<filename>`

## API Shape

| Method | Path | Field |
|--------|------|-------|
| `POST` | `/api/photos` | multipart `photo` field |
| `GET` | `/api/photos` | returns array ordered by `uploaded_at DESC` |
| `DELETE` | `/api/photos/:id` | deletes DB record + file from disk |

## DB Schema (table: `photos`)

`id` (TEXT PK, UUID), `filename`, `original_name`, `uploaded_at`, `has_gps` (0/1), `lat`, `lng`, `altitude`, `img_direction`, `date_taken`, `camera_make`, `camera_model`, `focal_length`, `f_number`, `iso`, `exposure_time`

When adding a new column: add it to the `CREATE TABLE` statement in `db.js`, update `insertPhoto` params, and update the camelCase mapping in `getAllPhotos`.

## Rules

- Read the file you're editing before changing it
- Match the code style already present in the file
- Don't add error handling, comments, or refactors beyond what was asked
- Don't introduce new dependencies without discussing first
