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
> Last updated: 2026-07-03 (Session 002)

## Programme status

- **Findings:** 80 (78 baseline + CQ-07 + CQ-08 discovered) · **Completed:** 62 · **In Progress:** 1 (DOC-04 ADRs, living) · **Deferred:** 8 · **Not Started:** 9
  - _(Reconciled Session 002: removed a duplicate BE-06 entry and corrected the headline total — the category counts had always summed to 80; the prior "74" was a stale miscount. See SESSION_LOG.)_
- **Current phase:** Phases 0–4, **6 (testing) & 7 (docs) complete**. Recent: SEC-06 (upload content-decode gate), CQ-02 (named constants), CQ-04 (removed last native dialog). **112 tests.** Remaining: 9 Not Started — SEC-11 (TLS/infra), DEP-01/03 (deps), TEST-04 (E2E, needs staging), and FEAT-03/05/07/08/09 (real features). **Top open risk: OPS-03 (no automated backups) — deferred pending a backup destination.**
- **Auth decision:** ADR-0007 — enforced at the reverse proxy; SEC-01 & SEC-03 handled at infra (see `docs/DEPLOYMENT-SECURITY.md`).

| Phase | Theme | Done / Total | Status |
|---|---|---|---|
| 0 | Programme setup | ✅ | Complete |
| 1 | Verification foundation | 5 / 5 | ✅ Complete |
| 2 | Critical security & reliability | 13 / 13 | ✅ Complete (SEC-01/03 → infra) |
| 3 | Backend architecture & correctness | 10 / 10 | ✅ Complete (BE-02/03/04/06/07, SEC-05, ARCH-01/03, CQ-05/OPS-06) |
| 4 | Frontend architecture & quality | 10 / 10 | ✅ Complete (ARCH-02/06, CQ-01/03/06, SEC-12, FE-02/03/05/06) |
| 5 | Performance | 5 / 6 | PERF-02/03/05/06/07 ✅; PERF-01 ⏸️ deferred (query foundation + detail endpoint done; strip declined, pagination deferred) |
| 6 | Testing depth | 2 / 2 | ✅ TEST-02 (API incl. full upload path) + TEST-03 (component harness); TEST-04 E2E deferred (staging) |
| 7 | Documentation | 5 / 5 | ✅ DOC-01/03/05/06 + DOC-02 (rename); DOC-04 (ADRs) maintained live |
| 8 | DevOps & infra | 6 / 7 | OPS-01/02/04/05/06/07 ✅ (CI, Docker, health, shutdown, logging, config); OPS-03 ⏸️ deferred (backup destination) |

**Quality gates:** build ✅ · lint ✅ (8 pre-existing `src/` warnings, 0 new — PERF-06 cleared one) · tests ✅ 91 passing (`npm test`) · CI runs lint+build+test+audit on `main` and `claude/**` (OPS-01 ✅).

**Top open risks:** (1) tests exist locally but CI does not run them yet → OPS-01 is now the top priority; (2) ARCH-03 migration-runner change is high-risk — must not run before TEST-01/02 + a DB backup step.

**Discovered during Session 002 (triage under noted items):**
- `npm audit` reports **11 vulnerabilities** (1 low, 6 moderate, 2 high, 2 critical) in the dependency tree → triage under **DEP-04 / OPS-01**.
- Lint baseline carries **15 pre-existing warnings** (dead exports, one intentional `exhaustive-deps`) → covered by **CQ-03** and related.

## Legend

- **Severity:** Critical · High · Medium · Low
- **Priority:** P0 (now) · P1 (next) · P2 (soon) · P3 (later) · P4 (someday)
- **Effort:** S (hours) · M (days) · L (weeks)
- **Risk:** risk of the *change itself* causing regressions.
- **Status:** Not Started · Blocked · In Progress · Needs Review · Completed · Deferred

## Status summary

| Status | Count |
|---|---|
| Not Started | 9 |
| Blocked | 0 |
| In Progress | 1 |
| Needs Review | 0 |
| Completed | 62 |
| Deferred | 8 |
| **Total** | **80** |

Category counts: SEC 12 · BE 7 · ARCH 7 · CQ 8 · PERF 8 · FE 6 · TEST 5 · OPS 7 · DEP 5 · DOC 6 · FEAT 9.

---

## SECURITY

### SEC-01 — No authentication or authorization
- **Category:** Security · **Severity:** Critical · **Priority:** P0 · **Effort:** — · **Risk:** — · **Status:** Deferred → handled at infrastructure (ADR-0007)
- **Description:** Every route in `server/index.js` is public. Anyone reaching the host can list, view, upload, edit, and delete all data.
- **Disposition (Session 002):** Per user decision (ADR-0007), authentication is enforced at the **reverse proxy** (nginx/Caddy Basic-auth or an access proxy), not in the app — protecting all routes including `/uploads`. No app code required. The required setup is documented in `docs/DEPLOYMENT-SECURITY.md`. This item is **closed in-app** and delivered by the deployment configuration (tracked under OPS-02).
- **Residual/defense-in-depth kept in-app:** CORS allowlist (SEC-04), rate limiting (SEC-07), security headers (SEC-09), reset gating (SEC-02 ✅).
- **Revisit trigger:** if ADR-0002 is revised to multi-user/multi-tenant, in-app auth (session cookie + login) is reconsidered and ADR-0007 superseded; ARCH-07 activates.

### SEC-02 — Unauthenticated destructive wipe (`DELETE /api/reset`)
- **Category:** Security · **Severity:** Critical · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `DELETE /api/reset` deleted every row in every table and every uploaded file, with no auth. One `curl -X DELETE .../api/reset` destroyed everything.
- **Resolution:** Gated behind an explicit `ALLOW_RESET=true` env flag (default off) → returns **403** otherwise. Defense-in-depth behind the edge auth (ADR-0007): a total-data-loss endpoint should not be trivially reachable even by an authenticated browser (e.g. CSRF). Regression test added (`tests/api.test.js` — 403 by default). Documented in `docs/DEPLOYMENT-SECURITY.md`.
- **Follow-up (minor):** the reset button in `src/App.jsx` doesn't surface the 403 when disabled — log under CQ-04 (error-UX consistency); not security-relevant.
- **Files affected:** `server/index.js`, `tests/api.test.js`, `docs/DEPLOYMENT-SECURITY.md`.

### SEC-03 — Uploaded files served with no authorization
- **Category:** Security · **Severity:** High · **Priority:** P1 · **Effort:** — · **Risk:** — · **Status:** Deferred → handled at infrastructure (ADR-0007)
- **Description:** `app.use('/uploads', express.static(...))` exposes every photo to anyone with the URL. Photos carry GPS/EXIF.
- **Disposition (Session 002):** The reverse-proxy auth (ADR-0007) sits in front of `/uploads/*` too, so image URLs are covered without app changes — this is exactly why edge auth was chosen over an API-token scheme (browsers send the proxy's auth on `<img>` requests automatically). Documented in `docs/DEPLOYMENT-SECURITY.md`. Closed in-app; delivered by deployment config (OPS-02).
- **Revisit trigger:** same as SEC-01 — if per-user authorization is ever needed, `/uploads` must move to an authz-checked streaming route.

### SEC-04 — Wide-open CORS
- **Category:** Security · **Severity:** High · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Removed blanket `app.use(cors())`. CORS is now off by default (the app is same-origin behind the proxy) and only enabled for origins explicitly listed in `ALLOWED_ORIGINS` (via `server/config.js`).
- **Description:** `app.use(cors())` (`server/index.js:19`) allows any origin.
- **Root cause:** Default permissive CORS during dev.
- **Recommended solution:** Restrict to a configured allowlist (env `ALLOWED_ORIGINS`); in single-origin prod, drop CORS entirely.
- **Files affected:** `server/index.js`, env config (OPS-07).
- **Dependencies:** Pairs with SEC-09; benefits from OPS-07.

### SEC-05 — Server-side reverse geocoding: third-party abuse + blocking + DoS
- **Category:** Security · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002, via BE-07)
- **Description:** Every upload synchronously called Nominatim with no timeout, cache, or rate limit — violated Nominatim policy (IP-ban risk), blocked the response, and let attackers proxy load through the server.
- **Resolution:** Delivered by BE-07 — geocoding is now off the request path, cached (`geocode_cache` table keyed by ~111m-rounded lat/lng, survives restarts), rate-limited to ≥1 s between requests via a single serial worker, and given a 5 s fetch timeout. Cached coordinates resolve instantly at upload; uncached ones fill in in the background. Removes the blocking call and the unbounded third-party fan-out.
- **Files affected:** `server/services/geocode.js`, `server/services/geocodeQueue.js`, `server/routes/photos.js`, `server/db.js` (cache table + migration v3).

### SEC-06 — Upload validation trusts client MIME; no content check
- **Category:** Security · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `fileFilter` trusted `file.mimetype`; `sharp` only ran for the (non-fatal) thumbnail, so a non-image (or a script-bearing SVG) renamed `.jpg` was stored.
- **Resolution:** The upload handler now decodes the saved bytes with `sharp(file.path).metadata()` **before** storing anything and accepts only real raster formats (`jpeg`/`png`/`webp`/`heif`); anything else (incl. SVG and spoofed non-images) is unlinked and rejected **400**. Runs before hashing/metadata/thumbnail work. Covered by a test uploading a text buffer as `evil.jpg` → 400, alongside the real-JPEG happy path.
- **Files affected:** `server/routes/photos.js`, `tests/api.test.js`.
- **Dependencies:** Related to FEAT-08 (deeper AV/content scanning, still deferred). Built on ARCH-01.

### SEC-07 — No rate limiting anywhere
- **Category:** Security · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** `express-rate-limit` applied to `/api` (configurable window/max via `config.rateLimit`, default 1000/15min, `RateLimit-*` standard headers; test asserts headers present). Upload cap lowered from 100 MB to a configurable `UPLOAD_MAX_BYTES` (default 60 MB) in step with the documented proxy `client_max_body_size`. Satisfies **FEAT-04**.
- **Description:** No throttling; combined with 100 MB uploads + full-file SHA-256 + sharp on a synchronous DB, a few concurrent requests stall the server.
- **Root cause:** No limiter middleware.
- **Recommended solution:** `express-rate-limit` globally + stricter limit on upload; lower max upload size; cap concurrency.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02. Satisfies FEAT-04.

