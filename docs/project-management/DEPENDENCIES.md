# Dependency Graph — PhotoMapper Remediation Programme

> How work items block, enable, or obsolete one another. Kept in sync with
> `MASTER_BACKLOG.md`. Recompute at the start of every session and after any
> item reaches `Completed`.
>
> Last updated: 2026-07-02 (Session 001)

## Notation
- `A → B` : A blocks B (A must land first)
- `A ⊢ B` : A enables/eases B (not a hard block)
- `A ⊗ B` : A obsoletes/subsumes B (B may be closed when A lands)

## Foundational enablers (unblock the most work)

```
TEST-01 (test harness)
  → TEST-02, TEST-03, TEST-04, TEST-05, OPS-01
  ⊢ ARCH-03, ARCH-01, ARCH-02, DEP-03   (risky changes need verification)

DEP-02 (prod deps)
  → SEC-04, SEC-07, SEC-09, BE-01, PERF-08
  ⊢ SEC-08, BE-02

OPS-07 (config/env)
  ⊢ SEC-01 (secret), SEC-04 (origins), CQ-05/OPS-06 (log level), SEC-09
```

## Security chain

```
SEC-01 (auth)  → SEC-03 (protect /uploads)
               ⊢ SEC-02 (reset gating), SEC-10, FEAT-05 (audit log)
OPS-07 ⊢ SEC-01, SEC-04
DEP-02 → SEC-04, SEC-07, SEC-09
BE-07  → SEC-05 (geocoding moved off request path)  [SEC-05 implemented via BE-07]
CQ-05/OPS-06 ⊢ SEC-08
```

## Backend chain

```
DEP-02 → BE-01 (async errors)          [or DEP-03 Express 5 ⊗ BE-01 shim]
ARCH-01 (layering) ⊢ BE-02, BE-04, BE-06, BE-07, SEC-05, DOC-03
BE-02 (validation) ⊢ BE-03, BE-04
ARCH-03 (migrations) → PERF-03, ARCH-04, FEAT-07   (all need schema changes)
TEST-01 ⊢ ARCH-01, ARCH-03 (verify refactors)
```

## Frontend chain

```
ARCH-02 (decompose App) ⊢ PERF-05, FE-03, CQ-01, CQ-03, CQ-04
ARCH-06 (split hooks)   ⊢ CQ-03, CQ-06, FE-06
SEC-12 (portal popups)  ⊢ PERF-06
FE-01 (error boundary)  — independent
FE-04 (delete confirm)  — independent
BE-07 ⊢ FE-05 (server-proxied location search)
```

## Performance chain

```
ARCH-01 ⊢ PERF-01, PERF-02
ARCH-03 → PERF-03 (index migration)
ARCH-02 → PERF-05 (memoize after decomposition, avoid double work)
PERF-01 ⊢ PERF-06 (bbox loading changes marker set)
PERF-07 ⊗ SEC-10, BE-05   (removing client hashing retires the check-hash endpoint)
PERF-01 = FEAT-01
```

## DevOps / infra chain (gated by ADR-0003)

```
TEST-01 → OPS-01 (CI has tests to run); OPS-01 ⊇ DEP-04 (npm audit)
ADR-0003 → OPS-02 (Docker) → OPS-03 (persistence), SEC-11 (TLS/proxy)
ADR-0003(PaaS) → FEAT-09 (object storage) ⊗ OPS-03(volume variant)
CQ-05 = OPS-06 (same logging work) ⊢ OPS-04
OPS-02 ⊢ OPS-05 (graceful shutdown matters on container deploys)
```

## Obsolescence watch (items that may close for free)
- **SEC-10, BE-05** → likely closed by **PERF-07**.
- **BE-01 shim** → may be replaced by **DEP-03** (Express 5).
- **OPS-03 volume variant** → superseded by **FEAT-09** if deploy target becomes PaaS.
- **FEAT-01** → delivered by **PERF-01**.
- **FEAT-04** → delivered by **SEC-07**.

## Product/decision gates
- **ADR-0002 (user model)** gates SEC-01 scope and ARCH-07/FEAT-05.
- **ADR-0003 (deploy target)** gates OPS-02/03, SEC-11, FEAT-09, PERF-04.
- **ARCH-04** (drop dead tables) needs a product decision + ARCH-03.
- **DOC-02** (canonical name) needs a naming decision.

## Critical path (longest hard-block chain)
```
TEST-01 → OPS-01 ✱   and   DEP-02 → BE-01
TEST-01 ⊢ ARCH-03 → PERF-03
DEP-02/OPS-07 → SEC-01 → SEC-03
ARCH-01 → BE-07 → SEC-05
```
The two true Phase-1 gates are **TEST-01** and **DEP-02**; almost everything of
value sits behind one of them, which is why they lead the roadmap.
