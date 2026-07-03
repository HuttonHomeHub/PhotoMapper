# Session Log — PhotoMapper Remediation Programme

> Append-only. One entry per working session: what was read, decided, done, and
> what comes next. Newest first.

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

### Next session start-here (Phase 3 — one big item left: ARCH-01)
Read this log + BACKLOG. Remaining Phase 3 work:
1. **ARCH-01** split `server/index.js` (~470 lines) into routes/services/
   repositories — **LARGE**; its own focused session, moving tests in lockstep.
   Folds in BE-06 (route ordering). Unblocks the deferred multipart-upload
   validation (BE-02 tail) and **BE-07/SEC-05** (background geocoding), then
   **CQ-05/OPS-06** pino logging (closes DEP-02).
2. With ARCH-03 done, **PERF-03** (indexes) and **ARCH-04** (drop dead
   `collections` tables) now land trivially as version-2+ migrations in
   `server/migrate.js` — good low-risk Phase-5/cleanup wins whenever.
3. **CQ-07** tail: `npm run format` over `src/` + a `prettier --check` CI step
   (own formatting-only commit).
TEST-02 keeps growing alongside (now 40 tests: db 11 + api 25 + boundary 1 + migrate 3).

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
   where it does not force a refactor (KISS): start by testing them *in place*
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