### SEC-08 — Internal error messages leaked to clients
- **Category:** Security · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Error middleware now masks 5xx `err.message` as a generic "Internal server error" when `NODE_ENV=production`; 4xx client errors keep their message (and detail is preserved in dev/test and always logged server-side).
- **Description:** Error middleware returns `err.message` (`server/index.js:415-419`), leaking SQLite messages/paths.
- **Root cause:** Verbose error passthrough.
- **Recommended solution:** Generic client message in prod; full detail to structured logs (CQ-05).
- **Files affected:** `server/index.js`.
- **Dependencies:** Best done with BE-01 (error handling) and CQ-05 (logging).

### SEC-09 — No security headers (helmet/CSP/nosniff/HSTS)
- **Category:** Security · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** `helmet` added with a CSP tailored to the app: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Leaflet/markercluster inject inline styles), `img-src` allowlisting the four map-tile hosts + `self`/`data:`/`blob:`, `connect-src` allowing Nominatim search; `object-src`/`frame-src` `none`. Dropped `upgrade-insecure-requests` (left to HSTS + proxy redirect so direct HTTP health checks work). Verified: server boots in production mode, CSP header inspected end-to-end, header-presence test added. Full browser E2E deferred to **TEST-04** (the sandbox terminates persistent local servers, so a real-browser smoke test belongs in CI/staging).
- **Note:** helmet's HSTS header is emitted; TLS itself terminates at the proxy (SEC-11).
- **Description:** No `helmet`; missing CSP, `X-Content-Type-Options: nosniff`, HSTS. `nosniff` matters given SEC-06.
- **Recommended solution:** Add `helmet` with a CSP compatible with Leaflet tile hosts and inline map styles.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02.

### SEC-10 — Hash-existence oracle (`check-hash`)
- **Category:** Security · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002, obsoleted by PERF-07)
- **Description:** `GET /api/photos/check-hash` revealed whether any hash exists.
- **Resolution:** The endpoint was removed entirely by PERF-07 (client no longer pre-checks). Also behind the edge-auth perimeter (ADR-0007) regardless.

### SEC-11 — No HTTPS/HSTS enforcement
- **Category:** Security · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** Not Started
- **Description:** No transport security enforcement.
- **Recommended solution:** Terminate TLS at the reverse proxy; set HSTS via helmet (SEC-09); redirect http→https.
- **Files affected:** deployment config (OPS-02), `server/index.js`.
- **Dependencies:** Needs OPS-02 / deploy target.

### SEC-12 — Fragile `innerHTML` map popups (preventive)
- **Category:** Security · **Severity:** Low · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002)
- **Resolution:** Replaced the hand-built `buildPopupHtml` string (and its `escapeHtml` plumbing) with a `PhotoPopup` React component rendered into the Leaflet popup via a `createRoot` mounted on popup `add` and unmounted on `remove`. React escapes every value, so a future added field can't reintroduce stored XSS. 5 component tests, incl. one asserting an XSS payload in the filename renders as text (no injected `<img>`).
- **Files affected:** `src/components/PhotoPopup.jsx` (new), `src/components/PhotoMap.jsx`, `tests/components/PhotoPopup.test.jsx`.
- **Verification note:** `PhotoPopup` is unit-tested; the Leaflet mount/unmount wiring is build-verified but not runtime-tested (the sandbox can't render a live Leaflet map) — added to the **TEST-04** E2E smoke scope for staging.

---

## BACKEND / RELIABILITY

### BE-01 — Express 4 does not catch async errors → hung requests
- **Category:** Backend · **Severity:** Critical · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Imported `express-async-errors` (patches Express 4 so async throws/rejections reach the error middleware). Made the app testable: `server/index.js` now `export { app }` and only binds a port when `NODE_ENV !== 'test'`. Added a `NODE_ENV==='test'`-guarded `/__test/async-error` route and a regression test asserting it returns **500, not a hang** (`tests/api.test.js`). Prod behaviour unchanged; the diagnostic route never exists outside tests.
- **Note:** When DEP-03 (Express 5) is evaluated it may retire the `express-async-errors` shim (Express 5 handles this natively).
- **Description:** Thrown/rejected errors in `async` handlers never reach the error middleware; the client hangs until socket timeout. Exposed in `POST /api/photos` (`server/index.js:179`) and all async routes.
- **Root cause:** Express 4 semantics.
- **Recommended solution:** `import 'express-async-errors'` at entry, or a `wrap()` helper, or migrate to Express 5 (DEP-03). Add a test that asserts a thrown async error returns 500, not a hang.
- **Files affected:** `server/index.js`, DEP-02.
- **Dependencies:** Needs DEP-02. Should land with SEC-08. Verified by TEST-02.

### BE-02 — No request validation layer
- **Category:** Backend · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `server/validation.js` — a `validate(schema)` middleware (400 + field-level `details`, replaces `req.body` with parsed/trimmed data) plus zod schemas for every body-taking JSON route: clients create/update, projects create/update, photo patch, batch update, project photo-assign. Ad-hoc checks in those routes removed (kept 404/409 DB-error handling and the BE-03 presence-based forwarding). 5 new tests cover the validation paths. (POST `/api/photos` is multipart — its body is just `projectId`; left for the ARCH-01 upload-service refactor.)
- **Files affected:** `server/validation.js`, `server/index.js`, `tests/api.test.js`.
- **Dependencies:** Reused the `zod` dep from OPS-07. Superseded the manual validation added in BE-03/BE-04.

### BE-03 — `updateProject` COALESCE can never unset fields
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Rewrote `updateProject` (db.js) to build the `SET` clause only from keys actually present in the change set, so an explicit `clientId: null` now unassigns the client. The route forwards only keys present in `req.body`, validates `name` (non-empty), rejects empty change sets (400), and returns 404 when the project doesn't exist. Removed the dead COALESCE prepared statement. 8 new API tests cover unset/partial/404/400.
- **Description:** `client_id = COALESCE(@clientId, client_id)` (`db.js:305-313`) + JS `clientId ?? null` means a project can never be un-assigned from a client; same trap for name/status/color.
- **Root cause:** COALESCE conflates "not provided" with "set to null".
- **Recommended solution:** Distinguish "absent" from "explicit null" (only build SET clauses for provided keys), or accept a sentinel.
- **Files affected:** `server/db.js`, `server/index.js:392-396`.
- **Dependencies:** Pairs with BE-02.

### BE-04 — `PATCH /api/clients/:id` unvalidated, no 404, unhandled unique error
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Route now validates `name` (non-empty → 400), returns 404 when the client doesn't exist (`updateClient` now returns the change count), and catches the unique-constraint violation → 409. Tests cover 400/404/409.
- **Description:** `server/index.js:359-363` doesn't validate name, returns 200 with `undefined` on missing id, and a duplicate name throws unhandled.
- **Recommended solution:** Validate, 404 on missing, catch unique-constraint → 409.
- **Files affected:** `server/index.js`, `server/db.js`.
- **Dependencies:** Pairs with BE-02, BE-01.

### BE-05 — `check-hash` misuses 404 as a normal signal
- **Category:** Backend · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002, obsoleted by PERF-07)
- **Description:** Returned `404 {duplicate:false}` as an expected (non-error) response.
- **Resolution:** The `check-hash` route was removed by PERF-07, so the status-code misuse no longer exists.

### BE-06 — Route ordering: reset & catch-all after error handler/static
- **Category:** Backend · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `DELETE /api/reset` and `GET *` were registered after `express.static(distDir)` and the error middleware — confusing and bug-prone.
- **Resolution:** Fixed as part of ARCH-01. In `server/app.js` the order is now: API routers → `/api/reset` → `/uploads` static → dist static → SPA catch-all → **error handler last**, so errors from the reset/SPA routes now reach the handler (previously it sat before them).
- **Files affected:** `server/app.js`.
- **Dependencies:** Resolved by ARCH-01.

### BE-07 — No background job / queue (for geocoding, thumbnails)
- **Category:** Backend · **Severity:** Medium · **Priority:** P1 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002)
- **Description:** Expensive/external work ran inline in the upload request.
- **Resolution:** Added `server/services/geocodeQueue.js` — a single serial, rate-limited (≥1.1 s spacing) background worker that resolves + caches reverse-geocodes and writes the label back onto the photo, so the upload response no longer waits on Nominatim. Cache hits still resolve synchronously at upload. Tests cover the cache + cache-hit queue path (no network). Implements **SEC-05**.
- **Files affected:** `server/services/geocodeQueue.js` (new), `server/services/geocode.js`, `server/routes/photos.js`, `server/db.js`, `tests/geocode.test.js`.
- **Note:** Thumbnails remain inline (fast, local, `sharp`); only the external geocode was moved off-path. FE-05 can now proxy the client location-search through the server geocode cache if desired.

---

## ARCHITECTURE

### ARCH-01 — `server/index.js` god-file; no layering
- **Category:** Architecture · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002)
- **Resolution:** Split the ~470-line `server/index.js` into layers: `server/paths.js` (shared dirs), `server/services/` (`hash`, `exif`, `geocode`, `thumbnail`, `exportPhotos`), `server/routes/` (`photos`, `clients`, `projects` Express routers), and `server/app.js` (`createApp()` — middleware, router mounting, static/SPA, error handler). `server/index.js` is now a ~10-line entry point (import app, listen). Behavior identical — all 41 tests pass unchanged. `db.js` already acts as the repository layer. Verified by the full API suite (TEST-02).
- **Files affected:** `server/index.js`, `server/app.js` (new), `server/paths.js` (new), `server/services/*` (5 new), `server/routes/*` (3 new).
- **Follow-on unblocked:** multipart-upload validation (BE-02 tail), BE-07/SEC-05 (geocoding is now an isolated `services/geocode.js`), CQ-05 logging.

