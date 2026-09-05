CourtOS — CourtGuard / CourtSide AI


One-line concept
Players call the score naturally; CourtGuard updates the whole tournament live, but a deterministic tennis-rules firewall rejects misheard or impossible calls before they can corrupt the match, and every court keeps working offline.


Core thesis
Do not trust speech recognition to own match state. Voice is probabilistic; tennis scoring is deterministic. The speech model proposes a score event, but only the rules engine is allowed to commit it. The project is not “AI that keeps score”; it is a trusted execution layer between noisy voice input and tournament state.


Target user and painful moment
Local and recreational tennis tournaments run largely unofficiated. Players lose track of scores, server rotations, changeovers, and tiebreak rules; organizers walk between courts, manually collect results, update spreadsheets, and assign the next match. Outdoor courts are noisy, so raw speech-to-text can easily create silent scoring errors.


Contrarian insight
Perfect speech recognition is the wrong goal. A tennis match has a tiny, highly constrained state space. Use the rules of the sport to catch recognition mistakes and make imperfect voice reliable.


Technical mechanism
microphone → low-latency speech-to-text → tennis intent parser → candidate score event → deterministic rules/state verifier → accepted event log → tablet scoreboard + organizer sync.


Examples
At 30–15, “40–15” and “30-all” are valid next states. “40-love” is impossible and is rejected. An explicit “Correction” command can reverse or replace the last accepted event. Every accepted or rejected proposal records transcript, confidence, previous state, decision, and reason.


Architecture
• Court tablet: high-contrast React/Vite PWA with huge score display and tactile fallback.
• Voice: browser audio, VAD/noise suppression, wake phrase, short buffered utterance, primary ASR, state-aware tennis-intent ranking, and fallback ASR only on weak/ambiguous/illegal primary results.
• Parser: constrained tennis vocabulary; no LLM needed for score transitions.
• Score firewall: pure deterministic TypeScript reducer/state machine.
• Rulesets: singles, doubles, mixed doubles, No-Ad, deciding tiebreak, express mode, serve/changeover clocks.
• State: event-sourced match log for correction, replay, disputes, and auditability.
• Offline: persist events locally in IndexedDB and sync on reconnect.
• Realtime: Firebase/WebSocket sync from court to organizer dashboard.
• Organizer: two court cards, live scores, server, ruleset, connection state, rejected-call alerts, next-match queue.
• Sponsorship: full-screen sponsor media during changeovers, with countdown and “Time” audio cue.


Demo climax
1. Court 1 starts at 15–15 while the organizer dashboard is projected.
2. Say “CourtSide, thirty fifteen.” Both displays update instantly.
3. Deliberately say an impossible next score such as “forty love.”
4. CourtGuard visibly rejects it, leaves the score unchanged, and shows the exact rule reason on both court and organizer views.
5. Say “Correction, thirty all.” The system recovers immediately.
6. Turn Wi-Fi off. Continue scoring locally with a red offline indicator.
7. Reconnect. The organizer dashboard catches up from the local event log.
8. Finish a game; changeover mode shows a sponsor card, runs the timer, calls “Time,” and returns to scoring.


Why it is not a generic AI wrapper
The difficult part is not calling speech-to-text. The hidden mechanism is deterministic state enforcement, doubles/tiebreak rotation logic, event-sourced corrections, offline reconciliation, and real-time multi-court synchronization. A model can propose events; it cannot directly mutate authoritative match state.


Winning-project patterns used
• ViniClip pattern: remove the reporting-to-the-desk step entirely instead of merely making it faster.
• FaceTimeOS pattern: repurpose hardware players already have—a tablet/phone and microphone.
• SignHero pattern: recognition must feel immediate enough to become the interface.
• ChessMate pattern: the physical/court and central digital states must never disagree.
• DIAL(*) pattern: prove the system live against uncontrolled real-world input instead of relying on a canned recording.
• Semantic-firewall pattern: probabilistic proposal → deterministic verifier → allowed state transition with proof trace.


