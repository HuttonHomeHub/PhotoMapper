# Session Log — PhotoMapper Remediation Programme

> Append-only. One entry per working session: what was read, decided, done, and
> what comes next. Newest first.

---

## Session 002 (cont.) — 2026-07-03 — Backlog integrity reconciliation

While closing FEAT items I audited the backlog against ground truth (`grep` of
every `### <ID>` header + status) and found two defects:

1. **Duplicate `BE-06`** — a stale "Not Started" copy in the BACKEND section plus a
   correct "Completed" copy misplaced under ARCHITECTURE. Merged into a single
   Completed entry in the BACKEND section; deleted the duplicate.
2. **Wrong headline total** — the summary said 74 findings, but the category counts
   have always summed to **80** and there are **80 distinct `### ID` headers**. The
   "74" (and its "72 + CQ-07 + CQ-08" derivation) was a stale miscount.

**Reconciled totals (verified by enumeration):** 80 findings — Completed 59,
Not Started 12, In Progress 1 (DOC-04, living ADR log), Deferred 8. These now
match both the distinct-ID count and the per-status enumeration. Lesson: maintain
the summary from an enumeration, not by incrementing by hand.

---

## Session 002 — 2026-07-02 — Consolidation + TEST-01

**Role:** Principal Architect / Tech Lead / Quality Gatekeeper.

### Start-of-session workflow

1. Read BACKLOG / ROADMAP / ADRs / this log.
2. User confirmed: ADR-0002 (single-operator) + ADR-0003 (single VPS) correct;
   green light to modify code; adopt the 4-doc consolidation (ADR-0005).
3. Recalculated priorities → unchanged: TEST-01 is the highest-value task
   (verification foundation) per ADR-0004.

### Decisions

- Marked ADR-0002/0003/0005 Accepted. Executed the doc consolidation.
- **Testability micro-decision:** made the SQLite path injectable via
  `PHOTOS_DB_PATH` rather than refactoring `db.js` to take a constructor arg —
  smallest change that unblocks isolated tests; no behavioural change in prod.
- Held the line on scope: did **not** extract inline pure helpers just to test
  them (that is CQ-01); tested the highest-value reachable surface (data layer).

### Work completed

1. **Doc consolidation 7 → 4** (BACKLOG absorbs PROGRESS+CHANGELOG; ROADMAP
   absorbs DEPENDENCIES). Committed.
2. **TEST-01 Completed:** Vitest + coverage installed; `vitest.config.js`; npm
   scripts; `PHOTOS_DB_PATH`; `tests/db.test.js` with 11 passing tests covering
   the camelCase/snake_case mappers, boolean `hasGps`, JSON tag round-trip and
   empty-array fallback, survey-date update, delete counts, client/project joins
   and counts, and `resetAll`.
3. **OPS-01 + DEP-04 Completed:** CI now runs `npm test` and an advisory
   `npm audit --audit-level=high`; triggers extended to `claude/**` so this and
   future remediation branches get CI. Triaged the 11 audit findings (see below).

### Quality gates (TEST-01)

- `npm run build` ✅ · `npm run lint` ✅ (15 pre-existing warnings, **0 new**) ·
  `npm test` ✅ 11/11. No new security concerns; no perf-sensitive code touched.

### Newly discovered issues

- **`npm audit`: 11 vulnerabilities** (1 low, 6 moderate, 2 high, 2 critical).
  Routed to DEP-04/OPS-01 (do not silently ignore). To be triaged when CI gains
  the audit step.
- Confirmed the 15-warning lint baseline (dead exports etc.) — covered by CQ-03.

### Audit triage (DEP-04)

11 advisories. Dev/build-time (lower urgency): @babel/core, js-yaml, postcss,
shell-quote (via concurrently), vite. **Production-relevant:** multer 1.0.0–2.1.1
(High, upload DoS — ties to SEC-07); express/qs (Moderate DoS); uuid <11.1.1
(Moderate, but affects v3/v5/v6 only — we use v4, so not exploitable). All fixes
are semver-compatible. → logged **DEP-05**.

### Selected next task + rationale

**DEP-05 — apply `npm audit fix`, then make the CI audit gate blocking.**
Why next: the audit step is currently advisory; the production multer DoS is a
real, cheap-to-fix risk that also hardens SEC-07. TEST-01 lets us confirm the
dependency bumps don't regress the data layer. Kept separate from OPS-01 (CI
wiring) to keep changes cohesive.

### Continued in same session — DEP-05, TEST-05, BE-01

- **DEP-05 ✅** `npm audit fix` → 0 vulns (multer 2.2.0 etc.); CI audit gate now blocking.
- **TEST-05 ✅** coverage thresholds on `server/db.js`; CI runs `test:coverage`. **Phase 1 complete (5/5).**
- **BE-01 ✅** `express-async-errors`; `export { app }` + test-guarded `listen`;
  `supertest` API suite seeded (9 tests incl. async-error-500 regression). Suite now **20 tests**.
- DEP-02 + TEST-02 → In Progress (partial).

### End-of-session state

