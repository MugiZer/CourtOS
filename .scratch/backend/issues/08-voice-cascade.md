# B08 — Voice cascade (real ASR, two-stage)

**What to build:** the real two-stage cascade with real providers — ranking/fusion logic is ours, microphone magic is theirs.

**Blocked by:** B01 (shapes; runs parallel with B02 — ranking consumes `legalNextStates` signature as a black box).

**Status:** done (in B08 commit + honesty rework 8def7ac; review clean; live-mic proof is demo-day)

**Authority:** architecture.md §5 + ADR-002/003/004 (same-buffer fallback, state-constrained ranking, tactile shares `transition()`; no cross-provider score averaging, no calibration tuning).

- [ ] Tablet pipeline: mic → VAD/wake → 2-4s buffer → real primary ASR → normalize to `TennisIntent` → rank vs legal next states → conditional real fallback on SAME audio → deterministic fusion → CourtGuard | confirm ("Did you say 40-15?", voice Yes/No or touch) | VOICE UNCLEAR + tactile
- [ ] Tiny vocabulary only (love/fifteen/thirty/forty/deuce/advantage/correction/fault/let/yes/no); adjacent-court defense layers; never guess between two legal candidates
- [ ] Judge/debug trace fields on every voice event (primary candidate, legality, fallback invoked/candidate, final intent, recovery/confirm flag)

## Verification

- **Proof:** all four paths through real providers on canned audio (golden, cascade-recovery, ambiguity→confirm, total-failure→tactile); live-mic proof is demo-day
- **Affected regression:** B02 suite still passes