Build scope — must-have
• One real court tablet UI.
• One organizer dashboard showing two courts.
• Voice scoring for a narrow vocabulary.
• Deterministic legal-transition verification.
• Explicit correction/undo.
• Singles plus one doubles/No-Ad ruleset.
• Local event persistence and reconnect sync.
• One polished changeover sponsor sequence.
• Receding-horizon global constraint optimizer for multi-court assignment.


Stretch
• Extended doubles edge cases beyond the demo ruleset.
• Advanced rule targeting, scheduling, and version-management controls.
• Advanced ASR calibration and provider-specific confidence tuning.
• Expanded umpire/escalation workflows beyond the core dispute path.




Cut list
• Ball tracking or line calling.
• Hawk-Eye/computer vision.
• Registration and bracket-generation platform.
• Payments/player accounts.
• Sponsor marketplace.
• Native mobile apps.
• Sophisticated speaker identification.
• Exhaustive professional-tennis edge cases.


Primary technical risk and fallback
Speech recognition in loud rooms may still fail. Keep the voice vocabulary tiny, use a wake phrase, display the interpreted command before/while committing, and always provide giant tactile controls. The deterministic rules engine ensures a recognition failure cannot silently create an impossible score. The demo should have a scripted golden path plus manual fallback that uses the same authoritative state engine.


Sponsor fit
Directly addresses CourtSide AI’s required voice scoring, real-time central dashboard, singles/doubles/express rules, centralized rule control, offline resilience, tactile fallback, changeover advertising, and scoreboard polish. The sponsor brief requires an IP-grant acknowledgement before selecting the challenge; review that condition before committing proprietary implementation details.


One-sentence winning pitch
“We don’t trust AI to keep score. We let AI listen, and tennis rules decide what is allowed to become true.”


Initial S-tier score
Demo clarity and climax: 20/20
Originality and surprise: 13/15
Technical depth: 15/15
Human importance / resonance: 12/15
Reliability in hackathon scope: 14/15
Builder-story / thesis fit: 9/10
Visual / interactive polish: 5/5
Expansion potential: 5/5
Total: 93/100 — S-tier concept if the live rejection + recovery + offline/reconnect demo is polished and reliable.


What would raise it further
• Make the rejected impossible score visually unforgettable.
• Ensure the offline-to-reconnect sequence never fails.
• Make doubles rotation correctness demonstrable in one short interaction.
• Show “court free → next match assigned” immediately after match completion to prove organizer value.


Locked architecture — current build plan


Architectural thesis
CourtOS uses probabilistic intelligence to understand humans and deterministic systems to run tennis. ML may propose an interpretation or intent, but it never owns authoritative match or tournament state.


1. Autonomous court node
Each court runs as a React + TypeScript + Vite PWA and must continue operating without the server or internet. The tablet owns the local tennis state machine, current ruleset, scoring history, voice input, tactile fallback controls, changeover timers, and an append-only local event log persisted in IndexedDB. If connectivity disappears, scoring, rules, corrections, and timers continue locally; only organizer synchronization pauses.


2. Voice pipeline
microphone → audio preprocessing / VAD / noise suppression / wake phrase → 2–4 second buffered utterance → primary ASR → tennis-intent normalization → current-match-state constrained ranking → clear result to CourtGuard OR weak/ambiguous/illegal result to fallback ASR using the exact same buffered audio → deterministic evidence fusion → CourtGuard or player confirmation/touch.


The demo architecture is deliberately a two-stage cascade, not a many-provider ensemble. Most calls use only the fast primary recognizer. The second independent recognizer is invoked only when the first result is weak, ambiguous, or proposes an illegal transition. The original utterance is retained locally until a decision is complete so fallback never requires the player to repeat the call.
The current match state narrows the possible score calls. Example: at 30–15, likely next score intents are 40–15 or 30–all, plus commands such as Correction, Fault, and Let. ASR output is normalized into typed tennis intents rather than trusted as raw text. CourtOS asks which currently plausible tennis intent is best supported by the audio instead of asking an unrestricted speech model what English sentence was spoken.


