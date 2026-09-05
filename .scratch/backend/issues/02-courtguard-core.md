# B02 — CourtGuard core (singles)

**What to build:** the deterministic firewall: `transition(state, intent, rules)` → accept + new state, or reject + reason. Real logic, no fakes.

**Blocked by:** B01 (shapes frozen).

**Status:** blocked

**Authority:** architecture.md §§6,8 (primitive `POINT_WON(winner)`, numeric counters, `legalNextStates()` first-class, no LLM inside).

- [ ] `transition()` with numeric point counters (0/1/2/3, advantage math, never display strings as state)
- [ ] Standard game/set completion + deuce/advantage + standard 7-pt tiebreak points math
- [ ] `legalNextStates(state, rules)` powering rejection (e.g. 30-15 hears 40-love → `ILLEGAL_TRANSITION`, score unchanged)
- [ ] DISPUTE guard: reject non-resolution intents while `phase==DISPUTE` (rule specced in B01)
- [ ] Voice-spoken resulting score resolves against legal next states to `POINT_WON(A|B)`

## Verification

- **Proof:** table tests incl. 30-15→accept 40-15/30-all→reject 40-love; invariant spot-checks (No-Ad terminates on deciding point, normal game needs +2 after deuce, 7-pt TB can't end 7-6)
- **Affected regression:** B01 conformance check still passes
