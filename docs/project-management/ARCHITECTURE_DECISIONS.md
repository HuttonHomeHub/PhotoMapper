# Architecture Decision Records — PhotoMapper

> Append-only log of significant decisions. Each ADR: Context · Problem · Options ·
> Decision · Advantages · Disadvantages · Future implications. Status one of:
> Proposed · Accepted · Superseded · Deprecated. **Decisions made without direct
> user confirmation are marked `Accepted (provisional)` and are revisable in one line.**

---

## ADR-0001 — Repository-based remediation programme with living PM docs

- **Status:** Accepted · **Date:** 2026-07-02 · **Session:** 001
- **Context:** A deep-dive review produced ~71 findings. Work will span many sessions in an ephemeral environment; conversation history is not a reliable store.
- **Problem:** Track every finding to completion without losing state between sessions.
- **Options considered:**
  1. Track in conversation/memory — rejected: lost on reset.
  2. GitHub Issues — viable, but not self-contained in the repo and heavier to script.
  3. In-repo Markdown PM docs — chosen.
- **Decision:** Maintain `docs/project-management/` as the authoritative source of truth (backlog, roadmap, dependencies, ADRs, changelog, progress, session log), committed to the working branch.
- **Advantages:** Self-contained, versioned, diffable, survives environment resets, reviewable in PRs.
- **Disadvantages:** Manual discipline to keep in sync; risk of doc drift.
- **Future implications:** Could later mirror the backlog into GitHub Issues if a human team joins.

## ADR-0002 — Single-operator / internal deployment

- **Status:** Accepted (confirmed by user, Session 002) · **Date:** 2026-07-02 · **Session:** 001
- **Context:** The review's top finding is "no auth/tenancy". The correct fix depends on the user model, which could not be confirmed (clarifying question failed to deliver). Evidence: local SQLite, single operator, "clients/projects" are _data entities_ (a contractor's customers), personal email, no user table.
- **Problem:** Do we build multi-tenant auth (weeks) or a simple gate (hours)?
- **Options considered:**
  1. Single-operator + shared-secret/session gate — chosen.
  2. Small trusted multi-user (login, no hard isolation).
  3. Full multi-tenant SaaS (tenant_id everywhere).
- **Decision:** Treat the app as a single-operator internal tool. SEC-01 becomes a shared-secret/session gate. Multi-tenancy (ARCH-07) and per-tenant features are Deferred. **The auth middleware will be designed so a per-user/tenant model can be introduced later without rearchitecting.**
- **Advantages:** Realistic scope; unblocks Phase 2 immediately; avoids speculative multi-tenant work (YAGNI).
- **Disadvantages:** If the product is actually multi-tenant, SEC-01 re-scopes to L and ARCH-07 activates.
- **Future implications:** Revisit trigger — user states multiple untrusted customers. Backlog/roadmap already carry the dormant ARCH-07/FEAT-05 items so nothing is lost on revision.

## ADR-0003 — Target a single VPS/container host with persistent disk

- **Status:** Accepted (confirmed by user, Session 002) · **Date:** 2026-07-02 · **Session:** 001
- **Context:** Persistence, Docker, and object-storage findings depend on where the app runs; the target was not confirmed.
- **Problem:** Keep SQLite + local uploads, or move to managed DB + object storage?
- **Options considered:**
  1. Single VPS/container + persistent volume — chosen.
  2. PaaS with ephemeral FS (forces object storage + managed DB).
  3. Dev-only for now (defer infra).
- **Decision:** Assume a single host with a persistent volume. Retain SQLite and local uploads; add Docker (OPS-02), a persistent volume, and backups (OPS-03). FEAT-09 (object storage) stays Deferred unless the target becomes PaaS.
- **Advantages:** Lowest-change path; SQLite stays viable; simple backups.
- **Disadvantages:** Single-host scaling ceiling; not horizontally scalable.
- **Future implications:** Revisit trigger — deploy to PaaS/serverless or need for horizontal scaling → activate FEAT-09 + PERF-04 (Postgres).

## ADR-0004 — Bootstrap testing + CI before security remediation

