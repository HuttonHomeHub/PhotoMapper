# Backlog — PhotoMapper Remediation Programme

> **Authoritative source of truth.** Every finding from the deep-dive engineering
> review is tracked here. Completed work is never deleted — its status changes to
> `Completed` and it is recorded in the **Completed log** at the bottom of this file.
>
> Under the 4-document structure (ADR-0005, accepted Session 002) this file also
> carries **programme status** (was PROGRESS.md) and the **completed/change log**
> (was CHANGELOG.md). Roadmap + dependency graph live in `ROADMAP.md`; decisions
> in `ARCHITECTURE_DECISIONS.md`; per-session narrative in `SESSION_LOG.md`.
>
> Last updated: 2026-07-02 (Session 002)

## Programme status

- **Findings:** 71 · **Completed:** 0 · **In Progress:** 1 (TEST-01) · **Deferred:** 3 (+FEAT-06)
- **Current phase:** Phase 1 — Verification foundation

| Phase | Theme | Done / Total | Status |
|---|---|---|---|
| 0 | Programme setup | ✅ | Complete |
| 1 | Verification foundation | 0 / 4 | **Active** |
| 2 | Critical security & reliability | 0 / 13 | Not started |
| 3 | Backend architecture & correctness | 0 / 10 | Not started |
| 4 | Frontend architecture & quality | 0 / 10 | Not started |
| 5 | Performance | 0 / 6 | Not started |
| 6 | Testing depth | 0 / 2 | Not started |
| 7 | Documentation | 0 / 5 | Not started |
| 8 | DevOps & infra | 0 / 7 | Not started |

**Quality gates:** build ✅ · lint ✅ · tests ⏳ (TEST-01) · CI = lint+build only (OPS-01 pending).

**Top open risks:** (1) no automated verification until TEST-01 lands; (2) ARCH-03 migration-runner change is high-risk — must not run before TEST-01/02 + a DB backup step.

## Legend

- **Severity:** Critical · High · Medium · Low
- **Priority:** P0 (now) · P1 (next) · P2 (soon) · P3 (later) · P4 (someday)
- **Effort:** S (hours) · M (days) · L (weeks)
- **Risk:** risk of the *change itself* causing regressions.
- **Status:** Not Started · Blocked · In Progress · Needs Review · Completed · Deferred

## Status summary

| Status | Count |
|---|---|
| Not Started | 67 |
| Blocked | 0 |
| In Progress | 1 |
| Needs Review | 0 |
| Completed | 0 |
| Deferred | 3 |
| **Total** | **71** |

Category counts: SEC 12 · BE 7 · ARCH 7 · CQ 6 · PERF 8 · FE 6 · TEST 5 · OPS 7 · DEP 4 · DOC 6 · FEAT 9.

---

## SECURITY

### SEC-01 — No authentication or authorization
- **Category:** Security · **Severity:** Critical · **Priority:** P0 · **Effort:** M (was L; reduced by ADR-0002) · **Risk:** High · **Status:** Not Started
- **Description:** Every route in `server/index.js` is public. Anyone reaching the host can list, view, upload, edit, and delete all data.
- **Root cause:** No auth layer was ever built; app assumed a trusted local context.
- **Recommended solution:** Per ADR-0002 (single-operator), add a shared-secret/session gate middleware protecting all `/api/*` and `/uploads`. Design the middleware so a future per-user/tenant model (ADR-0002 revision) can slot in without rework.
- **Files affected:** `server/index.js` (new middleware), new `server/auth.js`, `src/hooks/usePhotos.js` (send credentials), new login UI.
- **Dependencies:** Blocks SEC-03. Enabled by DEP-02 (session/cookie lib), TEST-02 (verify). Related to ARCH-07.
- **Notes:** If ADR-0002 is revised to multi-tenant, effort returns to L and this gains a schema-change sub-task.

### SEC-02 — Unauthenticated destructive wipe (`DELETE /api/reset`)
- **Category:** Security · **Severity:** Critical · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `server/index.js:424-429` deletes every row in every table and every uploaded file, with no auth. One `curl -X DELETE .../api/reset` destroys everything.
- **Root cause:** Debug/dev convenience endpoint left in the production surface.
- **Recommended solution:** Remove the endpoint, or gate behind auth (SEC-01) + explicit confirmation token, and exclude from production builds.
- **Files affected:** `server/index.js`, `src/App.jsx` (reset UI at 843-859).
- **Dependencies:** Cleanest done alongside SEC-01; can be removed independently now.

