# PhotoMapper API Reference

The backend is an Express app (default port `3001`). All application endpoints
live under `/api`; the frontend and uploaded images are served from the same
origin. In production the app sits behind a reverse proxy that terminates TLS and
enforces authentication (see [`DEPLOYMENT-SECURITY.md`](DEPLOYMENT-SECURITY.md)) —
the app assumes every request that reaches it is already authenticated.

## Conventions

- **Requests:** JSON bodies (`Content-Type: application/json`), except photo
  upload which is `multipart/form-data`.
- **Responses:** JSON, `camelCase` keys. DB columns are `snake_case` internally
  and mapped at the boundary.
- **Errors:** `{ "error": "message" }`. Validation failures return
  `400 { "error": "Invalid request", "details": [{ "field": "...", "message": "..." }] }`.
  An unknown `/api` path is `404 { "error": "Not found" }`.
- **CSRF:** every `POST`, `PUT`, `PATCH` and `DELETE` must send the `hhh_csrf` cookie's
  value in an `X-CSRF-Token` header (the cookie is set on the first page load; the
  front end's `apiFetch` does this). Otherwise `403`.
- **Rate limiting:** every `/api` route is rate-limited per IP (default 1000
  requests / 15 min, set by `API_RATE`; `RateLimit` headers are returned; `429` when exceeded).
- **Security headers:** helmet + a strict CSP are applied to all responses.

## Object shapes

### Photo

```json
{
  "id": "uuid",
  "filename": "uuid.jpg",
  "thumbnailFilename": "thumb_uuid.jpg",
  "originalName": "IMG_1234.jpg",
  "uploadedAt": "2026-07-03T10:00:00.000Z",
  "hasGps": true,
  "lat": 51.5,
  "lng": -0.12,
  "altitude": 42,
  "imgDirection": 180,
  "dateTaken": "2026-01-01T12:00:00.000Z",
  "surveyDate": "2026-01-01",
  "cameraMake": "Canon",
  "cameraModel": "EOS",
  "focalLength": 35,
  "focalLengthIn35mm": 50,
  "panoHFov": null,
  "fNumber": 2.8,
  "iso": 100,
  "exposureTime": "1/200s",
  "locationName": "London, UK",
  "description": null,
  "tags": [],
  "projectId": null
}
```

Photos without GPS still upload with `hasGps: false` and null coordinates.

### Project

```json
{
  "id": "uuid",
  "name": "Site Survey",
  "clientId": "uuid|null",
  "clientName": "Acme Co|null",
  "status": "active|archived",
  "color": "#e97b25",
  "createdAt": "...",
  "updatedAt": "...",
  "photoCount": 0
}
```

### Client

```json
{ "id": "uuid", "name": "Acme Co", "createdAt": "...", "updatedAt": "...", "projectCount": 0 }
```

---

## Photos

### `POST /api/photos`

Upload a photo. `multipart/form-data`:

| Field       | Type              | Notes                                                                       |
| ----------- | ----------------- | --------------------------------------------------------------------------- |
| `photo`     | file (required)   | JPEG, PNG, HEIC or WebP. Size capped by `UPLOAD_MAX_BYTES` (default 60 MB). |
| `projectId` | string (optional) | Assign to a project on upload.                                              |

- **201** → the created Photo. GPS/EXIF is extracted server-side; location name is
  resolved in the background (see reverse geocoding) unless already cached.
- **400** `{ "error": "No file uploaded" }` — no file part.
- **409** `{ "error": "duplicate", "message": "...", "photo": { … } }` — the file's
  content hash matches an existing photo (server-side de-duplication).
- **400** `{ "error": "Unsupported file type: …" }` and **413** `{ "error": "File is too large" }`.

### `GET /api/photos`

List photos, newest first. **Backward-compatible dual shape:**

- With **no query params** → **200** → a bare array of Photos (legacy).
- With **any** filter/paging param below → **200** →
  `{ "items": [Photo…], "total": <int>, "limit": <int|null>, "offset": <int> }`.

| Param             | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `limit`, `offset` | Pagination. `limit` is capped at 500.                             |
| `projectId`       | Filter by project; `none` = unassigned.                           |
| `clientId`        | Filter by client (via the photo's project); `none` = unassigned.  |
| `surveyDate`      | `YYYY-MM-DD`; `undated` = no survey date.                         |
| `tag`             | Photos carrying this exact tag.                                   |
| `search`          | Substring match on original name / location / description / tags. |
| `hasGps`          | `true` → only geotagged photos.                                   |
| `from`, `to`      | `YYYY-MM-DD` bounds on the date taken.                            |
| `bbox`            | `west,south,east,north` — geotagged photos within the box.        |

> Draw-region (polygon) filtering is applied client-side, not via this endpoint.

### `GET /api/photos/:id`

Single-photo detail (full EXIF), for the lightbox / deep-linking.

- **200** → the Photo. **404** unknown id.

### `GET /api/photos/export?format=geojson|kml`

Download geotagged photos as a file (defaults to GeoJSON).

- **200** → `application/geo+json` (`photos.geojson`) or
  `application/vnd.google-earth.kml+xml` (`photos.kml`), `Content-Disposition: attachment`.

### `PATCH /api/photos/batch`

Update many photos at once.

```json
{ "ids": ["id1", "id2"], "tags": ["a"], "description": "note", "mergeTags": true }
```

- `ids` (required, ≥1). `tags`, `description`, `mergeTags` optional. With
  `mergeTags: true`, `tags` are unioned with each photo's existing tags.
- **200** `{ "updated": <count> }` (unknown ids are skipped).
- **400** — empty/invalid `ids`.

### `PATCH /api/photos/:id`

Partial update of a single photo.

```json
{
  "description": "…",
  "tags": ["a", "b"],
  "projectId": "uuid|null",
  "surveyDate": "YYYY-MM-DD|null"
}
```

- Absent keys are left unchanged. `surveyDate` must be `YYYY-MM-DD`.
- **200** → the updated Photo. **400** invalid body. **404** unknown id.

### `DELETE /api/photos/:id`

- **200** `{ "id": "…" }` — record and its files (image + thumbnail) removed.
- **404** unknown id.

---

## Clients

### `GET /api/clients`

- **200** → array of Clients (with `projectCount`), ordered by name.

### `POST /api/clients`

`{ "name": "Acme Co" }`

- **201** → the created Client. **400** blank name. **409** name already exists.

### `PATCH /api/clients/:id`

`{ "name": "New Name" }`

- **200** → the updated Client. **400** blank name. **404** unknown id.
  **409** name already exists.

### `DELETE /api/clients/:id`

- **200** `{ "id": "…" }` — the client's projects are unassigned (not deleted).
- **404** unknown id.

---

## Projects

### `GET /api/projects`

- **200** → array of Projects (with `clientName` + `photoCount`), newest first.

### `POST /api/projects`

```json
{ "name": "Survey", "clientId": "uuid|null", "status": "active|archived", "color": "#e97b25" }
```

- Only `name` is required. **201** → the created Project. **400** blank name.

### `PATCH /api/projects/:id`

Partial update: `{ "name"?, "clientId"?, "status"?, "color"? }`.

- Absent keys are untouched; an explicit `"clientId": null` **unassigns** the client.
- **200** → the updated Project. **400** — no updatable fields, or invalid body.
  **404** unknown id.

### `DELETE /api/projects/:id`

- **200** `{ "id": "…" }` — the project's photos are unassigned (not deleted).
- **404** unknown id.

### `PATCH /api/projects/:id/photos`

Assign photos to (or, with `projectId` resolving to null server-side, off) a project.

```json
{ "photoIds": ["id1", "id2"] }
```

- **200** `{ "assigned": <count> }`. **400** empty `photoIds`.

---

## Geocoding

### `GET /api/geocode/search?q=<query>`

Forward place search, proxied server-side to Nominatim (cached, rate-limited; the
browser never calls Nominatim directly).

- **200** → `[{ "lat": <number>, "lon": <number>, "displayName": "…" }]` (up to 5).
- **400** `{ "error": "Missing query" }` — empty `q`.
- **502** `{ "error": "Location search failed" }` — upstream error/timeout.

**Reverse geocoding** (coordinate → place name) is not a public endpoint: it runs
in a rate-limited background queue after upload and is written onto the photo's
`locationName`, using a persistent cache keyed by rounded lat/lng.

---

## Operations

### `GET /health`

Liveness — **200** `{ "status": "ok" }` without touching the database. Not under
`/api`, so not rate-limited.

### `GET /ready`

Readiness — runs a trivial DB query.

- **200** `{ "status": "ready" }` — database reachable.
- **503** `{ "status": "unavailable" }` — database unreachable.

### `DELETE /api/reset`

Destructive full wipe (all photos, projects, clients, uploads). Disabled by default.

- **403** `{ "error": "Reset is disabled…" }` unless `ALLOW_RESET=true`.
- **200** `{ "ok": true }` when enabled.

---

## Static

- `GET /uploads/:filename` — uploaded images and thumbnails.
- `GET /*` — any non-API path serves the built SPA (`index.html`).
