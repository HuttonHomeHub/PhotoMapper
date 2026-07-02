# Session Log — PhotoMapper Remediation Programme

> Append-only. One entry per working session: what was read, decided, done, and
> what comes next. Newest first.

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