- **Status:** Accepted · **Date:** 2026-07-02 · **Session:** 001
- **Context:** The programme's quality gates require "tests pass" and "no regressions", but there is no test suite.
- **Problem:** Order testing after fixes (user's suggested Phase 6) or before?
- **Options considered:**
  1. Fixes first, tests later — rejected: every fix would be unverifiable, risking silent regressions in security-critical code.
  2. Minimal test harness + smoke coverage first, deep testing later — chosen.
- **Decision:** Phase 1 delivers a Vitest harness, seed unit tests, and CI wiring (TEST-01/OPS-01). Deep component/E2E testing remains Phase 6.
- **Advantages:** Makes quality gates enforceable; protects the high-risk Phase 2/3 changes.
- **Disadvantages:** Delays the first visible security fix by one short phase.
- **Future implications:** All subsequent "Completed" statuses are backed by tests.

## ADR-0005 — Consolidate PM document set from 7 to 4

- **Status:** Accepted (user approved, Session 002) · **Date:** 2026-07-02 · **Session:** 001→002
- **Context:** The programme brief specified 7 living documents. For a single maintainer across sessions, fewer surfaces mean less drift.
- **Problem:** More documents = more places to fall out of sync.
- **Decision:** Maintain **4** documents:
  1. `BACKLOG.md` — findings + programme status (was PROGRESS) + completed log (was CHANGELOG).
  2. `ROADMAP.md` — phased plan + dependency graph (was DEPENDENCIES).
  3. `ARCHITECTURE_DECISIONS.md` — ADR log.
  4. `SESSION_LOG.md` — per-session narrative.
     `PROGRESS.md`, `CHANGELOG.md`, `DEPENDENCIES.md` removed; content merged.
- **Advantages:** Fewer seams, less drift, faster start-of-session read.
- **Disadvantages:** Larger individual files; deviates from the original 7-doc brief.
- **Future implications:** If a human team joins and needs finer separation, revisit.

## ADR-0006 — Git workflow: commit & push PM docs to the working branch

- **Status:** Accepted (provisional) · **Date:** 2026-07-02 · **Session:** 001
- **Context:** `CLAUDE.md` says "Claude makes file changes only — user handles git." Task-level instructions say develop/commit/push on `claude/engineering-review-production-dwlfup`. The environment is ephemeral (uncommitted work is lost on container reclaim).
- **Problem:** Resolve the contradiction so the programme's state persists.
- **Options considered:**
  1. File edits only, no git — rejected: PM state would not survive the ephemeral environment.
  2. Commit + push docs to the working branch — chosen.
  3. Local commits, no push — rejected: still lost on container reclaim.
- **Decision:** Commit and push PM documentation (and, once greenlit, code changes) to the working branch. Changes are cohesive and commit-sized. **Source-code** changes await user greenlight on scope; docs are committed now to preserve programme state.
- **Advantages:** Programme survives resets; clean history; matches task instructions.
- **Disadvantages:** Deviates from CLAUDE.md's git rule.
- **Future implications:** If the user prefers "file changes only", switch to that and they own pushes. Revisit trigger — user objects.

## ADR-0007 — Authentication handled at the edge (reverse proxy), not in the app

- **Status:** Accepted (user chose, Session 002) · **Date:** 2026-07-02 · **Session:** 002
- **Context:** SEC-01 (no auth). Under the single-operator model (ADR-0002) and single-VPS target (ADR-0003), the operator will front the app with a reverse proxy.
- **Problem:** Where does authentication live — in the app (session cookie / API token) or at the infrastructure edge?
- **Options considered:**
  1. Session cookie + login page (app code).
  2. Shared API token header (app code; awkward for `/uploads` image requests).
  3. **Reverse-proxy / edge auth (nginx basic-auth or an access proxy)** — chosen.
- **Decision:** Authentication and authorization are enforced at the reverse proxy in front of the Node app. The app assumes every request that reaches it is already authenticated. This protects **all** routes uniformly, including `/uploads/*` image URLs, with zero app code.
- **Advantages:** No app auth code to build/maintain; protects static photos automatically; simple for a single operator; TLS terminates at the same proxy (SEC-11).
- **Disadvantages:** No in-app login UX; coarse (single identity); security depends on correct proxy config — so it **must be documented** (`docs/DEPLOYMENT-SECURITY.md`) and is only "done" once that deployment exists.
- **Consequences for the backlog:**
  - **SEC-01** → Deferred-to-infra: closed in-app; delivered by the documented proxy config (tracked under OPS-02 deployment).
  - **SEC-03** (protect `/uploads`) → Deferred-to-infra: the proxy covers it; no app change.
  - **SEC-02** (reset wipe) → still hardened in-app as **defense-in-depth** (edge auth protects the perimeter, but a destructive endpoint should not be trivially reachable even by an authenticated operator's browser via CSRF). Gate behind an explicit env flag.
  - **SEC-04** (CORS) and **SEC-07/09** (rate-limit/headers) remain app-level (defense-in-depth; the proxy may also add some).
- **Future implications:** If the app later needs multiple users / per-user data (ADR-0002 revision → ARCH-07), in-app auth (option 1) would be revisited and this ADR superseded.

## ADR-0008 — Drop the unused `collections` / `photo_collections` tables

- **Status:** Accepted (user chose "drop", Session 002) · **Date:** 2026-07-03 · **Session:** 002
- **Context:** ARCH-04. The baseline schema created `collections` and `photo_collections` (and migrated them for a `project_id` FK), but no route, query, service or UI ever read or wrote them. The projects feature superseded the collections concept.
- **Problem:** Keep the tables for a possible future feature, or remove them?
- **Options considered:**
  1. Keep as-is (carry dead schema forward indefinitely).
  2. **Drop via a forward migration** — chosen.
- **Decision:** Drop both tables in migration **v4 `drop-unused-collections`** (`photo_collections` child first, then `collections`). The applied **v1 baseline is left immutable** per our migration rule — a fresh DB creates then drops them, which is harmless. `resetAll()` no longer references them.
- **Advantages:** Schema matches reality; no confusing dead tables; smaller surface for future contributors to misread.
- **Disadvantages:** A future "collections/albums" feature would re-add a table — cheap (a new migration). The dropped data is not recoverable except from the automatic pre-migration `VACUUM INTO` backup.
- **Consequences:** Surfaced ~230 lines of dead `.collection-*` CSS (no JSX references it) → logged as **CQ-08** for a separate style-only cleanup.
- **Future implications:** If albums/collections return, add a fresh migration; this ADR would be superseded.

## ADR-0009 — Deployment via Docker + docker-compose

- **Status:** Accepted (user chose, Session 002) · **Date:** 2026-07-03 · **Session:** 002
- **Context:** OPS-02. Single-operator (ADR-0002), single-VPS (ADR-0003) target, with auth/TLS at a reverse proxy (ADR-0007).
- **Problem:** How is the app packaged and run on the server — systemd service, containers, or a PaaS?
- **Options considered:**
  1. systemd unit + `npm start` behind the proxy (least tooling).
  2. **Docker + docker-compose** — chosen.
  3. PaaS (Fly/Render/Railway) — rejected; fights the single-VPS/local-SQLite model.
- **Decision:** Ship a multi-stage `Dockerfile` + `docker-compose.yml`. Build stage compiles the Vite frontend and native modules (better-sqlite3, sharp) then prunes dev deps; a slim runtime stage runs as the non-root `node` user. Compose publishes the port on loopback only (proxy fronts it), mounts a named `photomapper-data` volume at `/data` for the DB + uploads, and sets `stop_grace_period` to allow the OPS-05 graceful shutdown to drain.
- **Advantages:** Reproducible builds; host-portable; clean data/volume separation; graceful-shutdown + health-probe wiring is explicit in compose.
- **Disadvantages:** Adds Docker as an operational dependency to maintain/patch vs. a plain systemd service.
- **Consequences:** `UPLOADS_DIR` made env-configurable so DB + uploads share one volume. Image build not yet runtime-verified (sandbox proxy blocks registry pulls) — confirm on a networked host (TEST-04). **OPS-03 backups remain the top open risk** — the volume persists data but is not backed up.
- **Future implications:** If the operator later prefers no-Docker, a systemd unit (option 1) can run the same `node server/index.js` — this ADR would be revisited, not the app.
- **Update (Session 002):** the persistent mount was renamed **`/data` → `/config`** (and the named volume `photomapper-data` → `photomapper-config`) to match the operator's self-hosted stack convention (all their apps use `/apps/<app>/config:/config`). Path is env-driven (`PHOTOS_DB_PATH`/`UPLOADS_DIR`), so this is just a default change.
- **Update (Session 002) — PUID/PGID entrypoint:** a plain non-root image crashed on a root-owned bind mount (`EACCES` creating `/config/uploads`), because the image chown only applies to named volumes. Adopted the linuxserver/hotio pattern: a root `docker-entrypoint.sh` `chown`s `/config` to `PUID:PGID` (default 1000) then drops privileges via **gosu** (preserving PID 1 / SIGTERM for graceful shutdown). Bind mounts now work without a manual chown and honour `PUID`/`PGID`. Startup chown is non-recursive (uploads can be a large library).

---

## ADR-0010 — PERF-01: full server-side pagination + filtering (phased)

- **Status:** Accepted (user chose "C", Session 002) · **Date:** 2026-07-03 · **Session:** 002
- **Context:** `GET /api/photos` returns the entire dataset and the frontend holds it all in memory; filtering, timeline, heatmap, map clustering and sidebar counts all run client-side over the full array. This does not scale.
- **Options considered:** A) slim the payload (column projection + detail-by-id), no paging; B) bbox/viewport loading for the map; **C) full offset/cursor pagination + server-side filtering + aggregate endpoints** — chosen.
- **Decision:** Move filtering, sorting, pagination and aggregate counts into SQL; the frontend stops holding the whole dataset. Because the SPA cannot be runtime-verified in this environment, **execute in back-compatible phases** so no intermediate state is broken:
  - **PERF-01a (server foundation):** parameterized, paginated, filtered `queryPhotos`/`countPhotos` in `db.js`; `GET /api/photos` gains optional `limit/offset` + filter params and returns `{ items, total, limit, offset }` when paginated. With **no params it still returns the legacy array**, so the current frontend keeps working. Fully covered by DB + API tests.
  - **PERF-01b (aggregate/map endpoints):** lightweight map-points (optionally bbox), timeline dates, and facet counts (project/client/survey-date buckets) so the whole-dataset features survive pagination.
  - **PERF-01c (frontend migration):** `usePhotos` + list/map/timeline/filters consume the new endpoints; drop the in-memory full-set assumption. Verified interactively under TEST-04 (staging).