### SEC-03 — Uploaded files served with no authorization
- **Category:** Security · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** `app.use('/uploads', express.static(...))` (`server/index.js:413`) exposes every photo to anyone with the URL. UUID names are obscurity, not access control. Photos carry GPS/EXIF.
- **Root cause:** Static file serving with no gate.
- **Recommended solution:** Serve images through an auth-checked route (stream from disk after authz). Keep thumbnails behind the same gate.
- **Files affected:** `server/index.js`, all components referencing `/uploads/...` (PhotoMap, PhotoList, PhotoLightbox, PhotoComparison).
- **Dependencies:** Blocked by SEC-01.

### SEC-04 — Wide-open CORS
- **Category:** Security · **Severity:** High · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `app.use(cors())` (`server/index.js:19`) allows any origin.
- **Root cause:** Default permissive CORS during dev.
- **Recommended solution:** Restrict to a configured allowlist (env `ALLOWED_ORIGINS`); in single-origin prod, drop CORS entirely.
- **Files affected:** `server/index.js`, env config (OPS-07).
- **Dependencies:** Pairs with SEC-09; benefits from OPS-07.

### SEC-05 — Server-side reverse geocoding: third-party abuse + blocking + DoS
- **Category:** Security · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Every upload synchronously calls Nominatim (`server/index.js:96-114`) with no timeout, cache, or rate limit — violates Nominatim policy (IP ban risk), blocks the response, and lets attackers proxy load through the server.
- **Root cause:** External I/O inline in the request path.
- **Recommended solution:** Move geocoding to a background job (BE-07) with a persistent cache keyed by rounded lat/lng, a request timeout, and a ≤1 req/s limiter. Fall back gracefully.
- **Files affected:** `server/index.js`, new `server/services/geocode.js`, `server/db.js` (cache table).
- **Dependencies:** Implements via BE-07. Related to FEAT-04.

### SEC-06 — Upload validation trusts client MIME; no content check
- **Category:** Security · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `fileFilter` trusts `file.mimetype` (`server/index.js:53-58`); `sharp` only runs for the (non-fatal) thumbnail, so non-images are stored.
- **Root cause:** Extension/MIME-based validation only.
- **Recommended solution:** Validate real content via `sharp.metadata()` (or `file-type`) before accepting; reject on failure; derive extension from verified type.
- **Files affected:** `server/index.js`, geocode/thumbnail path.
- **Dependencies:** Related to FEAT-08 (content scanning). Benefits from ARCH-01 (service extraction).

### SEC-07 — No rate limiting anywhere
- **Category:** Security · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No throttling; combined with 100 MB uploads + full-file SHA-256 + sharp on a synchronous DB, a few concurrent requests stall the server.
- **Root cause:** No limiter middleware.
- **Recommended solution:** `express-rate-limit` globally + stricter limit on upload; lower max upload size; cap concurrency.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02. Satisfies FEAT-04.

### SEC-08 — Internal error messages leaked to clients
- **Category:** Security · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Error middleware returns `err.message` (`server/index.js:415-419`), leaking SQLite messages/paths.
- **Root cause:** Verbose error passthrough.
- **Recommended solution:** Generic client message in prod; full detail to structured logs (CQ-05).
- **Files affected:** `server/index.js`.
- **Dependencies:** Best done with BE-01 (error handling) and CQ-05 (logging).

### SEC-09 — No security headers (helmet/CSP/nosniff/HSTS)
- **Category:** Security · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No `helmet`; missing CSP, `X-Content-Type-Options: nosniff`, HSTS. `nosniff` matters given SEC-06.
- **Recommended solution:** Add `helmet` with a CSP compatible with Leaflet tile hosts and inline map styles.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02.

### SEC-10 — Hash-existence oracle (`check-hash`)
- **Category:** Security · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `GET /api/photos/check-hash` (`server/index.js:303`) reveals whether any hash exists.
- **Recommended solution:** Gate behind auth (SEC-01); consider removing client pre-check entirely (see PERF-07).
- **Files affected:** `server/index.js`, `src/components/DropZone.jsx`.
- **Dependencies:** Resolved largely by SEC-01 + PERF-07.

### SEC-11 — No HTTPS/HSTS enforcement
- **Category:** Security · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No transport security enforcement.
- **Recommended solution:** Terminate TLS at the reverse proxy; set HSTS via helmet (SEC-09); redirect http→https.
- **Files affected:** deployment config (OPS-02), `server/index.js`.
- **Dependencies:** Needs OPS-02 / deploy target.