Adjacent-court defense is layered rather than dependent on perfect source localization: voice activity detection + wake phrase + short authoritative listening window + tiny tennis vocabulary + state-aware ranking. Speech outside the activation window is ignored. If adjacent-court speech passes activation but is weak or inconsistent with the local match state, it is rejected or escalated. If an adjacent court happens to say an equally legal local score, CourtOS does not pretend rules can disambiguate it; uncertainty is surfaced and the player confirms instead of the system guessing.


Tactile input is a first-class peer to voice. Voice proposals and touchscreen actions both terminate at the same deterministic CourtGuard transition function and event log.


3. Confidence policy
Primary decision policy:
• Clear + legal primary candidate with a strong margin over alternatives → send to CourtGuard.
• Weak confidence, small margin between legal candidates, or an illegal primary interpretation → run fallback ASR on the same buffered utterance.


Fallback fusion policy:
• Primary and fallback agree on the same legal typed intent → send to CourtGuard.
• They disagree and one candidate is illegal from the current match state → prefer the legal candidate only if the fallback clears its minimum evidence threshold.
• They disagree and both candidates are legal → do not guess; enter confirmation state.
• Neither produces a defensible legal interpretation → show VOICE UNCLEAR and fall back to giant tactile controls.


Provider confidence values are not directly averaged across ASR systems. For the demo, fusion is deterministic and explainable: agreement, legality, per-provider thresholds, and candidate margin. CourtOS may later calibrate provider-specific scores, but calibration is not required for the golden path.


Confirmation is part of the normal state machine, not an error modal. The tablet asks “Did you say 40–15?” and accepts voice Yes/No or touch. No authoritative match state changes until CourtGuard accepts the final typed intent.


Demo-critical voice paths:
1. Golden path — primary ASR is clear and the score updates immediately.
2. Cascade recovery — primary is weak/wrong or illegal; fallback recovers the intended legal call from the same audio.
3. Legal ambiguity — recognizers support different legal outcomes; CourtOS asks the player instead of guessing.
4. Complete failure — both recognizers are unusable; tactile scoring continues through the same CourtGuard authority layer.


For judges, the organizer/debug view should expose the evidence trace: primary transcript/candidate, legality decision, fallback candidate when invoked, final typed intent, and whether recovery or confirmation was required.


4. CourtGuard engine
A pure deterministic TypeScript reducer/state machine is authoritative over match state. It owns points, games, sets, tiebreaks, No-Ad, singles, doubles, serving/receiving order, corrections, changeovers, and match completion. Conceptually: transition(currentMatchState, proposedEvent, ruleset) → accepted or rejected transition. No LLM is allowed inside this layer.


5. Event-sourced state
The source of truth is the event history, not only the current displayed score. Every event records court, match, sequence, timestamp, source, transcript/candidates when relevant, proposed intent, previous state, decision, rejection reason, and resulting state. This enables replay, correction, disputes, offline recovery, reconciliation, debugging, and deterministic reconstruction.


6. Realtime synchronization
Court events synchronize to the central system through Firebase Realtime Database or WebSockets. Local IndexedDB remains the resilience layer so a court can survive disconnection and later reconcile accumulated events.


7. Tournament Twin
The server maintains a deterministic live representation of courts, matches, players/teams, match dependencies, rulesets, assignments, availability, connectivity, event history, and sponsor/changeover state. It is not an AI model; it is the authoritative tournament representation derived from events.


8. CourtOptimizer
CourtOptimizer is a global receding-horizon constraint optimizer. It does not greedily choose the next match for one free court. Instead, whenever tournament reality changes, it rebuilds a constrained scheduling model over the current Tournament Twin and solves for the best near-term plan across all courts and currently schedulable matches.