### ARCH-02 — `App.jsx` god component (866 lines, ~30 useState)
- **Category:** Architecture · **Severity:** High · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002)
- **Description:** All filtering, timeline, location search, reset, and layout in one component.
- **Outcome:** App.jsx **866 → 647 lines**. Extracted the logic clusters into focused, individually-tested units: `LocationSearch`, `TimelinePanel` + `useTimeline` hook, `FilterChips`, and the pure `filterPhotos`/`geo` libs (memoized). The remaining ~647 lines are largely presentational JSX (sidebar sections, map panel, modals, brand SVG); the `~30 useState` tangle of *logic* is resolved. A `useReducer` for filter state was evaluated and deemed unnecessary — the remaining state is straightforward. Further JSX extraction (SidebarSections) is low-value and not pursued.
- **Progress:** Extracting App.jsx piece by piece, each verified by component tests (App.jsx **866 → 706 lines** so far):
  - ✅ **`LocationSearch`** — owns query/results/error state, `onFlyTo` callback (−5 useState/−1 ref/−2 handlers). Tests: single-result fly-to, multi-result list, no-result error.
  - ✅ **Timeline** → **`useTimeline` hook** (state + sort + auto-advance effects) + **`TimelinePanel`** UI (−4 useState/−1 memo/−2 effects/−3 derived from App.jsx). Tests: panel render + hook sort/slice.
  - ✅ **Filter logic** → pure `src/lib/filterPhotos.js` + `src/lib/geo.js` (`pointInPolygon`), memoized in App.jsx (App.jsx 706→674; delivers **PERF-05** and part of **CQ-01**). 9 pure-function tests.
  - ✅ **`FilterChips`** — active-filters chip row extracted (App.jsx 674→647); also DRY'd the duplicated clear-all logic into one `clearAllFilters` (used by the chips + PhotoList). 4 component tests.
  - Remaining (optional): consolidate filter state via `useReducer` — the god-component symptom is largely resolved (App.jsx 866→647, four focused components + two hooks + two libs extracted).
- **Recommended solution:** Continue extracting `FilterChips`, `SidebarSections`; optionally consolidate filter state via `useReducer` or context.
- **Files affected:** `src/App.jsx`, `src/components/LocationSearch.jsx` + `TimelinePanel.jsx` (new), `src/hooks/useTimeline.js` (new), `tests/components/`.
- **Dependencies:** Do before PERF-05 (memoization) to avoid double work.

### ARCH-03 — Migration system: try/catch, swallows all errors, no versioning
- **Category:** Architecture · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** High · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `server/migrate.js` — a `runMigrations(db, migrations)` runner that records applied versions in a `schema_migrations` table, takes a consistent `VACUUM INTO` **backup before mutating a DB that already holds data**, and **fails loudly** (a throwing migration propagates and is not recorded). The historical schema evolution is preserved verbatim as a recorded baseline migration (v1); the error-swallowing `try { ALTER } catch {}` blocks were replaced with an idempotent `addColumnIfMissing` helper and `CREATE … IF NOT EXISTS`, so genuine errors now surface. Future schema changes (e.g. PERF-03 indexes) become clean version-2+ entries.
- **Verification:** New `tests/migrate.test.js` — runner applies-once/idempotent, loud-failure-not-recorded, and a **legacy upgrade path** test (seeds a pre-runner "v0" DB with a row, imports db.js, asserts the row survives, new columns are added, `survey_date` is back-filled, and a backup file is written). Fresh-schema path covered by the existing `db.test.js`. Suite 40 tests; all gates green.
- **Files affected:** `server/migrate.js` (new), `server/db.js`, `tests/migrate.test.js`, `.gitignore` (backup files).
- **Follow-on:** PERF-03 (indexes) now lands as a version-2 migration; ARCH-04 (drop dead tables) similarly.

### ARCH-04 — Dead schema (`collections`, `photo_collections`)
- **Category:** Architecture · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Tables created/migrated (`db.js:76-112`) but unused by any route/UI.
- **Decision:** Remove (confirmed by product owner, Session 002) — superseded by projects; no route, query or UI ever read/wrote them.
- **Resolution:** Added migration **v4 `drop-unused-collections`** dropping `photo_collections` (child) then `collections`; their indexes drop with the tables. The applied v1 baseline is left immutable per our own migration rule (fresh DBs create-then-drop, which is safe). Cleaned the two dead `DELETE`s from `resetAll()`. Migration test asserts both tables are absent after the chain runs.
- **Files affected:** `server/db.js`, `tests/migrate.test.js`.
- **Follow-up:** ~230 lines of dead `.collection-*` CSS in `src/styles/index.css` (no JSX references it) — logged as **CQ-08** for a separate style-only cleanup.
- **Dependencies:** Needed ARCH-03 (migration runner) ✅. Product decision ✅.

### ARCH-05 — No shared type layer / no TypeScript
- **Category:** Architecture · **Severity:** Medium · **Priority:** P4 · **Effort:** L · **Risk:** Medium · **Status:** Deferred
- **Description:** Hand-written camelCase↔snake_case mappers duplicated; no compile-time safety.
- **Recommended solution:** Migrate to TypeScript incrementally (shared `types/` for the Photo/Project/Client DTOs first, then server, then client).
- **Files affected:** repo-wide.
- **Dependencies:** Large; deferred until architecture stabilises. Reduces future CQ/BE defects.
- **Deferral justification:** High effort, not blocking; best done after ARCH-01/02 so types describe stable modules.

### ARCH-06 — `usePhotos` kitchen-sink hook (25 returns); prop drilling
- **Category:** Architecture · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Split the 25-return hook into three focused hooks — `usePhotos` (photos + photo ops), `useClients`, `useProjects({ onPhotosChanged })`. App composes them; project mutations that change photos (delete/assign) notify photos via the `onPhotosChanged` callback, preserving the old cross-refresh behavior. 3 hook tests (mount load, create/append, delete + cross-notify). As a side effect this cleared the 6 dead-destructure lint warnings → **CQ-03**.
- **Files affected:** `src/hooks/usePhotos.js`, `src/hooks/useClients.js` (new), `src/hooks/useProjects.js` (new), `src/App.jsx`, `tests/hooks/dataHooks.test.jsx`.
- **Note:** Prop-drilling into ClientPanel remains (a context could cut it further); judged low-value now that the hook-god-object is gone.

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
- **Category:** Code Quality · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** `src/lib/geo.js` (`pointInPolygon`) and `src/lib/format.js` (`formatDate`, deduped from PhotoLightbox/PhotoComparison/PhotoMap) with tests. Server `escapeHtml`/KML `esc` were consolidated into `services/exportPhotos.js` under ARCH-01.
- **Files affected:** `src/lib/geo.js`, `src/lib/format.js`, `PhotoLightbox.jsx`, `PhotoComparison.jsx`, `PhotoMap.jsx`.
- **Note:** The `geoPhotos` filter/sort duplication (App/PhotoMap/ElevationProfile) is a minor remaining micro-dedup, left as optional cleanup (each site has slightly different needs).

### CQ-02 — Magic numbers
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Upload cap, FOV sensor half-width (18), ground radius (40), cluster thresholds, thumbnail size, etc., unnamed.
- **Resolution:** Named the FOV constants in `PhotoMap.jsx` (`SENSOR_HALF_WIDTH_MM`, `DEFAULT_HFOV_RAD`, `FOV_GROUND_RADIUS_M`, `PANO_FULL_CIRCLE_DEG`, `ACCENT`) and the cluster-size buckets (`CLUSTER_SIZE_BREAKS`, replacing the if/else ladder), and the thumbnail params (`THUMB_SIZE_PX`, `THUMB_JPEG_QUALITY`) in `thumbnail.js`. The upload cap was already named (`config.uploadMaxBytes`, SEC-07).
- **Files affected:** `src/components/PhotoMap.jsx`, `server/services/thumbnail.js`.

### CQ-03 — Dead code exports in `usePhotos`
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002, via ARCH-06)
- **Resolution:** The ARCH-06 hook split removed the 6 unused destructures from App.jsx (`refresh`(now used)/`updatePhotoSurveyDate`/`updatePhotoProject`/`createClient`/`createProject`/`assignToProject`) — App now destructures only what it uses; the operations remain available on their respective hooks' APIs. Lint no-unused warnings dropped 15 → 9.

### CQ-04 — Inconsistent error UX (toast/alert/confirm/silent)
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Mix of `toast()`, native `window.confirm`, and silent catches. After the SEC-12/FE-04 refactors the only native dialog left was the delete `window.confirm` in `PhotoPopup`.
- **Resolution:** Replaced that `window.confirm` with an **inline two-step confirm** (Delete → Confirm delete / Cancel) inside the popup — the app's `ConfirmModal` can't render into the Leaflet popup's isolated React root, so an inline confirm is the correct pattern there. No native dialogs remain in `src/`. 2 component tests (confirm + cancel paths) replace the old `window.confirm` mocks.
- **Files affected:** `src/components/PhotoPopup.jsx`, `tests/components/PhotoPopup.test.jsx`.
- **Dependencies:** Followed FE-04 (ConfirmModal) + SEC-12 (popup componentization).

### CQ-05 — No logging strategy
- **Category:** Code Quality · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `server/logger.js` (a `pino` instance; level from `config.logLevel`, forced `silent` under test). Replaced the ad-hoc `console.*` calls (error handler, file-delete failures, startup) with structured logging. (The only remaining `console.error` is the pre-logger config-validation fatal in `config.js`, which must run before the logger exists.)
- **Files affected:** `server/logger.js` (new), `server/app.js`, `server/index.js`, `server/routes/photos.js`, `server/config.js` (LOG_LEVEL).

### CQ-06 — Toast module-level singleton anti-pattern
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Replaced the module-global `_addToast` (assigned during render) with a proper `ToastProvider` context. `useToast()` reads from context (safe no-op outside a provider); the viewport renders inside the provider. `main.jsx` wraps `<App/>` in `<ToastProvider>`; removed the old `<ToastContainer/>`. 2 component tests (raise+dismiss; no-op-outside-provider).
- **Files affected:** `src/components/Toast.jsx`, `src/main.jsx`, `src/App.jsx`, `tests/components/Toast.test.jsx`.

### CQ-07 — Code doesn't conform to its own `.prettierrc` — *discovered Session 002*
- **Category:** Code Quality · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `.prettierrc` declares `semi: true`, but `src/` was hand-written without semicolons — the `format` script was never enforced and eslint has no `semi` rule.
- **Resolution:** Ran `npm run format` across the tree (26 `src/` files normalized to semicolons + Prettier style, plus a few `server/` files that had drifted). Deliberately done now — after Phase 4 feature work — as a dedicated formatting-only change so it didn't collide with logic diffs. Added a `format:check` script + a **CI Format-check step** so it can't drift again. Vendored `src/lib/heatmap-patched.js` added to `.prettierignore`. Build/lint/tests green; `format:check` passes. Updated the src/ no-semi notes in CONTRIBUTING/SESSION_LOG.
- **Files affected:** `src/**`, `server/*` (drift), `.prettierignore`, `package.json`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `docs/project-management/SESSION_LOG.md`.
- **Dependencies:** Independent; done as its own formatting-only commit.

