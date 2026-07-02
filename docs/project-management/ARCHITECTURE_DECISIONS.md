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

## ADR-0002 — Assume single-operator / internal deployment (provisional)
- **Status:** Accepted (provisional) · **Date:** 2026-07-02 · **Session:** 001
- **Context:** The review's top finding is "no auth/tenancy". The correct fix depends on the user model, which could not be confirmed (clarifying question failed to deliver). Evidence: local SQLite, single operator, "clients/projects" are *data entities* (a contractor's customers), personal email, no user table.
- **Problem:** Do we build multi-tenant auth (weeks) or a simple gate (hours)?
- **Options considered:**
  1. Single-operator + shared-secret/session gate — chosen.
  2. Small trusted multi-user (login, no hard isolation).
  3. Full multi-tenant SaaS (tenant_id everywhere).
- **Decision:** Treat the app as a single-operator internal tool. SEC-01 becomes a shared-secret/session gate. Multi-tenancy (ARCH-07) and per-tenant features are Deferred. **The auth middleware will be designed so a per-user/tenant model can be introduced later without rearchitecting.**
- **Advantages:** Realistic scope; unblocks Phase 2 immediately; avoids speculative multi-tenant work (YAGNI).
- **Disadvantages:** If the product is actually multi-tenant, SEC-01 re-scopes to L and ARCH-07 activates.
- **Future implications:** Revisit trigger — user states multiple untrusted customers. Backlog/roadmap already carry the dormant ARCH-07/FEAT-05 items so nothing is lost on revision.

## ADR-0003 — Target a single VPS/container host with persistent disk (provisional)
- **Status:** Accepted (provisional) · **Date:** 2026-07-02 · **Session:** 001
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

## ADR-0005 — PM document set: follow the 7-doc spec, propose consolidation (proposed)
- **Status:** Proposed · **Date:** 2026-07-02 · **Session:** 001
- **Context:** The programme brief specifies 7 living documents. Experience suggests 4 (backlog, roadmap+deps, ADRs, session log) are easier to keep consistent for a single maintainer.
- **Problem:** More documents = more surfaces to drift.
- **Decision (pending approval):** Maintain all 7 as specified for now. **Recommend** consolidating CHANGELOG+PROGRESS into the backlog (status history) and DEPENDENCIES into ROADMAP at a future checkpoint.
- **Advantages of consolidation:** Fewer seams, less drift.
- **Disadvantages:** Larger individual files; deviates from the brief.
- **Future implications:** Requires user sign-off before changing the doc structure. Until then, all 7 are maintained.

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

---

## Pending decisions (need user input; tracked so they are not forgotten)
- **ADR-0002 / ADR-0003** confirmation (user model, deploy target).
- **ADR-0005** consolidation approval.
- **ARCH-04** keep vs drop dead `collections` tables.
- **DOC-02** canonical product name.
