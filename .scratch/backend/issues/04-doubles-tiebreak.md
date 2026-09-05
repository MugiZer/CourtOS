# B04 — Doubles + tiebreak rotation

**What to build:** CourtGuard knows who may legally serve/receive at every point — the "who", B02 built the "what score".

**Blocked by:** B02 (edits the same `transition`/`state` files — genuinely sequential).

**Status:** blocked

**Authority:** architecture.md §8 (rotation derived from point number + order, never ad-hoc UI state).

- [ ] `ServiceState`: servingTeam, server, receivingTeam, deuce/ad receivers, serviceOrder; wrong-server transitions rejected with expected-name reason
- [ ] Tiebreak 1-2-2-2 derived from tiebreak point number + service order; side change every 6; correct order restored after tiebreak
- [ ] Deciding 10-pt TB rotation under B03's deciding-set preset

## Verification

- **Proof:** complete singles + doubles tiebreak sequence tests, zero rotation drift (use seeded 6-6 entry for speed)
- **Affected regression:** B02 + B03 suites still pass