### CQ-08 — Dead `.collection-*` CSS — *discovered Session 002 (ARCH-04 follow-up)*
- **Category:** Code Quality · **Severity:** Low · **Priority:** P4 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** ~230 lines of `.collection-*` styles in `src/styles/index.css` for a collections-panel UI that no longer exists. No JSX references these classes. Surfaced when ARCH-04 dropped the backing tables.
- **Resolution:** Removed the entire Collection Panel block and the two `.collection-*` selectors in the mobile touch-target group. 0 `.collection-` references remain; CSS bundle 87.9 → 84.3 kB. Build/tests green.
- **Files affected:** `src/styles/index.css`.
- **Dependencies:** None.

---

## PERFORMANCE

### PERF-01 — `GET /api/photos` unpaginated, all rows/cols
- **Category:** Performance · **Severity:** High · **Priority:** P2 · **Effort:** L · **Risk:** Medium · **Status:** ⏸️ Deferred (foundation + detail endpoint done; remainder deferred pending a scale signal)
- **Description:** Returns the entire dataset; the frontend holds it all in memory (filter/timeline/heatmap/counts client-side).
- **Decision history (ADR-0010):** Owner first chose **C** (full server-side pagination), then **pivoted to A** (slim payload). Scoping A showed the strip is marginal for this schema (only 5 detail-only fields; rows dominated by repeated keys + filename UUIDs; responses already gzipped → ~3–5% wire saving) at the cost of an unverifiable 3-component async refactor. **Final call: take the zero-risk half of A (detail endpoint), decline the payload-strip, defer full pagination (C) until row count is a measured problem.**
- **Done ✅ (Session 002):**
  - **01a — server query foundation:** `queryPhotos`/`countPhotos` in `db.js` (shared WHERE builder — `projectId`/`clientId`/`surveyDate` incl. unassigned, `tag` via json1, `search`, `hasGps`, `from`/`to`, `bbox` + `LIMIT/OFFSET`). `GET /api/photos` returns `{ items, total, limit, offset }` when paginated, else the legacy array. Page size capped at 500.
  - **A/detail — `GET /api/photos/:id`:** full-EXIF single-photo resource (404 on miss), declared after `/export`. Documented in `docs/API.md`. 8 photo-API tests (filters, pagination, shape, detail 404, export-not-shadowed) + DB filter tests.
- **Declined:** payload-strip of `cameraMake/cameraModel/fNumber/iso/exposureTime` — marginal post-gzip; not worth the unverifiable UI refactor.
- **Deferred:** **01b** (aggregate/map endpoints) + **01c** (frontend migration off the in-memory full-set model). Resume trigger: a measured scale problem (large libraries / multi-user, ARCH-07). The 01a query layer is ready for that day.
- **Files affected:** `server/db.js`, `server/routes/photos.js`, `tests/db.test.js`, `tests/api.test.js`, `docs/API.md`.
- **Dependencies:** Satisfies FEAT-01 (partially). Interacts with PERF-06, ARCH-07.

### PERF-02 — Read-after-write full scans
- **Category:** Performance · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Every `PATCH /api/photos/:id` calls `getAllPhotos().find`; the projects and clients PATCH routes had the same `getAllX().find` full-scan read-after-write.
- **Resolution:** Added indexed by-id DTO getters — `getPhotoFullById` (`SELECT * WHERE id=?`), `getProjectById` and `getClientById` (single-row variants of the list aggregates, `WHERE id=?`). The three PATCH routes now return only the affected row. Extracted shared `mapPhotoRow`/`mapProjectRow`/`mapClientRow` mappers so list/by-hash/by-id readers can't drift (removed 3 duplicated inline mappings). `getPhotoByHash` now also carries `projectId` (superset, backward-compatible).
- **Note on batch:** `PATCH /api/photos/batch` still reads all photos to merge tags across the id set — that's inherently multi-row and returns a count, not rows, so it's out of scope here (revisit under PERF-01 pagination if needed).
- **Files affected:** `server/db.js`, `server/routes/{photos,projects,clients}.js`, `tests/db.test.js` (3 new getter tests).
- **Dependencies:** Pairs with PERF-03 ✅ (uses `idx_photos_project_id` etc. for the aggregates).

### PERF-03 — Missing DB indexes
- **Category:** Performance · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added a version-2 migration (`performance-indexes`) via the ARCH-03 runner creating `idx_photos_project_id`, `idx_photos_uploaded_at`, `idx_photos_survey_date` — the columns joined/ordered/filtered on (`getAllProjects` join+group, the `ORDER BY uploaded_at` list, survey-date filtering). Existing DBs pick these up on next boot (with a backup). Test asserts the indexes exist.
- **Files affected:** `server/db.js` (migration v2), `tests/db.test.js`.
- **Note:** First real exercise of the ARCH-03 runner for a new (version-2) migration — validates the framework end-to-end.

### PERF-04 — Synchronous better-sqlite3 blocks event loop
- **Category:** Performance · **Severity:** Low · **Priority:** P4 · **Effort:** M · **Risk:** Medium · **Status:** Deferred
- **Description:** Every query blocks; scaling ceiling under concurrency.
- **Recommended solution:** Acceptable for single-operator; revisit only if concurrency grows (worker thread or Postgres).
- **Dependencies:** Tied to deploy scale (ADR-0003).
- **Deferral justification:** Not a problem at current scale; premature to optimize (per programme rules).

### PERF-05 — Frontend filter chain unmemoized; O(n·m) `projects.find`
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Extracted the filter chain to a pure `filterPhotos()` (ARCH-02/CQ-01) and wrapped its call in `useMemo` keyed on the photos + filter inputs, so it no longer recomputes on every unrelated render (hover, drawer toggles, etc.). Covered by `tests/lib/filterPhotos.test.js`.
- **Files affected:** `src/App.jsx`, `src/lib/filterPhotos.js`.
- **Note:** The `projects.find` inside the client filter now runs only when filter inputs change (not every render); a `projectId→clientId` map is a minor optional micro-opt, not pursued.

### PERF-06 — PhotoMap rebuilds all markers on any change / FOV toggle
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** ✅ Completed (Session 002)
- **Description:** The marker effect keyed on `photoIds`+`fovVisible` cleared the whole cluster group and recreated every marker/popup/FOV on any change — including a mere FOV toggle.
- **Resolution:** Rewrote it as an incremental sync keyed on `[photos]`: diff by id (remove gone, add new) and rebuild an existing marker only when its **visual signature** (`photoMarkerSignature`: lat/lng/direction/thumbnail/focal/panoHFov) changes. FOV visibility now reads a `fovVisibleRef` so toggling it runs only the lightweight FOV effect (no marker rebuild). Popups resolve the latest photo by id at open-time, so editing description/tags no longer churns markers (also fixes a latent stale-popup bug). Extracted `photoMarkerSignature` to a pure `src/lib/markerSig.js` with 3 unit tests. **Bonus:** the `[photos]` dep also cleared the file's `exhaustive-deps` lint warning (baseline 9→8).
- **Verification:** Diff-key logic unit-tested; the Leaflet integration itself can't be runtime-verified in-sandbox (no browser/persistent server — same constraint noted for CSP/TEST-04), but the rewrite is behavior-preserving by construction (same create/add/fit logic, only the churn removed). Confirm interactively under TEST-04.
- **Files affected:** `src/components/PhotoMap.jsx`, new `src/lib/markerSig.js`, `tests/lib/markerSig.test.js`.
- **Dependencies:** Interacts with PERF-01 (bbox loading), SEC-12 (popup rendering — preserved).

### PERF-07 — Client hashes entire file in memory + redundant round-trip
- **Category:** Performance · **Severity:** Medium · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Removed the client-side `hashFile` (whole-file `arrayBuffer` + SHA-256) and the `check-hash` pre-fetch from `DropZone`. Uploads now rely on the server's content-hash dedupe (unique index → 409), which the client already handled. Saves reading the whole file into browser memory and an extra round-trip. Retired the `GET /api/photos/check-hash` route → **obsoletes SEC-10 and BE-05**.
- **Files affected:** `src/components/DropZone.jsx`, `server/routes/photos.js`, `tests/api.test.js`.

### PERF-08 — No response compression
- **Category:** Performance · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `compression` middleware. (The reverse proxy may also compress; harmless overlap.)

---

## FRONTEND / UX / ACCESSIBILITY

### FE-01 — No React error boundary
- **Category:** Frontend · **Severity:** High · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `src/components/ErrorBoundary.jsx` (recoverable fallback with Try-again/Reload, dark-theme styled) wrapping `<App/>` in `main.jsx`. State-logic unit test added; full render test lands with TEST-03's jsdom harness.
- **Files affected:** `src/components/ErrorBoundary.jsx`, `src/main.jsx`, `src/styles/index.css`, `tests/errorBoundary.test.js`.

### FE-02 — Color contrast fails WCAG AA
- **Category:** Frontend/A11y · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `#555` axis labels on the dark elevation chart (~2:1 contrast, fails AA). A codebase scan found no other `#555/#666/#777` text spots.
- **Resolution:** Replaced the three `#555` SVG axis labels with `#9fb0c9` (~7:1 against the `#16213e/#1a1a2e` panel), defined once as `AXIS_LABEL`. Tooltip text was already light (`#e0e0e0`).
- **Files affected:** `src/components/ElevationProfile.jsx`.

### FE-03 — Dual-range date slider a11y
- **Category:** Frontend/A11y · **Severity:** Low · **Priority:** P3 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** The two overlapping date-range inputs had no names, and screen readers announced the raw epoch-ms `value` instead of a date.
- **Resolution:** Gave each thumb an `aria-label` ("Filter start/end date") and an `aria-valuetext` that reads the human date (`dateFrom||minDate`, `dateTo||TODAY`) instead of the ms value. Also added `aria-valuetext={currentDate}` to the timeline scrubber so it announces the date, not the index. Keyboard operation was already native to `input[type=range]`. Test asserts the scrubber's `aria-valuetext`.
- **Files affected:** `src/App.jsx`, `src/components/TimelinePanel.jsx`, `tests/components/TimelinePanel.test.jsx`.
- **Dependencies:** Done post-ARCH-02 (the slider stayed in App; the timeline had already been extracted).