- Phase 0 ✅ · Phase 1 ✅ (5/5) · Phase 2 active (BE-01 ✅, 1/13).
- Suite: 20 tests green. Gates: build ✅, lint ✅ (0 new), coverage ✅, audit ✅ (0 vulns).
- Commits pushed to `claude/engineering-review-production-dwlfup`:
  programme setup, doc consolidation, TEST-01, OPS-01, DEP-05, TEST-05, BE-01.

### Continued — Phase 2 completed in this session

- User chose **edge auth** → **ADR-0007**; SEC-01 & SEC-03 dispositioned to infra
  with `docs/DEPLOYMENT-SECURITY.md`. SEC-02 hardened in-app (reset gated).
- **Security-middleware batch:** OPS-07 (config+zod), SEC-04 (CORS), SEC-07
  (rate-limit + 60 MB cap), SEC-08 (error masking), SEC-09 (helmet+CSP), PERF-08
  (compression). **FE-01** (error boundary) + **FE-04** (delete confirms).
- **CSP verification note:** attempted a real-browser Playwright smoke test, but
  this sandbox terminates persistent local servers (exit 144 whether backgrounded
  via `&` or the tool's background mode; foreground `sleep` is also blocked).
  Verified instead by: prod-mode boot, end-to-end inspection of the emitted CSP
  header, automated header-presence tests, and deterministic directive analysis
  (script-src 'self' → bundle loads; all tile hosts + Nominatim allowlisted). A
  real-browser smoke test is the right home for **TEST-04** (CI/staging).
- **Phase 2 complete: 13/13.** Suite now **24 tests**; build/lint(0-new)/audit(0) green.

### End-of-session state (Session 002 final)

- Phases 0 ✅, 1 ✅ (5/5), 2 ✅ (13/13). Completed 15 · In Progress 2 (DEP-02 tail, TEST-02) · Deferred 6 · Not Started 49.
- Commits pushed: programme setup, doc consolidation, TEST-01, OPS-01, DEP-05,
  TEST-05, BE-01, edge-auth/SEC-02, security-middleware batch, FE-01+FE-04.

### Phase 3 progress (Session 002)

- ✅ **BE-03** `updateProject` unset bug (presence-based dynamic SQL + route
  validation/404). ✅ **BE-04** clients PATCH validation/404/409.
- ✅ **BE-02** validation layer: `server/validation.js` (`validate()` middleware +
  zod schemas) on all JSON body routes; ad-hoc checks removed.
- ✅ **ARCH-03** migration framework: `server/migrate.js` (schema_migrations +
  VACUUM INTO backup + loud failure); legacy schema kept as recorded baseline v1;
  error-swallowing ALTERs → idempotent `addColumnIfMissing`. `migrate.test.js`
  proves fresh, idempotent, loud-failure, and legacy-upgrade+backup paths.
  Normalized `server/` to `.prettierrc` (semis) → logged **CQ-07** for `src/`.
  Suite **40 tests**.

### Phase 3 continued (Session 002)

- ✅ **PERF-03** DB indexes via migration v2 (first real use of the ARCH-03 runner).
- ✅ **ARCH-01 + BE-06.** Split `server/index.js` (~470 lines) → `paths.js`,
  `services/` (hash, exif, geocode, thumbnail, exportPhotos), `routes/` (photos,
  clients, projects), `app.js` (`createApp`); `index.js` now ~10 lines. Error
  handler last (BE-06). Behavior identical, 41 tests unchanged. `server/` split
  into 12 focused modules.

### Phase 3 continued (Session 002)

- ✅ **BE-07 + SEC-05** — reverse-geocoding moved off the upload path into a
  cached (`geocode_cache`, migration v3), rate-limited (≥1.1 s), timed-out (5 s)
  background worker (`services/geocodeQueue.js`); cache hits still resolve at
  upload. `tests/geocode.test.js` covers cache + cache-hit queue (no network).

### Phase 3 complete (Session 002)

- ✅ **CQ-05 + OPS-06** structured logging (`pino`/`pino-http`, `server/logger.js`,
  per-request ids, silent under test); `console.*` replaced. **DEP-02 closed**
  (all prod deps in, audit clean). **Phase 3 done 10/10.**

### Phase 4 progress (Session 002)

- ▶ **TEST-03 harness** — jsdom + `@testing-library/react` + `jest-dom` + react
  plugin; per-file `// @vitest-environment jsdom`. ErrorBoundary render test
  (also lands FE-01 full coverage).
- ▶ **ARCH-02 started** — extracted `LocationSearch` from App.jsx (866→794),
  3 component tests. Next: `TimelinePlayer`, `FilterBar`, then `useReducer` for
  filter state. Suite 49 tests.
- **Style note (superseded):** `src/` was kept no-semi until **CQ-07** normalized the
  whole tree to `.prettierrc` (semicolons) in a single formatting-only commit and
  added a `format:check` CI gate. New code now just follows Prettier everywhere.

### Next session start-here (continue Phase 4)

Read this log + BACKLOG. **Phase 4 (frontend)** — continue ARCH-02: ARCH-02 (decompose the 866-line App.jsx), ARCH-06
(split usePhotos), CQ-01 (shared format/geo helpers — brings the deferred pure-
helper tests), CQ-06 (toast context), SEC-12 (portal map popups), TEST-03
(jsdom component harness — also lands FE-01's full render test), FE-05 (proxy the
client location search through the new server geocode cache).
Quick wins anytime: **ARCH-04** (drop dead tables — pending product nod),
**CQ-07** tail (`prettier` over `src/` + CI `--check`), **FE-02** (contrast).
TEST-02 now 44 tests: db 13 + api 25 + boundary 1 + migrate 3 + geocode 3(+ cache in db).

---

## Session 001 — 2026-07-02 — Programme bootstrap

**Role:** Principal Architect / Tech Lead / Quality Gatekeeper.

### Start-of-session workflow

1. Read repository (no prior PM docs existed). Re-derived findings from the
   deep-dive review by re-reading source — the repo is the source of truth.
2. No completed/outstanding work to review (programme start).
3. Priorities computed from scratch → see ROADMAP.

### Decisions

- Attempted to confirm four blocking questions (user model, deploy target,
  session scope, git model); the clarification tool failed to deliver. Rather
  than stall, made provisional decisions and recorded them as ADRs 0002–0006,
  each revisable in one line.
- **ADR-0001** repo-based PM docs; **ADR-0002** single-operator model;
  **ADR-0003** single-VPS target; **ADR-0004** tests-before-fixes;
  **ADR-0005** keep 7 docs, propose consolidation; **ADR-0006** commit+push docs.

### Work completed

- Created `docs/project-management/` with all seven living documents.
- Imported **71 findings** into `MASTER_BACKLOG.md` with full metadata.
- Built the phased **ROADMAP** (8 phases + deferred) and the **DEPENDENCIES**
  graph. Identified TEST-01 and DEP-02 as the two true Phase-1 gates.

### Quality gates

- N/A this session — documentation only, no code changed. Build/lint baseline
  unchanged.

### Newly discovered issues

- None beyond the review. Confirmed dead `collections`/`photo_collections`
  schema (ARCH-04) and the `updateProject` COALESCE unset bug (BE-03) directly
  in source while importing.

### Selected next task + rationale

**TEST-01 — bootstrap Vitest + seed unit tests.**
Why this and not a security fix first: the programme's quality gates require
passing tests and no regressions, but no test harness exists (ADR-0004). The
Phase-2 security changes (auth, CORS, reset removal, async-error handling) are
security-critical and must be regression-verifiable the moment they land.
TEST-01 is low-risk, unblocks OPS-01 (CI) and every later verification, and lets
the very next task (BE-01) ship with a test proving async errors no longer hang.

**Implementation plan for TEST-01 (drafted; not yet executed):**

1. Add dev deps: `vitest`, `@vitest/coverage-v8`. (Dependency addition noted per
   CLAUDE.md; recorded in backlog DEP-02 lineage and here.)
2. Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts.
3. Create `vitest.config.js` (node env for server tests, jsdom later for
   components in TEST-03).
4. Extract trivially-testable pure helpers where they are currently inline, only
   where it does not force a refactor (KISS): start by testing them _in place_
   via import where already exported; avoid moving code that isn't exported yet
   to respect "no unnecessary refactoring".
5. Seed tests:
   - `pointInPolygon` (`src/App.jsx`) — needs export; if not exported, defer to
     CQ-01 helper extraction rather than refactor now. **Decision:** begin with
     already-exported/pure server + lib targets to avoid premature refactor.
   - `haversineKm` (`ElevationProfile.jsx`) — same consideration.
   - `server/db.js` against a temp/in-memory SQLite: insert→getByHash→getAll→
     delete round-trip; tags JSON parse fallback; survey_date derivation.
   - Export helpers: KML `esc`, exposureTime formatting (extract to a testable
     `server/lib/format.js` only if it can be done as a clean, self-contained
     move — otherwise log as CQ-01 follow-up).
6. Run `npm test`; ensure green.
7. Update PM docs (backlog status, changelog, progress, this log) + commit.

**Note on scope discipline:** TEST-01 revealed a tension — several pure functions
are inline in components and not exported, so "add tests" nudges toward the CQ-01
helper extraction. To honour "avoid unnecessary refactoring" and "commit-sized
changes", TEST-01 will test what is cleanly reachable now (server/db + any
self-contained extractions), and the remaining helper extractions will be done
deliberately under CQ-01 in Phase 4, at which point their tests are added. This
is logged so the coverage gap is intentional and tracked, not forgotten.

### End-of-session state

- Programme scaffolding complete and committed. Awaiting user confirmation on:
  (a) ADR-0002/0003 provisional assumptions, (b) greenlight to modify source
  code starting with TEST-01, (c) ADR-0005 doc consolidation.

### Next session start-here

Read this log + PROGRESS + ROADMAP. If source changes are greenlit, execute the
TEST-01 plan above. Then proceed to OPS-01, then Phase 2 beginning with DEP-02 →
BE-01 (+ regression test) → SEC-02 → SEC-04 → SEC-09 → SEC-07.