### SEC-12 — Fragile `innerHTML` map popups (preventive)
- **Category:** Security · **Severity:** Low · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** `buildPopupHtml` (`PhotoMap.jsx:98-148`) builds raw HTML strings. Currently escaped correctly, but any future field added without `escapeHtml` becomes stored XSS.
- **Root cause:** String-built DOM instead of framework rendering.
- **Recommended solution:** Render popups via a React portal into the Leaflet popup container; delete `escapeHtml` string plumbing.
- **Files affected:** `src/components/PhotoMap.jsx`.
- **Dependencies:** Easier after ARCH-02 refactor patterns established.

---

## BACKEND / RELIABILITY

### BE-01 — Express 4 does not catch async errors → hung requests
- **Category:** Backend · **Severity:** Critical · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Thrown/rejected errors in `async` handlers never reach the error middleware; the client hangs until socket timeout. Exposed in `POST /api/photos` (`server/index.js:179`) and all async routes.
- **Root cause:** Express 4 semantics.
- **Recommended solution:** `import 'express-async-errors'` at entry, or a `wrap()` helper, or migrate to Express 5 (DEP-03). Add a test that asserts a thrown async error returns 500, not a hang.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02. Should land with SEC-08. Verified by TEST-02.

### BE-02 — No request validation layer
- **Category:** Backend · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** Bodies destructured and used raw; only `surveyDate` validated (`server/index.js:294`).
- **Recommended solution:** Introduce `zod` schemas per route; centralize in a validation middleware; return 400 with field errors.
- **Files affected:** `server/index.js` (all routes), new `server/schemas/`.
- **Dependencies:** Cleaner after ARCH-01 (routes extracted). Fixes surface for BE-03/BE-04.

### BE-03 — `updateProject` COALESCE can never unset fields
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `client_id = COALESCE(@clientId, client_id)` (`db.js:305-313`) + JS `clientId ?? null` means a project can never be un-assigned from a client; same trap for name/status/color.
- **Root cause:** COALESCE conflates "not provided" with "set to null".
- **Recommended solution:** Distinguish "absent" from "explicit null" (only build SET clauses for provided keys), or accept a sentinel.
- **Files affected:** `server/db.js`, `server/index.js:392-396`.
- **Dependencies:** Pairs with BE-02.

### BE-04 — `PATCH /api/clients/:id` unvalidated, no 404, unhandled unique error
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `server/index.js:359-363` doesn't validate name, returns 200 with `undefined` on missing id, and a duplicate name throws unhandled.
- **Recommended solution:** Validate, 404 on missing, catch unique-constraint → 409.
- **Files affected:** `server/index.js`, `server/db.js`.
- **Dependencies:** Pairs with BE-02, BE-01.

### BE-05 — `check-hash` misuses 404 as a normal signal
- **Category:** Backend · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Returns `404 {duplicate:false}` as an expected (non-error) response (`server/index.js:303-309`).
- **Recommended solution:** Return 200 with `{duplicate: boolean}`; or remove endpoint (PERF-07).
- **Files affected:** `server/index.js`, `src/components/DropZone.jsx`.
- **Dependencies:** May be obsoleted by PERF-07.

### BE-06 — Route ordering: reset & catch-all after error handler/static
- **Category:** Backend · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `DELETE /api/reset` and `GET *` are registered after `express.static(distDir)` and the error middleware (`server/index.js:413-433`) — confusing and bug-prone.
- **Recommended solution:** Reorder: API routes → static → SPA fallback → error handler last.
- **Files affected:** `server/index.js`.
- **Dependencies:** Naturally resolved by ARCH-01.

### BE-07 — No background job / queue (for geocoding, thumbnails)
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Expensive/external work runs inline in the upload request.
- **Recommended solution:** Lightweight in-process job queue (or worker) that processes thumbnail + geocode after the upload responds; mark photo records as "enriching".
- **Files affected:** `server/index.js`, new `server/services/`, `server/db.js`, frontend polling/refresh.
- **Dependencies:** Implements SEC-05. Enabled by ARCH-01.

---

## ARCHITECTURE

### ARCH-01 — `server/index.js` god-file; no layering
- **Category:** Architecture · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** 439-line file mixing routing, business logic, EXIF, geocoding, image processing, export serialization.
- **Recommended solution:** Split into `routes/`, `services/` (upload, exif, geocode, export, image), `repositories/` (wrap db). Keep handlers thin.
- **Files affected:** `server/index.js` → multiple new modules.
- **Dependencies:** Enables BE-02/BE-06/BE-07/SEC-05 cleanly. Do after Phase 1/2 stabilise; verified by TEST-02.
- **Notes:** Prefer this before performance work to avoid rework.