### FE-04 — Client/project delete has no confirmation
- **Category:** Frontend/UX · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Client/project delete buttons now open a `ConfirmModal` (reusing the photo-delete pattern) that names the target and states the cascade ("projects/photos will be unassigned, not deleted" — matching the `ON DELETE SET NULL` FKs). Consistent with photo deletion.
- **Files affected:** `src/components/ClientPanel.jsx`.

### FE-05 — Location search calls Nominatim directly from browser
- **Category:** Frontend · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `LocationSearch.jsx` hit `nominatim.openstreetmap.org` from the client (usage-policy + rate-limit exposure, and it forced a CSP `connect-src` allowance).
- **Resolution:** Added a `searchPlaces()` forward-geocode service (server-side, with the Nominatim `User-Agent`, a 5s timeout, and an in-memory LRU query cache) + a `GET /api/geocode/search?q=` route (400 on empty query, 502 on upstream failure). `LocationSearch` now calls the proxy and consumes `{lat,lon,displayName}`. The per-IP `/api` rate limiter now covers it. **Bonus:** tightened CSP `connect-src` to `'self'` only (browser no longer calls Nominatim). Tests: service mapping/cache/error (3), route 400 (1), component proxy + failure paths (updated + 1 new).
- **Files affected:** `server/services/geocode.js`, new `server/routes/geocode.js`, `server/app.js` (mount + CSP), `src/components/LocationSearch.jsx`, `tests/geocode.test.js`, `tests/api.test.js`, `tests/components/LocationSearch.test.jsx`.
- **Dependencies:** Reused BE-07/SEC-05 service module.

### FE-06 — No loading/empty states for clients/projects
- **Category:** Frontend/UX · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Projects/clients fetch had no loading or error surface — the panel showed "No clients yet" even mid-load, and a failed fetch showed the same, silently.
- **Resolution:** Added `loading`/`error` state to `useClients` and `useProjects` (mirrors `usePhotos`). `ClientPanel` now shows a "Loading…" hint while the first fetch is in flight (kept out of the way during a background refresh so existing data stays visible), an error banner with a **Retry** button on failure, and the "No clients yet" empty hint only once loaded with no error. App wires a combined loading/error + retry (refetches both). Added theme-matched styles. 3 component tests cover the three states.
- **Files affected:** `src/hooks/useClients.js`, `src/hooks/useProjects.js`, `src/components/ClientPanel.jsx`, `src/App.jsx`, `src/styles/index.css`, `tests/components/ClientPanel.test.jsx`.

---

## TESTING

### TEST-01 — No unit test harness (bootstrap)
- **Category:** Testing · **Severity:** Critical (enabler) · **Priority:** P0 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added Vitest + `@vitest/coverage-v8`; `vitest.config.js`; `test`/`test:watch`/`test:coverage` scripts. Made the SQLite path injectable via `PHOTOS_DB_PATH` (one line, testability-only) so tests run against a throwaway DB. Seeded `tests/db.test.js` — 11 passing tests over the data layer (camelCase mapping, boolean `hasGps`, JSON tag round-trip/empty-array fallback, survey-date update, delete counts, client/project joins + counts, `resetAll`). Build ✅, lint ✅ (0 new warnings), `npm test` green.
- **Deliberately deferred (tracked, not forgotten):** unit tests for the inline pure helpers (`pointInPolygon`, `haversineKm`, `escapeHtml`, exposure/KML formatting) were **not** added here because they are unexported and inline in components; testing them cleanly requires the CQ-01 helper extraction. Moved to **CQ-01 (Phase 4)**, where their tests land with the extraction — avoids a premature refactor now (KISS / "no unnecessary refactoring").
- **Description:** No runner, no `test` script, no tests. Quality gates are unenforceable.
- **Recommended solution:** Add Vitest; seed unit tests for pure helpers (`pointInPolygon`, `haversineKm`, FOV math, exposure/date format, `escapeHtml`) and `db.js` against in-memory SQLite; add `test` script.
- **Files affected:** `package.json`, new `tests/`, `vitest.config`.
- **Dependencies:** **Foundational — precedes all risky changes.** Feeds OPS-01.

### TEST-02 — API integration tests
- **Category:** Testing · **Severity:** High · **Priority:** P1 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No route-level tests.
- **Resolution:** `supertest` over the exported `app` with a temp DB **and temp `UPLOADS_DIR`**. Now covers: **full upload path** (a synthetic no-GPS JPEG built with `sharp` → multer → hash → exif → thumbnail → insert → **201**), **dedupe 409** on re-upload of identical bytes, listing, delete, batch validation, all client/project CRUD + 404/409/400s, both **export formats** (GeoJSON + KML content-types), pagination shape + detail 404 + `/export` not shadowed, health/ready, security headers/CSP, rate-limit headers, gated reset 403, geocode 400, and the BE-01 async-error 500. Export serializers + KML XSS-escaping and `hashFile` also get direct unit tests. **Only untested branch:** a GPS-bearing upload (needs an EXIF-embedded fixture) — deferred to TEST-04.
- **Files affected:** `tests/api.test.js`, `tests/exportPhotos.test.js`, `tests/hash.test.js`.
- **Dependencies:** Needed TEST-01 ✅. Verifies SEC/BE/ARCH work.

### TEST-03 — Component tests
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No component tests.
- **Resolution:** jsdom harness established (`@vitejs/plugin-react`, per-file `// @vitest-environment jsdom`, Testing Library + jest-dom) with render/interaction tests for **ErrorBoundary, ClientPanel (loading/empty/error), FilterChips, LocationSearch, PhotoPopup, TimelinePanel, Toast** plus data-hook tests (`dataHooks.test.jsx`) and pure-lib tests (`filterPhotos`, `format`, `markerSig`). Suite grew from ~11 → **109 tests**.
- **Remaining depth (low-priority, folds into TEST-04):** DropZone upload flow, PhotoList filter/sort/select, and Lightbox autosave render tests — the harness + patterns are in place to add them when those components are next touched.
- **Files affected:** `vitest.config.js`, `tests/components/`, `tests/hooks/`, `tests/lib/`.
- **Dependencies:** Grew alongside ARCH-02/06/CQ-01/FE-* work.

### TEST-04 — E2E tests
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** Not Started
- **Description:** No end-to-end coverage.
- **Recommended solution:** Playwright (available in env): upload → pin appears → filter → export.
- **Files affected:** `tests/e2e/`, CI.
- **Dependencies:** Needs TEST-01 + a stable run target.

### TEST-05 — Coverage gates in CI
- **Category:** Testing · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No coverage measurement/threshold.
- **Resolution:** Enabled v8 coverage with a per-file threshold on `server/db.js` (stmts 75 / branch 50 / funcs 65 / lines 75 — just under current 78/52/70/79 to lock in the gain without flakiness). CI `Test` step now runs `npm run test:coverage`, so the threshold gates CI (verified exit 0). Deliberately no global threshold yet — global is ~5% because routes/components are untested; that ratchets up as **TEST-02** (server routes) and **TEST-03** (components) land, at which point per-area thresholds are added.
- **Files affected:** `vitest.config.js`, `.github/workflows/ci.yml`.
- **Dependencies:** Needed TEST-01 + OPS-01 (done). Will be ratcheted by TEST-02/03.

---

## DEVOPS / INFRASTRUCTURE

### OPS-01 — CI runs lint+build only (no tests/audit/typecheck)
- **Category:** DevOps · **Severity:** High · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** `.github/workflows/ci.yml` never runs tests or `npm audit`.
- **Resolution:** Added a `Test` step (`npm test`) and an advisory `Audit dependencies` step (`npm audit --audit-level=high`, `continue-on-error` until DEP-05 clears known vulns). Extended triggers to run on `claude/**` branches (push) so remediation branches get CI, keeping `main` push + PR. Typecheck intentionally omitted (no TypeScript yet — see ARCH-05).
- **Files affected:** `.github/workflows/ci.yml`.
- **Dependencies:** Needed TEST-01 (done). Satisfies DEP-04. Unblocks trustworthy "Completed" going forward.

