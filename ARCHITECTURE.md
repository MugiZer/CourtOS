# CourtOS — Architecture Map

> Single source of truth for agents. Update this file as the map evolves.
> Frozen thesis: Voice proposes, CourtGuard disposes. ML is authoritative over nothing.
> Frozen line: `Voice (probabilistic) → typed intent → CourtGuard (deterministic) → match events → Tournament Twin (deterministic) → CourtOptimizer (deterministic) → real-world tournament`

Sources: `CourtOS — CourtGuard CourtSide AI.md` (locked arch), `S-TIER-DECISION-CONTEXT.md` (gates), `Sponsor Challenge 06 — CourtSide AI.md` (brief), `.scratch/courtside-demo/map.md` (demo destination).

## 1. Authority boundaries (do not cross)

- ML / ASR: proposes intents only. Never mutates state.
- CourtGuard: owns score, server/receiver, games, sets, tiebreaks, changeovers. Pure TS reducer: `transition(state, intent, ruleset) → accept | reject + reason`.
- Tournament engine (Twin + Optimizer): owns assignments, readiness, availability, ruleset versions.
- Event log: owns history. Append-only. Corrections = new events. Never delete.

## 2. Stack lock (user override)

- Single-process web: React/Vite PWA + Socket.IO + localStorage. No DB.
- One Node process holds live Tournament Twin, syncs tablet ↔ dashboard.
- Deviation from arch doc (IndexedDB/Dexie + Firebase-preferred) is intentional for this map.

## 3. Nodes

### 3.1 Autonomous court node (tablet)
Owns: local state machine, current ruleset, history, voice input, tactile fallback, changeover timers, local event log in localStorage.
Must work offline. Only organizer sync pauses on disconnect.

### 3.2 Voice pipeline (2-stage cascade, not N-provider ensemble)
Flow: `mic → VAD/noise/wake → 2-4s buffer → primary ASR → intent normalize → state-constrained ranking → CourtGuard OR fallback ASR (same buffer) → fusion → CourtGuard | confirm | tactile`
- State narrows vocab. Ex at 30-15: only `40-15`, `30-all`, `Correction`, `Fault`, `Let` are plausible.
- Adjacent-court defense: VAD + wake + short window + tiny vocab + state ranking. If still ambiguous and legal, ask player — never guess.
- Tactile = first-class peer. Same `transition()` entrypoint as voice.

### 3.3 Confidence / fusion policy (deterministic, explainable)
- Clear + legal + strong margin → CourtGuard.
- Weak / small margin / illegal → run fallback on same audio.
- Agree + legal → CourtGuard.
- Disagree + one illegal → prefer legal only if fallback clears threshold.
- Disagree + both legal → confirmation state: “Did you say 40-15?” Yes/No by voice or touch.
- Neither defensible → `VOICE UNCLEAR` + giant tactile.
- No cross-provider score averaging. Agreement + legality + thresholds + margin only.

Demo-critical paths: golden → cascade-recovery → legal-ambiguity (confirm) → total-failure (tactile).

### 3.4 CourtGuard engine
Pure deterministic TS. Owns points/games/sets, No-Ad, singles/doubles rotation, tiebreak 1-then-2s + doubles rotation + side changes every 6, deciding 10-pt TB, corrections/undo, changeovers, match-complete.
No LLM inside.

### 3.5 Event-sourced state
Truth = history, not current score. Every event: court, match, seq, ts, source, transcript/candidates, proposed intent, prev state, decision, reason, resulting state.
Enables replay, correction, disputes, offline reconcile, debug trace.
Expose on organizer/debug view: primary candidate, legality, fallback candidate, final intent, recovery/confirm flag.

### 3.6 Realtime sync
Socket.IO rooms per court. Local localStorage = resilience layer. Reconnect = push accumulated events, Twin replays.
Verify Twin state version before committing plans; if stale, discard + re-solve.

### 3.7 Tournament Twin (server, deterministic)
Live representation: courts, matches, teams, dependencies, rulesets, assignments, availability, connectivity, events, sponsor/changeover state. Not AI.