### ARCH-02 — `App.jsx` god component (866 lines, ~30 useState)
- **Category:** Architecture · **Severity:** High · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** All filtering, timeline, location search, reset, and layout in one component.
- **Recommended solution:** Extract `TimelinePlayer`, `LocationSearch`, `FilterBar`, `SidebarSections`; consolidate filter state via `useReducer` or context; memoize derived data.
- **Files affected:** `src/App.jsx`, new components/hooks.
- **Dependencies:** Do before PERF-05 (memoization) to avoid double work.

### ARCH-03 — Migration system: try/catch, swallows all errors, no versioning
- **Category:** Architecture · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** High · **Status:** Not Started
- **Description:** `server/db.js:34-265` evolves schema via `try { ALTER } catch {}`; a genuine failure is hidden; two migrations drop/recreate tables with no backup.
- **Root cause:** Ad-hoc idempotent DDL instead of a versioned runner.
- **Recommended solution:** Introduce a `schema_migrations` version table + ordered migration files applied in a transaction; back up the DB file before destructive steps; fail loudly.
- **Files affected:** `server/db.js` → `server/migrations/`.
- **Dependencies:** High-risk change — must be gated behind TEST-01/02 and a DB backup step. Precedes ARCH-04, PERF-03 (index migrations).

### ARCH-04 — Dead schema (`collections`, `photo_collections`)
- **Category:** Architecture · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Tables created/migrated (`db.js:76-112`) but unused by any route/UI.
- **Recommended solution:** Decide keep-for-future vs remove. If remove, add a migration to drop them (after ARCH-03). Record decision as ADR.
- **Files affected:** `server/db.js`.
- **Dependencies:** Needs ARCH-03 (migration runner). Product decision.

### ARCH-05 — No shared type layer / no TypeScript
- **Category:** Architecture · **Severity:** Medium · **Priority:** P4 · **Effort:** L · **Risk:** Medium · **Status:** Deferred
- **Description:** Hand-written camelCase↔snake_case mappers duplicated; no compile-time safety.
- **Recommended solution:** Migrate to TypeScript incrementally (shared `types/` for the Photo/Project/Client DTOs first, then server, then client).
- **Files affected:** repo-wide.
- **Dependencies:** Large; deferred until architecture stabilises. Reduces future CQ/BE defects.
- **Deferral justification:** High effort, not blocking; best done after ARCH-01/02 so types describe stable modules.

### ARCH-06 — `usePhotos` kitchen-sink hook (25 returns); prop drilling
- **Category:** Architecture · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** One hook owns photos, projects, clients + all mutations; heavy prop drilling into ClientPanel etc.
- **Recommended solution:** Split into `usePhotos`, `useProjects`, `useClients`; provide via context to cut drilling.
- **Files affected:** `src/hooks/usePhotos.js`, `src/App.jsx`, consumers.
- **Dependencies:** Pairs with ARCH-02.

### ARCH-07 — No tenancy model in schema
- **Category:** Architecture · **Severity:** Medium (High if multi-tenant) · **Priority:** P4 · **Effort:** L · **Risk:** High · **Status:** Deferred
- **Description:** No `owner_id`/`tenant_id`; all data global.
- **Recommended solution:** Only if ADR-0002 is revised to multi-tenant: add tenant column to every table + scope all queries + migrate.
- **Files affected:** `server/db.js`, all repositories/routes.
- **Dependencies:** Gated by ADR-0002. Would re-scope SEC-01 to L.
- **Deferral justification:** Out of scope under current single-operator assumption (ADR-0002). Tracked so it is not forgotten if the model changes.

---

## CODE QUALITY

### CQ-01 — DRY violations (formatDate ×4, escapeHtml ×2, geoPhotos ×3)
- **Category:** Code Quality · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Duplicated helpers across `PhotoLightbox`, `PhotoComparison`, `PhotoMap`, `ElevationProfile`, `App`, and `server/index.js`.
- **Recommended solution:** Shared `src/lib/format.js` and `src/lib/geo.js`; server-side `server/lib/`.
- **Files affected:** the above.
- **Dependencies:** Do alongside ARCH-02.

### CQ-02 — Magic numbers
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Upload cap, FOV sensor half-width (18), ground radius (40), cluster thresholds, etc., unnamed.
- **Recommended solution:** Named constants with comments; central `constants` modules.
- **Files affected:** `server/index.js`, `src/components/PhotoMap.jsx`.

### CQ-03 — Dead code exports in `usePhotos`
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `updatePhotoSurveyDate`, `updatePhotoProject`, `assignToProject`, `createProject` exported/destructured but unused (`App.jsx:62-66`).
- **Recommended solution:** Remove or wire up; verify with lint no-unused.
- **Files affected:** `src/hooks/usePhotos.js`, `src/App.jsx`.
- **Dependencies:** Fold into ARCH-06.