### OPS-02 — No Dockerfile / container / deploy pipeline
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No container or deploy story.
- **Decision:** Docker + docker-compose (user chose, Session 002 — see ADR-0009).
- **Resolution:** Multi-stage `Dockerfile` (build stage compiles the Vite frontend + native modules with a toolchain, prunes dev deps; slim runtime stage runs as non-root `node`, `HEALTHCHECK` on `/health`, `CMD node server/index.js`). `docker-compose.yml` publishes `127.0.0.1:3001` only (proxy fronts it, ADR-0007), mounts a named `photomapper-config` volume at `/config` (holds DB + uploads; renamed from `/data` to match the operator's stack convention), sets `stop_grace_period: 15s` for the OPS-05 graceful shutdown. `.dockerignore` keeps runtime data/secrets out of the build context. Made `UPLOADS_DIR` env-configurable (`server/paths.js`) so DB + uploads share one volume. Documented in `docs/DEPLOYMENT-SECURITY.md`.
- **Verification:** `docker compose config` validates the schema. **Image build could not be run in this sandbox** — the agent proxy returns 403 for Docker registry blob downloads (`cloudfront.docker.com`), so base images can't be pulled. Dockerfile uses only standard instructions; build ordering (build → prune → copy) and deps (leaflet is dev-only, bundled by Vite) reviewed by hand. Build/run to be confirmed on a networked host (rolls up under TEST-04 staging verification).
- **Files affected:** new `Dockerfile`, `docker-compose.yml`, `.dockerignore`; `server/paths.js`; `docs/DEPLOYMENT-SECURITY.md`.
- **Dependencies:** Gated by ADR-0003 ✅. Precedes SEC-11 (TLS/proxy).

### OPS-03 — No persistence/backup strategy for DB + uploads
- **Category:** DevOps · **Severity:** High · **Priority:** P2 · **Effort:** M · **Risk:** Medium · **Status:** ⏸️ Deferred (Session 002 — awaiting backup destination)
- **Description:** `photos.db` + `uploads/` on local disk; no backups. **Top open production risk.**
- **Partial mitigation (OPS-02):** Both now live on the persistent `/config` Docker volume, and `DEPLOYMENT-SECURITY.md` documents a **manual** off-box backup command + the risk. This does NOT close the item — there is still no *automated, scheduled, off-box* backup or tested restore.
- **Deferral reason:** The scripted target depends on a backup destination the user has not yet chosen (S3-compatible bucket / second SSH host / local disk). Asked Session 002; user answered "decide later." Resume trigger: user picks a destination → deliver `scripts/backup.sh` (SQLite `VACUUM INTO` + uploads sync via cron/restic) + documented restore.
- **Files affected (planned):** new backup script, cron/systemd-timer unit, docs.
- **Dependencies:** Gated by ADR-0003 ✅; blocked on user's backup-destination choice.

### OPS-04 — No monitoring/health/alerting/error tracking
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No `/health`, no error tracking, no metrics.
- **Resolution:** Added `GET /health` (pure liveness — process is up, no state touched) and `GET /ready` (calls `pingDb()` → `SELECT 1`; returns 503 on DB failure) in `server/app.js`, mounted outside `/api` so probes skip the rate limiter and before the routers so they never touch app state. Covered by two `tests/api.test.js` cases. Sentry/metrics/log-shipping deliberately deferred as out-of-scope for the single-VPS model (log shipping is the proxy/host's job; OPS-06 already gives structured logs) — the health endpoints are the actionable core of this item.
- **Files affected:** `server/app.js`, `server/db.js` (`pingDb`), `tests/api.test.js`.
- **Dependencies:** Pairs with CQ-05/OPS-06.

### OPS-05 — No graceful shutdown (SIGTERM)
- **Category:** DevOps · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** No signal handling; in-flight requests dropped on deploy; DB not closed.
- **Resolution:** `server/index.js` now handles SIGTERM/SIGINT: `server.close()` stops accepting new connections and drains in-flight requests, then `closeDb()` flushes/releases the SQLite handle; a 10s `unref`'d timeout force-exits if a connection hangs, and a `shuttingDown` guard makes repeated signals idempotent. Added `closeDb()` to `server/db.js`.
- **Files affected:** `server/index.js`, `server/db.js` (`closeDb`).
- **Dependencies:** Pairs with OPS-02.

### OPS-06 — No structured/request logging
- **Category:** DevOps · **Severity:** Medium · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** `pino-http` mounted in `server/app.js` — logs every request with a generated per-request id and attaches `req.log`; the error handler logs via `req.log`. Silent under test.
- **Files affected:** `server/app.js`, `server/logger.js`.
- **Dependencies:** Done with CQ-05. Feeds OPS-04 (health/metrics) in Phase 8.

### OPS-07 — No environment config management/validation
- **Category:** DevOps · **Severity:** Medium · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `server/config.js` — a single zod-validated config surface (NODE_ENV, PORT, ALLOWED_ORIGINS, ALLOW_RESET, UPLOAD_MAX_BYTES, RATE_LIMIT_*) that fails fast on invalid input. Added `.env.example`. `server/index.js` now reads all runtime config from it (port, reset gate, CORS origins, upload cap, rate limits). Documented in `docs/DEPLOYMENT-SECURITY.md`.
- **Note:** `PHOTOS_DB_PATH` remains read directly in `db.js` (it opens the DB independently for tests); `config.js` covers the HTTP layer. `pino` log-level config will be added with CQ-05.

---

## DEPENDENCIES

### DEP-01 — Unmaintained heatmap libs (heatmap.js 2016, leaflet-heatmap 1.0.0)
- **Category:** Dependencies · **Severity:** Medium · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Vendored patched `heatmap.js`; both libraries stale.
- **Recommended solution:** Evaluate `leaflet.heat`; replace and remove the vendored file.
- **Files affected:** `src/lib/heatmap-patched.js`, `vite.config.js`, `PhotoMap.jsx`, `package.json`.
- **Dependencies:** Needs component test for heatmap behavior.

### DEP-02 — Missing production dependencies
- **Category:** Dependencies · **Severity:** High (enabler) · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** All production deps added incrementally as their consuming fix landed: `express-async-errors` (BE-01), `supertest` (dev, TEST-02), `helmet` (SEC-09), `express-rate-limit` (SEC-07), `compression` (PERF-08), `zod` (OPS-07/BE-02), `pino`/`pino-http` (CQ-05/OPS-06). Session/auth lib intentionally **not** added (auth is at the proxy — ADR-0007). `npm audit` clean throughout.
- **Description:** No `helmet`, `express-rate-limit`, `compression`, `express-async-errors` (or Express 5), session lib, `zod`, `pino`.
- **Recommended solution:** Add the set as Phase 2/3 lands; per CLAUDE.md, dependency additions are recorded here as the "discussion".
- **Files affected:** `package.json`, `package-lock.json`.
- **Dependencies:** Enables SEC-04/07/09, BE-01/02, PERF-08, CQ-05.

### DEP-03 — Express 4 → 5
- **Category:** Dependencies · **Severity:** Low · **Priority:** P3 · **Effort:** M · **Risk:** Medium · **Status:** Not Started
- **Description:** Express 5 natively handles async errors (would subsume BE-01's shim).
- **Recommended solution:** Evaluate migration after tests exist; may replace `express-async-errors`.
- **Files affected:** `server/index.js`, `package.json`.
- **Dependencies:** Needs TEST-02 first. Alternative to BE-01 shim.

### DEP-04 — No `npm audit` in CI
- **Category:** Dependencies · **Severity:** Medium · **Priority:** P0 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Vulnerability status unknown.
- **Resolution:** Added advisory `npm audit --audit-level=high` step to CI (OPS-01). Triage done: 11 vulns, mostly dev/build-time; the actionable production ones (multer, express/qs, uuid) are now tracked as **DEP-05**.
- **Files affected:** `.github/workflows/ci.yml`.
- **Dependencies:** Delivered with OPS-01. Feeds DEP-05.

### DEP-05 — Remediate known-vulnerable dependencies (`npm audit fix`) — *discovered Session 002*
- **Category:** Dependencies · **Severity:** High · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** `npm audit fix` cleared all 11 advisories → **0 vulnerabilities**. All bumps were within existing semver ranges (only `package-lock.json` changed, no `package.json` churn): **multer 2.1.1→2.2.0** (High upload-DoS fixed), **express 4.21.2→4.22.2**, **qs→6.15.3**, **uuid→11.1.1**, plus dev-dep patches. Gates green (build/lint/test 11/11). Flipped the CI audit step from advisory to **blocking** (`--audit-level=high`, no `continue-on-error`).
- **Description:** `npm audit` reports 11 advisories. Production-relevant: **multer 1.0.0–2.1.1** (High — upload DoS, directly related to SEC-07), **express/qs** (Moderate DoS), **uuid <11.1.1** (Moderate — v3/v5/v6 only; we use v4, so not exploitable but should bump). Remainder are dev/build deps (babel, js-yaml, postcss, shell-quote via concurrently, vite).
- **Root cause:** Dependencies drifted behind published security fixes.
- **Recommended solution:** `npm audit fix` (all fixes are semver-compatible per audit); run full gate (build+lint+test) to confirm no regression; then flip the CI audit step from advisory to blocking (remove `continue-on-error`).
- **Files affected:** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- **Dependencies:** Enabled by TEST-01 (verify no regression). Hardens SEC-07. Ratchets OPS-01's audit gate to blocking.
- **Notes:** Kept separate from OPS-01 (CI wiring) per "avoid fixing unrelated issues in one change". Selected as the next task.

---

## DOCUMENTATION

### DOC-01 — No README
- **Category:** Documentation · **Severity:** High · **Priority:** P1 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Resolution:** Added `README.md` — overview, features, tech stack, quick-start + scripts table, configuration table (links `.env.example`), the current (post-ARCH-01) architecture tree, DB/migrations notes, testing, and a production-deployment section linking `docs/DEPLOYMENT-SECURITY.md` (edge-auth) and `docs/project-management/`.
- **Files affected:** `README.md`.
- **Dependencies:** Keep updated as architecture changes. Notes the DOC-02 name consolidation.

### DOC-02 — Name mismatch (fuzzy-guide / PhotoMap / PhotoMapper)
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Package name (`fuzzy-guide`), UI brand ("PhotoMap"), and repo name differed.
- **Decision:** Canonical name is **PhotoMapper** (confirmed by product owner, Session 002).
- **Resolution:** Renamed npm package + lockfile to `photomapper`; UI brand `index.html <title>` and the sidebar `<h1>` to **PhotoMapper**; Nominatim `User-Agent` to `PhotoMapper/1.0`; devcontainer name, `CLAUDE.md`, and the two `.claude/agents/*.md` headers; removed the interim naming note from the README. No `fuzzy-guide` references remain (outside `node_modules`).
- **Files affected:** `package.json`, `package-lock.json`, `index.html`, `src/App.jsx`, `server/services/geocode.js`, `.devcontainer/devcontainer.json`, `CLAUDE.md`, `.claude/agents/{frontend,backend}.md`, `README.md`.

### DOC-03 — No API reference
- **Category:** Documentation · **Severity:** Medium · **Priority:** P2 · **Effort:** M · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Endpoints undocumented.
- **Resolution:** Wrote `docs/API.md` — conventions (JSON/camelCase, error + validation-detail shapes, rate limiting), object shapes (Photo/Project/Client), and every route with params, status codes and errors: photos (upload/list/export/batch/patch/delete), clients, projects (+`/photos` assign), `GET /api/geocode/search`, `/health` + `/ready`, gated `DELETE /api/reset`, and static/`/uploads`. Linked from the README.
- **Files affected:** new `docs/API.md`, `README.md`.
- **Dependencies:** Authored after ARCH-01/BE-02 stabilized routes ✅.

### DOC-04 — No architecture diagram / ADRs
- **Category:** Documentation · **Severity:** Low · **Priority:** P2 · **Effort:** S · **Risk:** Low · **Status:** In Progress
- **Description:** No recorded design decisions or diagram. **Partly addressed by this programme** (`ARCHITECTURE_DECISIONS.md`).
- **Recommended solution:** Maintain ADRs (started); add a component/data-flow diagram.
- **Files affected:** `docs/project-management/ARCHITECTURE_DECISIONS.md`, new diagram.
- **Dependencies:** Ongoing.

### DOC-05 — No onboarding doc
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** Only AI-oriented CLAUDE.md.
- **Resolution:** Added `CONTRIBUTING.md` (human-facing): prerequisites, getting started, project layout, conventions (ES modules, camelCase↔snake_case, hooks-for-API, migrations, validation, palette, the src/ no-semi vs server/ semi style note → CQ-07), testing (jsdom docblock, `tests/` layout), branch/commit/PR expectations + quality gates, and config. Linked from README.
- **Files affected:** new `CONTRIBUTING.md`, `README.md`.

### DOC-06 — Undocumented non-obvious math
- **Category:** Documentation · **Severity:** Low · **Priority:** P3 · **Effort:** S · **Risk:** Low · **Status:** ✅ Completed (Session 002)
- **Description:** FOV cone / `panoHFov` / sensor-width assumptions unexplained.
- **Resolution:** Added `docs/geo-math.md` (FOV inputs, `HFOV = 2·atan((sensorWidth/2)/focalLength)` with the 36mm/35mm-equivalent rationale, the ≥358° full-circle case, 65° fallback, the spherical destination-point arc formula, the fixed 40 m visual radius, and the haversine distance used by the elevation profile). Added explanatory comments in `createFovConePolygon` at each magic number (18 / 65 / 40 / 358). Linked from README.
- **Files affected:** `src/components/PhotoMap.jsx`, new `docs/geo-math.md`, `README.md`.

---

## MISSING PRODUCTION FEATURES

> Tracked so nothing is forgotten; several are satisfied by remediation items above.

### FEAT-01 — Pagination — ✅ Completed (Session 002). Delivered by **PERF-01a**: `GET /api/photos?limit&offset` returns `{ items, total, limit, offset }` (page size capped 500), backed by `queryPhotos`/`countPhotos`. Frontend consumption (01c) deferred with PERF-01 until a scale signal.
### FEAT-02 — Server-side search — ✅ Completed (Session 002, server side). `GET /api/photos?search=` matches original name / location / description **and tags** (json1), plus structured filters (`projectId`/`clientId`/`surveyDate`/`tag`/`hasGps`/date-range/`bbox`) from PERF-01a. Remaining (optional, low-priority): a frontend photo-search box wired to the param — small FE work, folds into any PERF-01c migration.
### FEAT-03 — Backups & data export/import — partly OPS-03 (backups) + GeoJSON/KML export exists; add full import/restore. P2 · M · Not Started.
### FEAT-04 — Rate limiting — ✅ Completed (Session 002). Delivered by **SEC-07**: per-IP `express-rate-limit` on `/api` (configurable window/max, standard `RateLimit-*` headers). Covered by the SEC-09/07 middleware test.
### FEAT-05 — Audit logging — P3 · M · Not Started. Needs auth (SEC-01) + logging (CQ-05).
### FEAT-06 — GDPR/privacy controls for location data — P3 · M · Deferred (product/legal input needed). Deferral justification: requires product policy decisions beyond code.
### FEAT-07 — Account-level soft-delete / undo — P3 · M · Not Started. Needs schema `deleted_at` + migration (ARCH-03).
### FEAT-08 — Virus/content scanning on upload — P3 · M · Not Started. Extends SEC-06.
### FEAT-09 — Object storage / CDN for images — P3 · L · Not Started. Only if ADR-0003 → PaaS; otherwise superseded by OPS-03 volume strategy.

---

## Completed log

> Absorbed from CHANGELOG.md under the 4-doc consolidation (ADR-0005). Records
> completed items and structural changes, newest first. Backlog IDs in brackets.

- **2026-07-03 (Session 002)** — ✅ **SEC-06 + CQ-02 + CQ-04.** SEC-06: upload handler
  now decodes bytes with `sharp` and accepts only real jpeg/png/webp/heif (rejects
  SVG/spoofed non-images, 400) before storing. CQ-02: named the FOV/cluster/thumbnail
  magic numbers. CQ-04: replaced the last native `window.confirm` (PhotoPopup) with an
  inline two-step confirm. **112 tests.** [SEC-06, CQ-02, CQ-04]
- **2026-07-03 (Session 002)** — ✅ **FEAT-01/02/04 + backlog reconciliation.** Closed
  **FEAT-01** (pagination → delivered by PERF-01a) and **FEAT-04** (rate limiting →
  SEC-07) as already-delivered; extended server search to **tags** (json1) so
  **FEAT-02** (server-side search) is complete server-side (+1 test, **110 tests**).
  **Integrity fix:** removed a duplicate BE-06 entry and corrected the headline total
  74 → **80** (category counts had always summed to 80). [FEAT-01, FEAT-02, FEAT-04, BE-06]
- **2026-07-03 (Session 002)** — ✅ **TEST-02 + TEST-03 (Phase 6 complete).** Closed the
  API-integration gap with a **full upload-path test** (synthetic `sharp` JPEG →
  multer→hash→exif→thumbnail→insert→201, dupe→409, list, delete) against a temp
  `UPLOADS_DIR`; added export-format route assertions + direct unit tests for the
  GeoJSON/KML serializers (incl. XSS-escaping) and `hashFile`. Suite **109 tests**.
  TEST-03 component/hook/lib coverage confirmed comprehensive. TEST-04 (E2E) stays
  deferred (needs staging). [TEST-02, TEST-03]
- **2026-07-03 (Session 002)** — ✅ **CQ-07.** Whole-tree Prettier normalization (26 `src/`
  files to semicolons + a few drifted `server/` files) in a dedicated formatting-only
  commit; added `format:check` script + a **CI format gate** so it can't drift again;
  `.prettierignore`d the vendored `heatmap-patched.js`. Build/lint/tests green. [CQ-07]
- **2026-07-03 (Session 002)** — ✅ **DOC-05 (Phase 7 docs complete).** Added human-facing
  `CONTRIBUTING.md` (setup, layout, conventions, testing, branch/commit/PR gates) + README
  link. Docs phase now 5/5. [DOC-05]
- **2026-07-03 (Session 002)** — ⏸️ **PERF-01 resolved to foundation + detail (ADR-0010).**
  Shipped the server query layer (`queryPhotos`/`countPhotos`, filtered + paginated;
  `GET /api/photos` dual shape, back-compat) and a `GET /api/photos/:id` detail
  endpoint. After pivoting C→A, **declined A's payload-strip** as marginal (~3–5%
  post-gzip) vs. an unverifiable 3-component refactor; **deferred** full pagination
  (01b/01c) until a measured scale signal. +3 API tests (detail 404, export-not-shadowed,
  paging shape). Suite **98 tests**. [PERF-01]
- **2026-07-03 (Session 002)** — ✅ **DOC-02 + DOC-06.** DOC-02: canonical name set to
  **PhotoMapper** (user decision) — renamed package/lockfile to `photomapper`, UI title
  + sidebar brand, Nominatim User-Agent, devcontainer, CLAUDE.md, agent docs; no
  `fuzzy-guide` refs left. DOC-06: `docs/geo-math.md` + code comments for the FOV-cone
  math (sensor width, HFOV, spherical arc). [DOC-02, DOC-06]
- **2026-07-03 (Session 002)** — ✅ **DOC-03 + CQ-08.** DOC-03: wrote `docs/API.md`
  (conventions, object shapes, every route with params/status/errors) + README link.
  CQ-08: deleted ~230 lines of dead `.collection-*` CSS (bundle 87.9→84.3 kB, 0 refs
  left). [DOC-03, CQ-08]
- **2026-07-03 (Session 002)** — ✅ **PERF-06.** Rewrote PhotoMap's marker effect as
  an incremental id-diff + visual-signature sync keyed on `[photos]` (was a full
  clear-and-rebuild on every change / FOV toggle). FOV toggle now via a ref (no
  rebuild); popups resolve the latest photo by id (fixes stale-popup bug). New pure
  `markerSig.js` + 3 tests; cleared 1 lint warning. Suite **91 tests**. [PERF-06]
- **2026-07-03 (Session 002)** — ✅ **FE-02 + FE-03 (Phase 4 complete).** FE-02:
  raised the elevation-chart axis labels from `#555` (~2:1) to `#9fb0c9` (~7:1, AA).
  FE-03: `aria-label` + date-valued `aria-valuetext` on the dual date-range thumbs
  and the timeline scrubber (SRs announce dates, not epoch-ms/index). Suite **88 tests**.
  Phase 4 frontend now 10/10. [FE-02, FE-03]
- **2026-07-03 (Session 002)** — ✅ **FE-05.** Proxied the browser's Nominatim
  location search through a new `GET /api/geocode/search` (server `searchPlaces()`
  with User-Agent, timeout, in-memory LRU cache; 400/502 handling). Tightened CSP
  `connect-src` to `'self'`. +5 tests. Suite **88 tests**. [FE-05]
- **2026-07-03 (Session 002)** — ✅ **FE-06.** Added `loading`/`error` to `useClients`
  and `useProjects`; `ClientPanel` now shows a Loading hint, an error banner with
  Retry, and the empty hint only when genuinely loaded-and-empty. 3 component tests.
  Suite **83 tests**. [FE-06]
- **2026-07-03 (Session 002)** — ✅ **PERF-02.** Replaced `getAllX().find()`
  read-after-write full scans in the photos/projects/clients PATCH routes with
  indexed by-id getters (`getPhotoFullById`, `getProjectById`, `getClientById`).
  Extracted shared `mapPhotoRow`/`mapProjectRow`/`mapClientRow` (removed 3 duplicated
  mappings). 3 new getter tests. Suite **80 tests**. [PERF-02]
- **2026-07-03 (Session 002)** — ✅ **OPS-02** (+ ⏸️ OPS-03 deferred). Multi-stage
  `Dockerfile` + `docker-compose.yml` (non-root, `/data` named volume for DB+uploads,
  loopback-only port, `HEALTHCHECK` → `/health`, `stop_grace_period` for graceful
  shutdown) + `.dockerignore`. Made `UPLOADS_DIR` env-configurable. Documented in
  `DEPLOYMENT-SECURITY.md` (ADR-0009). Compose schema validated; image build not
  runtime-verified (sandbox proxy blocks registry pulls). OPS-03 backups deferred
  pending a chosen destination — flagged as the top open production risk. [OPS-02, OPS-03]
- **2026-07-03 (Session 002)** — ✅ **ARCH-04 (+ logs CQ-08).** Dropped the unused
  `collections`/`photo_collections` tables via migration **v4**; cleaned `resetAll()`;
  migration test asserts they're gone. Dead `.collection-*` CSS logged as CQ-08 for a
  separate style-only pass. Suite **78 tests**. [ARCH-04]
- **2026-07-03 (Session 002)** — ✅ **OPS-04 + OPS-05.** Added `GET /health` (liveness)
  and `GET /ready` (DB `SELECT 1` → 503 on failure) outside `/api`; graceful
  SIGTERM/SIGINT shutdown in `index.js` (drain via `server.close`, then `closeDb`,
  10s force-exit guard). New `pingDb`/`closeDb` in `db.js`. 2 probe tests. Suite
  **78 tests**. [OPS-04, OPS-05]
- **2026-07-02 (Session 002)** — ✅ **DOC-01.** Added `README.md` (overview, stack,
  quick-start, config, current architecture tree, testing, deployment link). [DOC-01]
- **2026-07-02 (Session 002)** — ✅ **PERF-07 (+ obsoletes SEC-10, BE-05).** Removed
  client-side file hashing + `check-hash` pre-check from DropZone; rely on the
  server 409 dedupe. Retired the `check-hash` route. Suite **76 tests**. [PERF-07, SEC-10, BE-05]
- **2026-07-02 (Session 002)** — ✅ **ARCH-06 + CQ-03.** Split the 25-return `usePhotos`
  into `usePhotos`/`useClients`/`useProjects` (composed in App; project↔photo
  cross-refresh via `onPhotosChanged`). Cleared the 6 dead-destructure warnings
  (CQ-03; lint 15→9). 3 hook tests. Suite **77 tests**. [ARCH-06, CQ-03]
- **2026-07-02 (Session 002)** — ✅ **SEC-12.** Map popup `innerHTML` string →
  `PhotoPopup` React component rendered via `createRoot` into the Leaflet popup;
  removed `escapeHtml`/`buildPopupHtml`. 5 tests incl. XSS-payload-as-text.
  Suite **74 tests**. [SEC-12]
- **2026-07-02 (Session 002)** — ✅ **CQ-06.** Toast module-global singleton →
  `ToastProvider` context (main.jsx wraps App); `useToast()` reads context. 2
  component tests. Suite **69 tests**. [CQ-06]
- **2026-07-02 (Session 002)** — ✅ **ARCH-02 + CQ-01 complete.** Extracted `FilterChips`
  (App.jsx 674→647) and the shared `formatDate` helper (deduped ×4). App.jsx
  866→647 with 4 components + 2 hooks + 2 libs pulled out, all tested. Suite **67 tests**. [ARCH-02, CQ-01]
- **2026-07-02 (Session 002)** — ✅ **PERF-05** + ARCH-02/CQ-01 cont. Extracted the
  filter chain to pure `src/lib/filterPhotos.js` + `src/lib/geo.js` and memoized it
  in App.jsx (706→674); 9 pure-function tests. Suite **61 tests**. [PERF-05, ARCH-02, CQ-01]
- **2026-07-02 (Session 002)** — ▶ **ARCH-02 cont.** Extracted the Timeline into a
  `useTimeline` hook + `TimelinePanel` component (App.jsx 794→706) with panel +
  hook tests. Suite **52 tests**. [ARCH-02]
- **2026-07-02 (Session 002)** — ▶ **ARCH-02 (started).** Extracted `LocationSearch`
  from App.jsx (866→794 lines; −5 useState/−1 ref/−2 handlers) with 3 component
  tests. First verified slice of the App.jsx decomposition. Suite **49 tests**. [ARCH-02]
- **2026-07-02 (Session 002)** — ▶ **TEST-03 harness (Phase 4 opened).** jsdom +
  `@testing-library/react` + `jest-dom` + react plugin; `tests/components/
  ErrorBoundary.test.jsx` (render + fallback), which also completes FE-01's full
  render coverage. Suite **46 tests**. [TEST-03]

- **2026-07-02 (Session 002)** — ✅ **CQ-05 + OPS-06 + DEP-02 → Phase 3 complete.**
  Structured logging via `pino`/`pino-http` (`server/logger.js`, per-request ids,
  silent under test); `console.*` replaced. DEP-02 closed (all prod deps in,
  audit clean). Backend phase done 10/10. [CQ-05, OPS-06, DEP-02]
- **2026-07-02 (Session 002)** — ✅ **BE-07 + SEC-05.** Reverse-geocoding moved off
  the upload request into a cached (`geocode_cache`, migration v3), rate-limited
  (≥1.1 s), timed-out (5 s) background worker (`services/geocodeQueue.js`); cache
  hits still resolve at upload. Fixes a HIGH third-party-abuse/DoS finding. Suite
  **44 tests**. [BE-07, SEC-05]
- **2026-07-02 (Session 002)** — ✅ **ARCH-01 + BE-06.** Split the ~470-line
  `server/index.js` into `paths` + `services/` (hash, exif, geocode, thumbnail,
  exportPhotos) + `routes/` (photos, clients, projects) + `app.js` (createApp);
  `index.js` is now a ~10-line entry point. Error handler registered last
  (BE-06). Behavior identical — 41 tests unchanged. [ARCH-01, BE-06]
- **2026-07-02 (Session 002)** — ✅ **PERF-03** DB indexes (photos project_id /
  uploaded_at / survey_date) as a version-2 migration through the new runner —
  first real use of the ARCH-03 framework. Suite **41 tests**. [PERF-03]
- **2026-07-02 (Session 002)** — ✅ **ARCH-03** migration framework. `server/migrate.js`
  (version table + `VACUUM INTO` backup + loud failures); legacy schema preserved
  as recorded baseline v1; `try/catch` ALTERs → idempotent `addColumnIfMissing`.
  New `migrate.test.js` incl. legacy-upgrade + backup verification. Normalized
  `server/` to `.prettierrc` (→ logged **CQ-07** for `src/`). Suite **40 tests**. [ARCH-03]
- **2026-07-02 (Session 002)** — ✅ **BE-02** validation layer. `server/validation.js`
  (`validate()` middleware + zod schemas) applied to all JSON body routes; ad-hoc
  checks removed. Suite **37 tests**. [BE-02]
- **2026-07-02 (Session 002)** — ✅ **BE-03 + BE-04** (Phase 3 opened). Fixed the
  `updateProject` COALESCE unset bug (explicit `clientId:null` now unassigns) with
  presence-based dynamic SQL + route validation/404; fixed clients PATCH
  validation/404/409. Suite **32 tests**. [BE-03, BE-04]
- **2026-07-02 (Session 002)** — ✅ **FE-01 + FE-04 → Phase 2 complete.** Added a
  top-level React error boundary (recoverable fallback) and confirmation dialogs
  for client/project deletion. Suite 24 tests. Phase 2: 13/13. [FE-01, FE-04]
- **2026-07-02 (Session 002)** — ✅ **Security-middleware batch** (OPS-07, SEC-04,
  SEC-07, SEC-08, SEC-09, PERF-08). Added `server/config.js` (zod-validated env) +
  `.env.example`; helmet+CSP (tile hosts allowlisted), CORS allowlist (off by
  default), `/api` rate limit, 5xx error masking in prod, gzip compression,
  configurable 60 MB upload cap. Suite 23 tests (headers asserted). CSP verified
  via header inspection + prod boot; browser E2E → TEST-04. [OPS-07, SEC-04, SEC-07, SEC-08, SEC-09, PERF-08]
- **2026-07-02 (Session 002)** — ✅ **SEC-02 Completed** + **ADR-0007** (edge auth):
  gated `DELETE /api/reset` behind `ALLOW_RESET` (403 by default) with a
  regression test; **SEC-01 & SEC-03 dispositioned to infrastructure** and
  documented in `docs/DEPLOYMENT-SECURITY.md`. Suite 21 tests. [SEC-02, SEC-01, SEC-03]
- **2026-07-02 (Session 002)** — ✅ **BE-01 Completed** (Phase 2 opened). Added
  `express-async-errors`; exported `app` + guarded `listen` for tests; seeded the
  `supertest` API suite (`tests/api.test.js`, 9 tests incl. the async-error-500
  regression). Suite now 20 tests. TEST-02 and DEP-02 → In Progress. [BE-01]
- **2026-07-02 (Session 002)** — ✅ **TEST-05 Completed & Phase 1 closed.**
  Coverage thresholds gate `server/db.js` in CI (`test:coverage`). Phase 1
  (verification foundation) complete: 5/5. [TEST-05]
- **2026-07-02 (Session 002)** — ✅ **DEP-05 Completed.** `npm audit fix` →
  0 vulnerabilities (multer 2.2.0, express 4.22.2, qs 6.15.3, uuid 11.1.1).
  CI audit gate flipped to blocking. [DEP-05]
- **2026-07-02 (Session 002)** — ✅ **OPS-01 + DEP-04 Completed.** CI now runs
  `npm test` and an advisory `npm audit`; triggers extended to `claude/**`.
  Triage surfaced production-relevant vulns → logged **DEP-05** (new). [OPS-01, DEP-04]
- **2026-07-02 (Session 002)** — ✅ **TEST-01 Completed.** Added Vitest harness,
  config, npm scripts, injectable `PHOTOS_DB_PATH`, and `tests/db.test.js`
  (11 passing data-layer tests). Build/lint/tests all green. Pure-helper tests
  deferred to CQ-01. [TEST-01]
- **2026-07-02 (Session 002)** — Consolidated PM docs 7 → 4 (ADR-0005 accepted):
  merged PROGRESS.md + CHANGELOG.md into this file; merged DEPENDENCIES.md into
  ROADMAP.md; removed the three merged files. Marked ADR-0002/0003 Accepted.
- **2026-07-02 (Session 001)** — Created `docs/project-management/`; imported all
  71 findings from the deep-dive review with full metadata [DOC-04, ADR-0001].

## File history
- 2026-07-02 — Session 001: created as MASTER_BACKLOG.md; imported 71 findings.
- 2026-07-02 — Session 002: renamed to BACKLOG.md; absorbed status + changelog.
