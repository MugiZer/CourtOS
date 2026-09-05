# B05 — Events + replay + dumb dispute

**What to build:** append-only history as source of truth, deterministic replay, and the one-button dispute path.

**Blocked by:** B01 (shapes; runs parallel with B02 — `replay` uses `transition` as a black box, final proof needs B02's DISPUTE guard).

**Status:** blocked

**Authority:** architecture.md §§9,10 + ADR-005/009 (history never deleted; organizer answers "what score do we return to?").

- [ ] Append-only log: deterministic ids (`crypto.randomUUID`, stdlib) + monotonic per-match sequence; every record carries arch §9 fields
- [ ] `replay(events)` deterministically rebuilds state
- [ ] Dumb dispute: DISPUTE freezes scoring → organizer sees recent history → picks correct prior score → rollback/correction appended as new event → resume

## Verification

- **Proof:** dispute→resolve→`replay()` reconstructs the corrected match; history length never shrinks on rollback
- **Affected regression:** B02 suite still passes