### CQ-04 — Inconsistent error UX (toast/alert/confirm/silent)
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Mix of `toast()`, `window.alert/confirm` (`PhotoMap.jsx:588,597`), and silent catches.
- **Recommended solution:** Standardize on toast + confirm modal; remove native dialogs.
- **Files affected:** `PhotoMap.jsx`, others.
- **Dependencies:** Pairs with FE-04.

### CQ-05 — No logging strategy
- **Category:** Code Quality · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Raw `console.*` only; no levels, structure, or request logging.
- **Recommended solution:** Structured logger (`pino`), request-id middleware, log levels via env.
- **Files affected:** `server/index.js`, new `server/lib/logger.js`.
- **Dependencies:** Supports SEC-08, OPS-06.

### CQ-06 — Toast module-level singleton anti-pattern
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `_addToast` module global (`src/components/Toast.jsx:3`) breaks with >1 container; not idiomatic.
- **Recommended solution:** Context-based toast provider.
- **Files affected:** `src/components/Toast.jsx`, `src/App.jsx`.
- **Dependencies:** Fold into ARCH-02/ARCH-06 (context work).

---

## PERFORMANCE

### PERF-01 — `GET /api/photos` unpaginated, all rows/cols
- **Category:** Performance · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Returns entire dataset (`server/index.js:190`, `db.js:285-289`); frontend holds it all in memory.
- **Recommended solution:** Cursor/offset pagination + bbox/viewport query params; map fetches by bounds; list paginates.
- **Files affected:** `server/index.js`, `server/db.js`, `src/hooks/usePhotos.js`, map/list.
- **Dependencies:** Satisfies FEAT-01. Do after ARCH-01. Interacts with PERF-06.

### PERF-02 — Read-after-write full scans
- **Category:** Performance · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Every `PATCH /api/photos/:id` calls `getAllPhotos().find` (`server/index.js:299`); batch endpoint scans all (`:265`).
- **Recommended solution:** Add `getPhotoDtoById`; return only the affected row.
- **Files affected:** `server/db.js`, `server/index.js`.
- **Dependencies:** Pairs with PERF-03; needs a full DTO-by-id query.

### PERF-03 — Missing DB indexes
- **Category:** Performance · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No index on `photos.project_id`, `photos.uploaded_at`, `photos.survey_date`; `getAllProjects` full-scans photos per group.
- **Recommended solution:** Add indexes via the migration runner (ARCH-03).
- **Files affected:** `server/migrations/` (post ARCH-03), `server/db.js`.
- **Dependencies:** Prefer after ARCH-03; can be a standalone idempotent migration before then.

### PERF-04 — Synchronous better-sqlite3 blocks event loop
- **Category:** Performance · **Severity:** Low · **Priority:** P4 · **Effort:** M · **Risk:** Medium · **Status:** Deferred
- **Description:** Every query blocks; scaling ceiling under concurrency.
- **Recommended solution:** Acceptable for single-operator; revisit only if concurrency grows (worker thread or Postgres).
- **Dependencies:** Tied to deploy scale (ADR-0003).
- **Deferral justification:** Not a problem at current scale; premature to optimize (per programme rules).

### PERF-05 — Frontend filter chain unmemoized; O(n·m) `projects.find`
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `filteredPhotos` (`App.jsx:134-163`) recomputes every render with a `projects.find` inside the filter.
- **Recommended solution:** `useMemo` the chain; precompute a `projectId→clientId` map.
- **Files affected:** `src/App.jsx`.
- **Dependencies:** Do during/after ARCH-02.

### PERF-06 — PhotoMap rebuilds all markers on any change / FOV toggle
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Effect keyed on `photoIds`+`fovVisible` (`PhotoMap.jsx:542-620`) clears and recreates every marker/popup/FOV, even when only toggling FOV.
- **Recommended solution:** Diff photo sets; add/remove/update incrementally; separate FOV toggle from marker rebuild.
- **Files affected:** `src/components/PhotoMap.jsx`.
- **Dependencies:** Interacts with PERF-01 (bbox loading), SEC-12 (popup rendering).

### PERF-07 — Client hashes entire file in memory + redundant round-trip
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `DropZone.jsx:3-9` reads whole file (≤100 MB) into memory, duplicating the server hash, plus an extra `check-hash` round-trip.
- **Recommended solution:** Drop client-side hashing/pre-check; rely on server dedupe (already enforced by unique index + 409). Removes SEC-10/BE-05 surface.
- **Files affected:** `src/components/DropZone.jsx`, `server/index.js` (retire check-hash).
- **Dependencies:** Obsoletes SEC-10, BE-05.

