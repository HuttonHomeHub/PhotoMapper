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

### Quality gates (TEST-01)
- `npm run build` ✅ · `npm run lint` ✅ (15 pre-existing warnings, **0 new**) ·
  `npm test` ✅ 11/11. No new security concerns; no perf-sensitive code touched.

### Newly discovered issues
- **`npm audit`: 11 vulnerabilities** (1 low, 6 moderate, 2 high, 2 critical).
  Routed to DEP-04/OPS-01 (do not silently ignore). To be triaged when CI gains
  the audit step.
- Confirmed the 15-warning lint baseline (dead exports etc.) — covered by CQ-03.

### Selected next task + rationale
**OPS-01 — wire tests + `npm audit` into CI, and run CI on the working branch.**
Why next: TEST-01 created tests, but they only protect us if CI enforces them.
Currently `.github/workflows/ci.yml` runs on `main` only and does lint+build.
OPS-01 is low-risk, closes the gap that makes every later "Completed" trustworthy,
and folds in DEP-04 (audit) so the 2 critical vulns become visible/tracked.
Plan: add `npm test` + `npm audit --audit-level=high` (non-blocking triage step
first, then ratchet) to CI; add `pull_request`/`push` triggers for
`claude/**` branches; keep build.

### End-of-session state
- Phase 1: 1/4 (TEST-01 ✅). Next: OPS-01 → then TEST-05 (coverage threshold) →
  Phase 2 (DEP-02 → BE-01 → SEC-02/04/09/07 …).

### Next session start-here
Read this log + BACKLOG (Programme status). Execute OPS-01 plan above. After CI
is green with tests, begin Phase 2 with DEP-02 (prod deps) then BE-01 (async
error handling) with its regression test.

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
