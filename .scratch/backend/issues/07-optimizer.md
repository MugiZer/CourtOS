# B07 — Optimizer (real receding-horizon, small)

**What to build:** the real thing, small: global constrained re-solve on tournament events, exhaustive over 2 courts, no solver library.

**Blocked by:** B01 (shapes; pure `solve()` builds parallel — trigger-wiring verified after B06 lands).

**Status:** done (in stabilize commit; tests green; trigger-wiring verified against B06 commitPlan seam; review clean)

**Authority:** architecture.md §13 + ADR-010/011 (hard constraints inviolable; weighted objective; version-bound plans, stale discarded; optimizer never mutates Twin).

- [ ] Pure `solve(twinSnapshot)` → version-bound `AssignmentPlan`; hard constraints (court/player overlap, prereqs, rest, compat, readiness, playing immutable); objective minimizes makespan + wait + idle + churn (PLANNED cheap → PLAYING fixed)
- [ ] Triggers re-solve: MATCH_FINISHED, PLAYER_READY/DELAYED, COURT_OFFLINE/ONLINE, MATCH_WITHDRAWN, RULE_CHANGED; unknown winners symbolic, only resolved participants committed
- [ ] Judge-visible explain trace (assignment + projected finish + violation counts, arch §22 Proof 5)

## Verification

- **Proof:** fixture Twin (match finishes, court frees) → valid next assignment + trace with 0 violations; live trigger-wiring proven after B06
- **Affected regression:** B06 sync tests still pass