Decision variables include match-to-court assignment and planned start/end times over a rolling horizon. Ongoing matches are fixed intervals; future planned assignments may move, while announced, warm-up, and in-progress assignments receive increasingly strong churn penalties or become fixed.


Hard constraints are inviolable: no court overlap, no player overlap, completed bracket prerequisites, required player rest, court compatibility, tournament/division restrictions, match readiness, and immutability of already-playing matches. The solver searches only schedules satisfying these rules.


The objective minimizes a weighted combination of projected tournament makespan, total player waiting time, court idle time, and schedule churn. CourtOS therefore optimizes the tournament globally rather than simply filling the next empty court.


The horizon rolls forward as new information arrives. Events such as MATCH_FINISHED, PLAYER_READY, PLAYER_DELAYED, COURT_OFFLINE, COURT_ONLINE, MATCH_WITHDRAWN, or RULE_CHANGED update the Tournament Twin and trigger a fresh solve. Unknown future bracket winners may be represented for projection, but CourtOS only commits assignments whose participants and prerequisites are resolved.


Every optimization result is an AssignmentPlan tied to the Tournament Twin state version it was solved against. Before committing, CourtOS verifies that the authoritative state version has not changed. If the plan is stale, it is discarded and re-solved. The optimizer never mutates tournament state directly; validated assignments are committed as events.


This gives CourtOS a deterministic scheduling firewall analogous to CourtGuard: CourtGuard answers “which match states are legal?” while CourtOptimizer answers “among legal near-term tournament schedules, which one is best?”


9. Automatic court lifecycle
WAITING → WARMUP → PLAYING → CHANGEOVER → PLAYING → MATCH_COMPLETE → RESULT_RECORDED → COURT_FREE → NEXT_MATCH_ASSIGNED → WARMUP.
Sponsor media is attached to CHANGEOVER state automatically, including countdown and the “Time” audio cue. This keeps monetization part of the real match lifecycle rather than an unrelated feature.


10. Organizer dashboard
The dashboard should remain operational rather than analytical: realtime court cards, live score/server/ruleset, connectivity state, ambiguous or rejected voice calls, disputes, available courts, and automatic next-match assignments. The key proof is removing the tournament desk from the critical path: match end → result exists centrally → court becomes free → next valid match selected → court/player notification.


11. Natural-language organizer control — stretch only
Structured APIs such as setRules, forceChangeover, overrideScore, assignMatch, and pauseCourt come first. If the core system is complete, an LLM may translate natural-language organizer requests into typed proposals, but the deterministic tournament engine still validates and executes them.


Authority boundaries
• ML is authoritative over nothing; it proposes interpretations/intents.
• CourtGuard is authoritative over match score, server/receiver, games, sets, tiebreaks, and changeovers.
• Tournament engine is authoritative over court assignments, match readiness, player availability, and ruleset versions.
• The append-only event log is authoritative over what happened.


Concrete stack
• Court + dashboard: React, TypeScript, Vite PWA.
• Deterministic logic: plain TypeScript reducers/state machines.
• Local persistence: IndexedDB, optionally via Dexie.
• Realtime sync: Firebase Realtime Database or WebSockets; Firebase preferred for hackathon speed.
• Backend: minimal Node/TypeScript orchestration service if needed.
• Voice: Web Audio → VAD/noise processing → wake phrase → short local utterance buffer → primary ASR → typed tennis-intent normalization → match-state candidate ranking → conditional fallback ASR → deterministic fusion/confirmation.
• Testing: unit tests + property-based tests + random match simulation + network-failure simulation.