### PERF-08 — No response compression
- **Category:** Performance · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No `compression`; JSON + static served uncompressed.
- **Recommended solution:** Add `compression` middleware (or gzip/brotli at reverse proxy).
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02 (or handled at proxy per OPS-02).

---

## FRONTEND / UX / ACCESSIBILITY

### FE-01 — No React error boundary
- **Category:** Frontend · **Severity:** High · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** A single render throw white-screens the whole app.
- **Recommended solution:** Add a top-level `ErrorBoundary` with a recoverable fallback; wrap `<App/>` in `main.jsx`.
- **Files affected:** new `src/components/ErrorBoundary.jsx`, `src/main.jsx`.
- **Dependencies:** Independent; verify via component test (TEST-03).

### FE-02 — Color contrast fails WCAG AA
- **Category:** Frontend/A11y · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `#555` text on dark chart (`ElevationProfile.jsx:102,109`) and similar low-contrast spots.
- **Recommended solution:** Raise to a token meeting ≥4.5:1; audit palette.
- **Files affected:** `ElevationProfile.jsx`, `src/styles/index.css`.

### FE-03 — Dual-range date slider a11y
- **Category:** Frontend/A11y · **Severity:** Low · **Priority:** P3 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** Overlapping range inputs (`App.jsx:560-583`) are hard for keyboard/SR users.
- **Recommended solution:** Proper labels/`aria-valuetext`; consider an accessible range component.
- **Files affected:** `src/App.jsx`, `src/styles/index.css`.
- **Dependencies:** Do during ARCH-02 (FilterBar extraction).

### FE-04 — Client/project delete has no confirmation
- **Category:** Frontend/UX · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `ClientPanel.jsx:167,224` delete immediately — a mis-click removes a whole client/project; inconsistent with photo delete.
- **Recommended solution:** Reuse `ConfirmModal`; warn about cascade impact.
- **Files affected:** `src/components/ClientPanel.jsx`.
- **Dependencies:** Independent; pairs with CQ-04.

### FE-05 — Location search calls Nominatim directly from browser
- **Category:** Frontend · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `App.jsx:270` hits Nominatim from the client (policy/rate-limit exposure).
- **Recommended solution:** Proxy through the server geocode service (BE-07) with caching + limiter, or debounce + attribution.
- **Files affected:** `src/App.jsx`, server geocode service.
- **Dependencies:** Benefits from BE-07/SEC-05.

### FE-06 — No loading/empty states for clients/projects
- **Category:** Frontend/UX · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Projects/clients fetch has no loading or error surface.
- **Recommended solution:** Loading skeleton + error state in ClientPanel.
- **Files affected:** `src/components/ClientPanel.jsx`, `src/hooks/usePhotos.js`.

---

## TESTING

### TEST-01 — No unit test harness (bootstrap)
- **Category:** Testing · **Severity:** Critical (enabler) · **Priority:** P0 · **Effort:** M · **Risk:** Low · **Status:** In Progress (Session 002)
- **Description:** No runner, no `test` script, no tests. Quality gates are unenforceable.
- **Recommended solution:** Add Vitest; seed unit tests for pure helpers (`pointInPolygon`, `haversineKm`, FOV math, exposure/date format, `escapeHtml`) and `db.js` against in-memory SQLite; add `test` script.
- **Files affected:** `package.json`, new `tests/`, `vitest.config`.
- **Dependencies:** **Foundational — precedes all risky changes.** Feeds OPS-01.

### TEST-02 — API integration tests
- **Category:** Testing · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No route-level tests.
- **Recommended solution:** `supertest` over the Express app with a temp DB + temp uploads dir: upload (GPS/no-GPS), dedupe/409, delete, batch, export (GeoJSON+KML), validation 400s, and the BE-01 async-error path.
- **Files affected:** `tests/api/`, minor `server/index.js` export refactor (export `app`).
- **Dependencies:** Needs TEST-01. Verifies SEC/BE/ARCH work.

### TEST-03 — Component tests
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No React component tests.
- **Recommended solution:** React Testing Library: DropZone flow, PhotoList filter/sort/select, ClientPanel tree, Lightbox autosave, ErrorBoundary (FE-01).
- **Files affected:** `tests/components/`.
- **Dependencies:** Needs TEST-01.

### TEST-04 — E2E tests
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No end-to-end coverage.
- **Recommended solution:** Playwright (available in env): upload → pin appears → filter → export.
- **Files affected:** `tests/e2e/`, CI.
- **Dependencies:** Needs TEST-01 + a stable run target.

