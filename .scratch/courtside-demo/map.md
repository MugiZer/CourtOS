## Destination

2-court demonstrator: 1 court scorer tablet + 1 organizer dashboard tracking 2 courts, synced real-time. Proof is the demo climax: live voice scoring, visible rejection of an impossible call with rule reason, Correction recovery, offline-then-reconnect catch-up, game win into sponsor changeover with Time cue, court-free into next-match assignment.

## Notes

- Domain: tennis tournament ops. Voice proposes, CourtGuard disposes. See `CourtOS — CourtGuard CourtSide AI.md` (frozen architecture line: Voice -> typed intent -> CourtGuard -> match events -> Tournament Twin -> CourtOptimizer -> tournament) and `Sponsor Challenge 06 — CourtSide AI.md` (sponsor brief).
- Stack lock (user decision, overrides arch doc): single-process web stack: React/Vite + Socket.IO + localStorage. No database. Court state/events persist locally in the browser; one Node process holds the live Tournament Twin and syncs tablet with dashboard.
- Deviation recorded: arch doc prescribes IndexedDB/Dexie + Firebase-or-WebSockets (Firebase preferred). For this map those are out; localStorage + Socket.IO single process wins.
- Execution carries into the map (build, not just decisions) per backlog request.
- Authority boundaries hold: ML proposes intents only; CourtGuard owns score/server/games/sets/tiebreaks/changeovers; tournament engine owns assignments/readiness/ruleset versions; append-only event log owns history. Never delete events; corrections are new events.
- Skills to consult: domain-modeling on every ticket (sharpen terms into CONTEXT.md), tdd for CourtGuard engine work.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- Voice cascade under single-process lock: primary/fallback ASR pick, wake phrase, VAD, state-aware ranking thresholds, confirmation policy.
- Tournament Twin single-process design: Socket.IO rooms/protocol, state-version guard, localStorage schema, reconnect reconciliation.
- CourtOptimizer demo scope: full receding-horizon solver vs simplified 2-court heuristic for the demo.
- Sponsor media loading + changeover timer/Time cue implementation.
- Express/Fast-Play mapping onto the versioned ruleset model.

## Out of scope

- Cut list from arch doc: ball tracking/line calling, Hawk-Eye/CV, registration/bracket-gen, payments/accounts, sponsor marketplace, native apps, speaker ID, exhaustive pro edge cases.
- No database, no Firebase, no IndexedDB/Dexie in this map (stack lock above).
- Natural-language organizer control and other stretch items — only after golden path works.