### 3.8 CourtOptimizer (receding-horizon, deterministic)
Trigger: `MATCH_FINISHED | PLAYER_READY | PLAYER_DELAYED | COURT_OFFLINE/ONLINE | MATCH_WITHDRAWN | RULE_CHANGED` → rebuild model → solve → AssignmentPlan tied to Twin version → verify version → commit as events.
- Fixed: ongoing matches. Penalize churn: announced < warm-up < in-progress (fixed).
- Hard constraints: no court overlap, no player overlap, bracket prereqs, rest, court compat, division, readiness, immutability of playing matches.
- Objective: minimize `makespan + wait + idle + churn` (weighted).
- Firewall analogy: CourtGuard = “which states legal?”, Optimizer = “which legal schedule best?”
- Demo scope open: full solver vs 2-court heuristic — see §7.

### 3.9 Court lifecycle
`WAITING → WARMUP → PLAYING → CHANGEOVER → PLAYING → MATCH_COMPLETE → RESULT_RECORDED → COURT_FREE → NEXT_MATCH_ASSIGNED → WARMUP`
Sponsor media auto-attached to CHANGEOVER + countdown + “Time” cue.

### 3.10 Organizer dashboard (operational, not analytics)
2 court cards: live score/server/ruleset, connectivity, rejected/ambiguous calls, disputes, free courts, auto next-match. Proof: `match end → result central → court free → next valid match → notify`, no desk walk.

### 3.11 NL organizer control (stretch only)
Typed APIs first: `setRules, forceChangeover, overrideScore, assignMatch, pauseCourt`. LLM may translate NL → typed proposal later; engine still validates.

## 4. Rulesets / rotations agents must implement
- Singles, doubles/mixed, No-Ad, deciding 10-pt TB, Express via versioned ruleset model.
- Doubles: serving team, current server, receiving team, deuce/ad receivers, service order between games, side changes.
- Tiebreak: 1 serve then 2-serve blocks, doubles player rotation, side change every 6, restore correct order after.
- Rule push: versioned `setRules`. Demo: next-match-only + live changeover-duration tweak only. No mid-game/mid-set hot-patch on stage.

## 5. Demo golden path (climax)
1. 15-15, say “CourtSide, thirty fifteen” → both screens update.
2. Say impossible “forty love” → CourtGuard rejects, score unchanged, rule reason on both.
3. “Correction, thirty all” → recovers.
4. Wi-Fi off → red offline, keep scoring local. Reconnect → dashboard catches up from log.
5. Win game → changeover sponsor card + timer + “Time” → back to scoring.
6. Finish match → court free → next match assigned.
- Tiebreak: seeded 6-6 jump-to-TB, play live to show 1 rotation + 1 side change (<2 min).
- Dispute: one canned ROLL BACK path live (DISPUTE → frozen banner both → dashboard ROLL BACK to seq → resume). KEEP/CORRECT in code, not staged.

## 6. Must / Cut / Stretch
Must: tablet UI + tactile, 2-stage ASR cascade + confirm, CourtGuard + undo, singles + one doubles/No-Ad/TB, local persist + reconnect, 2-court dashboard, optimizer (heuristic or solver), 1 sponsor changeover.
Cut: ball tracking/line-call/Hawk-Eye/CV, registration/brackets, payments/accounts, sponsor marketplace, native apps, speaker ID, exhaustive pro edges, Firebase/DB.
Stretch (after golden path): full doubles edges, advanced targeting/scheduling/versions, ASR calibration, umpire flows, NL controls, notifications, bracket mgmt.

## 7. Open decisions (update here when closed)
- [ ] Voice cascade picks under single-process lock (ASR providers, wake, VAD thresholds, margin policy)
- [ ] Twin protocol: rooms, version guard, localStorage schema, reconcile
- [ ] Optimizer demo scope: full solver vs 2-court heuristic
- [ ] Sponsor load + timer/Time cue impl
- [ ] Express mapping onto ruleset model
- [ ] Q5 rule-push: deferred from stage except changeover tweak

## 8. Update log
- 2026-09-05: created from locked arch + S-tier gates + stack lock.
