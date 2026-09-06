# B01 — Frozen contract + fixtures

**What to build:** the one shared seam backend and frontend both code against: `shared/` types + socket protocol names + 6 fixture JSONs. Frozen hard before batch B launches.

**Blocked by:** None — can start immediately.

**Status:** done (af1c653 + conformance fix; audit PARTIAL→fixed, code-review clean)

**Authority:** architecture.md §§3,9,11,23 (flat `shared/` + `courtguard/` + `server/`, no `packages/` scaffolding).

- [ ] `shared/types.ts`: MatchState (numeric point counters, games, sets, phase incl PLAYING/DISPUTE/CHANGEOVER/COMPLETE, ServiceState), MatchEventRecord (arch §9 shape), RulesetDefinition + CompiledRuleset policy signatures, TennisIntent, Twin snapshot, AssignmentPlan, socket event names (`court:event`, `court:sync`, `court:status`, `tournament:update`, `court:update`, `ruleset:published`, `assignment:update`)
- [ ] DISPUTE rule specced here, implemented in B02: `transition` rejects every non-resolution intent while `phase==DISPUTE`
- [ ] 6 fixtures: mid-game 30-15, blocked-call (40-love heard from 30-15), offline-unsynced batch, dispute-frozen, changeover-sponsor, match-complete + next-assignment
- [ ] Minimal repo skeleton only: flat dirs + laziest TS check the agent can justify (stdlib-first, no test framework unless `node --test` + `assert` can't cover it)

## Verification

- **Proof:** one command proving every fixture conforms to the types (agent picks laziest credible check)
- **Affected regression:** none (empty repo)