### TEST-05 — Coverage gates in CI
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No coverage measurement/threshold.
- **Recommended solution:** Vitest coverage; start at a realistic threshold (e.g. server 60%) and ratchet up.
- **Files affected:** `vitest.config`, CI (OPS-01).
- **Dependencies:** Needs TEST-01/02, OPS-01.

---

## DEVOPS / INFRASTRUCTURE

### OPS-01 — CI runs lint+build only (no tests/audit/typecheck)
- **Category:** DevOps · **Severity:** High · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** `.github/workflows/ci.yml` never runs tests or `npm audit`.
- **Recommended solution:** Add `npm test` + `npm audit --audit-level=high` steps; run on the working branch too (currently only `main`).
- **Files affected:** `.github/workflows/ci.yml`, `package.json`.
- **Dependencies:** Needs TEST-01 to have something to run. Satisfies DEP-04.

### OPS-02 — No Dockerfile / container / deploy pipeline
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No container or deploy story.
- **Recommended solution:** Multi-stage Dockerfile (build Vite → serve via node); `.dockerignore`; document run. Per ADR-0003 (single VPS).
- **Files affected:** new `Dockerfile`, `.dockerignore`, docs.
- **Dependencies:** Gated by ADR-0003. Precedes SEC-11 (TLS/proxy).

### OPS-03 — No persistence/backup strategy for DB + uploads
- **Category:** DevOps · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** `photos.db` + `uploads/` on local disk; no backups.
- **Recommended solution:** Per ADR-0003, mount a persistent volume; scheduled DB backup (SQLite `.backup`) + uploads sync; documented restore. (If ADR-0003 → PaaS: object storage + managed DB — FEAT-09.)
- **Files affected:** deploy config, new backup script, docs.
- **Dependencies:** Gated by ADR-0003.

### OPS-04 — No monitoring/health/alerting/error tracking
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No `/health`, no error tracking, no metrics.
- **Recommended solution:** `/health` + `/ready` endpoints; optional Sentry; basic metrics/log shipping.
- **Files affected:** `server/index.js`, deploy config.
- **Dependencies:** Pairs with CQ-05/OPS-06.

### OPS-05 — No graceful shutdown (SIGTERM)
- **Category:** DevOps · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No signal handling; in-flight requests dropped on deploy; DB not closed.
- **Recommended solution:** Handle SIGTERM/SIGINT: stop accepting, drain, `db.close()`.
- **Files affected:** `server/index.js`.
- **Dependencies:** Pairs with OPS-02.

### OPS-06 — No structured/request logging
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No request logs or correlation ids.
- **Recommended solution:** `pino-http` request logging with ids (shared with CQ-05).
- **Files affected:** `server/index.js`, `server/lib/logger.js`.
- **Dependencies:** Same work as CQ-05.

### OPS-07 — No environment config management/validation
- **Category:** DevOps · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Only `PORT` via env; no `.env` schema; no validation of required config (origins, secret, log level).
- **Recommended solution:** Central `server/config.js` reading + validating env (zod); `.env.example`.
- **Files affected:** new `server/config.js`, `.env.example`, `server/index.js`.
- **Dependencies:** Enables SEC-01 (secret), SEC-04 (origins), CQ-05 (log level). Do early in Phase 2.

---

## DEPENDENCIES

### DEP-01 — Unmaintained heatmap libs (heatmap.js 2016, leaflet-heatmap 1.0.0)
- **Category:** Dependencies · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Vendored patched `heatmap.js`; both libraries stale.
- **Recommended solution:** Evaluate `leaflet.heat`; replace and remove the vendored file.
- **Files affected:** `src/lib/heatmap-patched.js`, `vite.config.js`, `PhotoMap.jsx`, `package.json`.
- **Dependencies:** Needs component test for heatmap behavior.

### DEP-02 — Missing production dependencies
- **Category:** Dependencies · **Severity:** High (enabler) · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No `helmet`, `express-rate-limit`, `compression`, `express-async-errors` (or Express 5), session lib, `zod`, `pino`.
- **Recommended solution:** Add the set as Phase 2 lands; per CLAUDE.md, dependency additions are recorded here as the "discussion" and in an ADR.
- **Files affected:** `package.json`, `package-lock.json`.
- **Dependencies:** Enables SEC-04/07/09, BE-01/02, PERF-08, CQ-05.