- **Advantages:** Scales to large libraries; correct long-term architecture; phased rollout keeps every step shippable.
- **Disadvantages / risk:** Largest change in the programme; reimplements the client-side filter/timeline/heatmap data path server-side. Polygon (draw-region) filtering isn't expressible in plain SQL — it stays client-side over the bbox-loaded set (or a future spatial extension).
- **Consequences:** Satisfies FEAT-01. Interacts with PERF-06 (bbox marker loading) and ARCH-07 (multi-user). PERF-01 in the backlog is split into 01a/01b/01c so partial completion is tracked honestly.
- **Future implications:** Cursor pagination can replace offset if deep paging becomes hot.
- **Update (Session 002) — pivoted C → A, then declined A's payload-strip as marginal:** After 01a shipped, the owner reconsidered and chose **Option A** (slim payload) over the full C rewrite. Scoping A against the actual schema showed the win is marginal: only 5 fields (`cameraMake`, `cameraModel`, `fNumber`, `iso`, `exposureTime`) are detail-only; the list needs everything else. A JSON row is dominated by repeated key names + filename UUIDs, and responses are **already gzipped** (PERF-08), so stripping those 5 fields is ~10% pre-gzip → ~3–5% on the wire — in exchange for an async detail-load refactor of three components (popup/lightbox/comparison) that can't be runtime-verified here. **Decision:** take only the durable, zero-risk half of A — a `GET /api/photos/:id` detail endpoint — and **decline the payload-strip** as not worth it for this schema/scale. Full pagination (C, 01b/01c) stays **deferred until a measured scale signal** (row count is the real lever, not row width). The 01a query layer remains available for that day.

---

## Pending decisions (need user input; tracked so they are not forgotten)

- **OPS-03** backup destination (S3-compatible / second SSH host / local disk) — needed before the automated backup script can be written. User answered "decide later" Session 002.

_Resolved Session 002: ARCH-04 (drop collections → ADR-0008), OPS-02 (Docker → ADR-0009), DOC-02 (name → PhotoMapper), PERF-01 (server pagination → ADR-0010), OPS-07/edge-auth, etc._

_Resolved Session 002: ADR-0002 (single-operator), ADR-0003 (single VPS),
ADR-0005 (4-doc consolidation) all confirmed by the user._
