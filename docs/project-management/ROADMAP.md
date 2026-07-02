# Roadmap — PhotoMapper Remediation Programme

> Phased plan ordered to **minimise rework** and honour the programme rules
> (root causes before symptoms; architecture before cosmetics; nothing risky
> lands before it can be verified). See `MASTER_BACKLOG.md` for item detail and
> `DEPENDENCIES.md` for the blocking graph.
>
> Last updated: 2026-07-02 (Session 001)

## Sequencing principle

The user's suggested roadmap placed Testing at Phase 6. **We deliberately pull a
minimal test + CI foundation to Phase 1** (see ADR-0004): the programme's own
quality gates ("tests pass", "no regressions") are unenforceable without it, so
every security fix that follows would otherwise be unverifiable. Deep testing
still happens later (Phase 6); Phase 1 is only the harness + smoke coverage.

Infrastructure-heavy items (Docker, backups, object storage) are gated on the
deploy-target decision (ADR-0003) and sit in Phase 8, except where a security
fix needs a config primitive (env/config, Phase 2).

---

## Phase 0 — Programme setup ✅ (Session 001)
Establish PM documentation, import findings, build backlog + dependency graph.
- **Deliverable:** `docs/project-management/*` populated. **Status: Complete.**

## Phase 1 — Verification foundation (enabler)
*Goal: make quality gates real before touching risky code.*
- **TEST-01** Vitest harness + pure-function/db unit tests `[P0]`
- **OPS-01 / DEP-04** CI runs tests + `npm audit`; run CI on the working branch `[P0]`
- **TEST-05** coverage reporting (threshold low initially) `[P2, tail of phase]`
- **Exit criteria:** `npm test` runs green in CI; a failing test blocks merge.

## Phase 2 — Critical security & reliability
*Goal: close the disqualifying holes; all low-risk, high-value, now verifiable.*
- **DEP-02** add `helmet`, `express-rate-limit`, `compression`, async-error handling, `zod`, session lib `[P0, enabler]`
- **OPS-07** central `config.js` + `.env.example` (secret, origins, log level) `[P1, enabler]`
- **BE-01** fix Express async error handling (+ regression test) `[P0]`
- **SEC-02** remove/guard `DELETE /api/reset` `[P0]`
- **SEC-04** lock down CORS `[P0]`
- **SEC-09** helmet/CSP/nosniff/HSTS `[P0]`
- **SEC-07 / FEAT-04** rate limiting + lower upload cap `[P0]`
- **SEC-08** stop leaking error messages `[P1]`
- **SEC-01** authentication gate (shared-secret/session per ADR-0002) `[P0]`
- **SEC-03** protect `/uploads` behind auth `[P1, after SEC-01]`
- **FE-01** React error boundary `[P1, independent]`
- **FE-04** confirm dialogs for client/project delete `[P1, independent]`
- **PERF-08** compression `[P2, rides DEP-02]`
- **Exit criteria:** no unauthenticated access; no unauth wipe; async errors return 500; TEST-02 covers auth + the above.

## Phase 3 — Backend architecture & correctness
*Goal: remove root causes that later phases would otherwise fight.*
- **ARCH-03** versioned migration runner + DB backup on destructive steps `[P2, high-risk → needs Phase 1]`
- **ARCH-01** split server into routes/services/repositories `[P2]`
- **BE-02** zod validation layer `[P1]`
- **BE-03** fix `updateProject` unset bug `[P1]`
- **BE-04** fix `PATCH /clients/:id` validation/404/409 `[P1]`
- **BE-07 / SEC-05** background geocoding job w/ cache + limiter `[P1]`
- **BE-06** route ordering (folded into ARCH-01) `[P2]`
- **CQ-05 / OPS-06** structured + request logging `[P2]`
- **TEST-02** API integration tests (grows across this phase) `[P1]`
- **Exit criteria:** thin handlers; all inputs validated; migrations versioned; geocoding off the request path.

## Phase 4 — Frontend architecture & code quality
- **ARCH-02** decompose `App.jsx` (Timeline/LocationSearch/FilterBar) + reducer/context `[P3]`
- **ARCH-06** split `usePhotos`; context to cut prop drilling `[P3]`
- **CQ-06** context-based Toast `[P3]`
- **CQ-01** shared format/geo helpers `[P3]`
- **CQ-03** remove dead exports `[P3]`
- **CQ-04** standardize error UX (remove native alert/confirm) `[P3]`
- **SEC-12** React-portal map popups `[P2]`
- **FE-05** proxy location search via server geocode `[P3]`
- **FE-06** client/project loading+empty states `[P3]`
- **TEST-03** component tests `[P2]`
- **Exit criteria:** no god components; single toast/error pattern; components under test.

## Phase 5 — Performance
- **PERF-03** DB indexes (migration) `[P2]`
- **PERF-02** return-only-affected-row `[P2]`
- **PERF-01 / FEAT-01** pagination + bbox querying `[P2]`
- **PERF-05** memoize frontend filter chain `[P3]`
- **PERF-06** incremental marker updates `[P3]`
- **PERF-07** drop client-side hashing/pre-check (obsoletes SEC-10, BE-05) `[P3]`
- **Exit criteria:** smooth interaction at 5k+ photos; measured before/after.

## Phase 6 — Testing depth
- **TEST-04** Playwright E2E `[P2]`
- **TEST-05** ratchet coverage thresholds up `[P2]`
- **Exit criteria:** critical journeys covered E2E; coverage gate meaningful.

## Phase 7 — Documentation
- **DOC-01** README `[P1 — may be pulled earlier once architecture is less volatile]`
- **DOC-03** API reference `[P2, after ARCH-01/BE-02]`
- **DOC-02** resolve name mismatch `[P3]`
- **DOC-05** CONTRIBUTING/onboarding `[P3]`
- **DOC-06** geo-math doc `[P3]`
- **DOC-04** architecture diagram `[P2, ongoing]`

## Phase 8 — DevOps, infrastructure & dependencies
*Gated on ADR-0003 (deploy target).*
- **OPS-02** Dockerfile + `.dockerignore` `[P2]`
- **OPS-03 / FEAT-03** persistent volume + backups + restore doc `[P2]`
- **OPS-04** health/ready + error tracking `[P2]`
- **OPS-05** graceful shutdown `[P2]`
- **SEC-11** TLS/HSTS at proxy `[P3]`
- **DEP-01** replace heatmap libs `[P3]`
- **DEP-03** evaluate Express 5 (may retire BE-01 shim) `[P3]`

## Deferred (revisit triggers noted)
- **ARCH-05** TypeScript migration — revisit after Phase 3/4 stabilize modules.
- **ARCH-07** multi-tenancy — revisit only if ADR-0002 changes to multi-tenant.
- **PERF-04** async DB / Postgres — revisit if concurrency grows (ADR-0003).
- **FEAT-06** GDPR controls — revisit with product/legal input.
- **FEAT-02/05/07/08/09** — sequenced after their prerequisites; see backlog.

---

## Current focus
**Phase 1 → TEST-01** is the single highest-value next task. Rationale and plan
live in `SESSION_LOG.md` (Session 001) and `PROGRESS.md`.