### DEP-03 — Express 4 → 5
- **Category:** Dependencies · **Severity:** Low · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Express 5 natively handles async errors (would subsume BE-01's shim).
- **Recommended solution:** Evaluate migration after tests exist; may replace `express-async-errors`.
- **Files affected:** `server/index.js`, `package.json`.
- **Dependencies:** Needs TEST-02 first. Alternative to BE-01 shim.

### DEP-04 — No `npm audit` in CI
- **Category:** Dependencies · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Vulnerability status unknown.
- **Recommended solution:** Add `npm audit` to CI (OPS-01) and triage output.
- **Files affected:** `.github/workflows/ci.yml`.
- **Dependencies:** Part of OPS-01.

---

## DOCUMENTATION

### DOC-01 — No README
- **Category:** Documentation · **Severity:** High · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No project overview, setup, run, or deploy docs.
- **Recommended solution:** README: what/why, stack, dev setup, scripts, architecture summary, link to `docs/project-management/`.
- **Files affected:** new `README.md`.
- **Dependencies:** Independent; keep updated as architecture changes.

### DOC-02 — Name mismatch (fuzzy-guide / PhotoMap / PhotoMapper)
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Package name, UI brand, and repo name differ.
- **Recommended solution:** Pick one canonical name; update `package.json`, UI, docs. Record as ADR.
- **Files affected:** `package.json`, `src/App.jsx`, `index.html`, docs.

### DOC-03 — No API reference
- **Category:** Documentation · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** Endpoints undocumented.
- **Recommended solution:** `docs/API.md` (or OpenAPI) covering routes, params, responses, errors.
- **Files affected:** new `docs/API.md`.
- **Dependencies:** Author after ARCH-01/BE-02 stabilize routes.

### DOC-04 — No architecture diagram / ADRs
- **Category:** Documentation · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** In Progress
- **Description:** No recorded design decisions or diagram. **Partly addressed by this programme** (`ARCHITECTURE_DECISIONS.md`).
- **Recommended solution:** Maintain ADRs (started); add a component/data-flow diagram.
- **Files affected:** `docs/project-management/ARCHITECTURE_DECISIONS.md`, new diagram.
- **Dependencies:** Ongoing.

### DOC-05 — No onboarding doc
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** Only AI-oriented CLAUDE.md.
- **Recommended solution:** `CONTRIBUTING.md` / onboarding section in README.
- **Files affected:** new `CONTRIBUTING.md`.

### DOC-06 — Undocumented non-obvious math
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** FOV cone / `pano_hfov` / sensor-width assumptions unexplained (`PhotoMap.jsx:24-77`).
- **Recommended solution:** Doc comments + a short `docs/geo-math.md`.
- **Files affected:** `PhotoMap.jsx`, new doc.

---

## MISSING PRODUCTION FEATURES

> Tracked so nothing is forgotten; several are satisfied by remediation items above.

### FEAT-01 — Pagination — satisfied by PERF-01. P2 · M · Not Started.
### FEAT-02 — Server-side search — P3 · M · Not Started. Depends on PERF-01 + tags normalization (currently JSON TEXT, `db.js:69`).
### FEAT-03 — Backups & data export/import — partly OPS-03 (backups) + GeoJSON/KML export exists; add full import/restore. P2 · M · Not Started.
### FEAT-04 — Rate limiting — satisfied by SEC-07. P0 · S · Not Started.
### FEAT-05 — Audit logging — P3 · M · Not Started. Needs auth (SEC-01) + logging (CQ-05).
### FEAT-06 — GDPR/privacy controls for location data — P3 · M · Deferred (product/legal input needed). Deferral justification: requires product policy decisions beyond code.
### FEAT-07 — Account-level soft-delete / undo — P3 · M · Not Started. Needs schema `deleted_at` + migration (ARCH-03).
### FEAT-08 — Virus/content scanning on upload — P3 · M · Not Started. Extends SEC-06.
### FEAT-09 — Object storage / CDN for images — P3 · L · Not Started. Only if ADR-0003 → PaaS; otherwise superseded by OPS-03 volume strategy.

---

## Completed log

> Absorbed from CHANGELOG.md under the 4-doc consolidation (ADR-0005). Records
> completed items and structural changes, newest first. Backlog IDs in brackets.

- **2026-07-02 (Session 002)** — Consolidated PM docs 7 → 4 (ADR-0005 accepted):
  merged PROGRESS.md + CHANGELOG.md into this file; merged DEPENDENCIES.md into
  ROADMAP.md; removed the three merged files. Marked ADR-0002/0003 Accepted.
  Started **TEST-01** (→ In Progress).
- **2026-07-02 (Session 001)** — Created `docs/project-management/`; imported all
  71 findings from the deep-dive review with full metadata [DOC-04, ADR-0001].

## File history
- 2026-07-02 — Session 001: created as MASTER_BACKLOG.md; imported 71 findings.
- 2026-07-02 — Session 002: renamed to BACKLOG.md; absorbed status + changelog.