Must ship
• Real court tablet UI with tactile fallback.
• Voice score calls using the frozen two-stage state-aware ASR cascade: primary recognizer, state-constrained ranking, conditional fallback on the same audio, and deterministic fusion.
• Deterministic confidence/margin policy with player confirmation whenever multiple legal interpretations remain plausible.
• Deterministic tennis engine with correction/undo.
• Singles plus doubles/No-Ad/tiebreak support sufficient for demo.
• Local event persistence and offline/reconnect recovery.
• Realtime 2-court organizer dashboard.
• Receding-horizon global constraint optimization for court assignments, re-solved on tournament events.
• One polished state-driven sponsor changeover.


Backlog — remaining challenge gaps


P0 — CourtGuard ruleset coverage
Implement the actual demo rulesets: singles, doubles, No-Ad, and a 10-point deciding tiebreak. Express/Fast-Play behavior should be represented through the same versioned ruleset model.
Done when: the demo can configure these formats and CourtGuard deterministically produces the correct legal next states for each.


P0 — Doubles server / receiver order
Freeze and implement the doubles state model: serving team, current server, receiving team, deuce/ad receiver assignments, service order between games, and side changes.
Done when: CourtGuard can answer who is legally serving and receiving at every point of a doubles match, and invalid manual/voice transitions are rejected.


P0 — Tiebreak serving rotation
Encode and test tiebreak serving order, including the initial single serve followed by two-serve blocks, doubles player rotation, side changes, deciding match tiebreak behavior, and restoration of the correct service order after the tiebreak where applicable.
Done when: deterministic tests cover complete singles and doubles tiebreak sequences with no rotation drift.


P0 — Dispute workflow
Implement a concrete dispute path: player starts DISPUTE → scoring freezes → recent event history is shown → organizer chooses KEEP SCORE, CORRECT, or ROLL BACK → resolution is appended as a new event → match resumes. Never delete historical events.
Done when: a live demo dispute can be resolved from the organizer dashboard and replaying the event log deterministically reconstructs the corrected match.


P0 — Centralized rule push
Promote a minimal versioned setRules flow into demo scope. Organizer can push supported settings such as No-Ad, deciding 10-point tiebreak, or changeover duration to applicable matches. CourtGuard must validate the patch and apply it only at a safe activation boundary so an in-progress game cannot be corrupted.
Done when: the organizer changes a rule once, the target courts visibly receive the new ruleset version, and both court and dashboard agree on when it becomes active.


P1 — Scoreboard visual system
Freeze the actual court-side design system: ultra-high contrast, giant score typography, clear set/game/point hierarchy, server indicator, listening state, confirmation state, offline state, blocked-call state, changeover/sponsor state, and match-complete/next-match states.
Done when: every demo state has a deliberate screen design that remains readable at tablet distance and under harsh light.


P1 — Scoreboard animation
Add a small set of purposeful transitions only: point update, game/set win, CALL BLOCKED, changeover entrance, match complete, and next-match assignment. Motion must improve state comprehension rather than add decoration.
Done when: each demo-critical transition has a polished animation that does not delay input or obscure the authoritative score.


Execution order
1. CourtGuard ruleset coverage.
2. Doubles server/receiver order.
3. Tiebreak serving rotation.
4. Dispute workflow.
5. Centralized rule push.
6. Scoreboard visual system.
7. Scoreboard animation.


Stretch only after the golden path works
• Natural-language organizer controls.
• Advanced scenario simulation and alternative-objective tuning.
• Player notifications.
• Rule simulation / projected finish scenarios.
• Advanced ASR adaptation.
• Full bracket-management features.


Frozen project definition
CourtOS turns every tablet into a reliable autonomous court: it understands players’ score calls using the state of the match itself, enforces tennis rules locally, survives internet failure, synchronizes the tournament centrally, and automatically advances the event when a court becomes free.


Frozen architecture line
Voice (probabilistic) → typed intent → CourtGuard (deterministic) → match events → Tournament Twin (deterministic) → CourtOptimizer (deterministic) → real-world tournament.
