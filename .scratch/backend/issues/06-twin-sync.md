# B06 — Twin + Socket.IO sync + reconnect

**What to build:** the one Node process holding the live Tournament Twin, syncing tablet ↔ dashboard, surviving disconnects.

**Blocked by:** B05 (needs real `replay()` for reconcile; B01 protocol names via B05).

**Status:** blocked

**Authority:** architecture.md §§3,4,11,12 (Socket.IO rooms per court; localStorage resilience; court authoritative for its scoring; no silent organizer mutation of offline courts — explicit reconcile state instead).

- [ ] `server/` (Socket.IO, in-memory Twin Maps per arch §12); `court:event` / `court:sync` / `court:status` in, `tournament:update` / `court:update` / `ruleset:published` / `assignment:update` out
- [ ] ACK policy: court events stay `synced:false` until server ACK; deterministic ids + sequence dedupe (duplicates ignored, gaps requested/accepted)
- [ ] Reconnect: resend unsynced in sequence order → server replays → dashboard catches up
- [ ] Changeover timer derives from authoritative start timestamp (refresh-safe), "Time" cue at 80s of 90s

## Verification

- **Proof:** kill-connection test (score offline → reconnect → zero lost points) + duplicate-delivery test (no double-apply)
- **Affected regression:** B05 replay tests still pass
