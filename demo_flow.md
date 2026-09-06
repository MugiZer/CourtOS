# CourtOS — Live Demo Flow

## Current running sequence — September 6, 2026

This revision supersedes the older Court 2 pacing, sponsor-at-opening sequence, and 55-versus-50 optimization example below. The detailed Court 1 correction, rejection, offline, and deciding-point interactions remain.

1. Open with Court 1 at 0–0 and Court 2 at 40–30. Court 2 has an accepted opening snapshot in history and no new-point notification.
2. Accept the first Court 1 point. Court 2 immediately reaches 40–40 and raises its dispute notification once. Restore its 40–30 snapshot through the organizer history. Court 1 keeps its independent game.
3. Complete the existing Court 1 game. The scheduler compares the best legal continuation for each first choice using configured estimates: singles 120 minutes, Express semifinal 40 minutes, Express final 30 minutes, and about 45 minutes remaining on Court 2.
4. Assign singles to Court 1. Show two players entering and waiting; do not begin or autoplay the singles match. Keep the saved comparison visible. Sponsor changeover remains an optional separate scenario.

| Choice | Court 1 | Court 2 | Projected finish |
|---|---|---|---|
| Singles first — selected | Singles 0–120 | Current semifinal 0–45; Express semifinal 45–85; Express final 85–115 | 120 min |
| Semifinal first — best continuation | Express semifinal 0–40; singles 40–160 | Current semifinal 0–45; Express final 45–75 | 160 min |

**40 projected minutes saved, 25% earlier.** Both alternatives use identical inputs and obey dependencies and player/court availability. Express rounds have no scheduled rest. These are scenario estimates, not measured savings. The primary display derives the difference from solver output and retains the original assignment timestamp.

Storage v2 opens this revised sequence for fresh sessions; reload preserves progress. Use Scenarios → Start live scoring to restart. Earlier detailed sections below are historical where they conflict with this revision.


Status: agreed narrative for the frontend design pass, updated September 5, 2026.

This document records the approved one-game demo with deterministic 3D rally choreography and the organizer dispute moved to Court 2. It is a demo specification, not evidence that the capabilities have been implemented or tested. No UI styling or frontend images are specified here.

## 1. Demo thesis

CourtOS lets players call the score, keeps matches running when the internet fails, and sends the next match to the right court automatically.

Play one complete game from **0–0 in points**. Use that game to demonstrate voice, correction, rejection, touch, offline recovery, and organizer intervention. Keep a two-court dashboard visible throughout. Court 2 demonstrates a sponsor changeover concurrently. End with the next match arriving on Court 1's tablet.

### Source authority

The repository sources read for this plan are:

- [architecture.md](https://github.com/MugiZer/CourtOS/blob/main/architecture.md): current architecture, scope, and authority boundaries. Lowercase filename is intentional; older `ARCHITECTURE.md` is not architectural authority.
- [Sponsor Challenge 06 — CourtSide AI.md](https://github.com/MugiZer/CourtOS/blob/main/Sponsor%20Challenge%2006%20%E2%80%94%20CourtSide%20AI.md): sponsor requirements and deliverable.
- [S-TIER-DECISION-CONTEXT.md](https://github.com/MugiZer/CourtOS/blob/main/S-TIER-DECISION-CONTEXT.md): demo framework and judging philosophy.

The user's subsequent edits govern the interaction choices recorded below.

### Locked interaction decisions

1. Saying **“Correction” automatically opens the touchscreen correction controls**. The command itself does not alter the score. The player uses touch to correct the mistaken point.
2. An impossible **“30–love” from 15–15 automatically opens touchscreen scoring choices**, alongside the blocked-call explanation. No additional tap is required to reveal the controls.
3. Those legal point choices are **30–15** and **15–30**. Cancel retains **15–15**; it is not another scoring outcome.
4. Touch controls remain available during ordinary play as well. “Opens” means foregrounding the relevant controls, not making touch inaccessible until voice fails.
5. Court 2's scripted player disagreement at deuce invokes the existing dispute workflow. The organizer selects a correct prior state; deuce itself is legal and does not require intervention.

## 2. Recommended live demo

Use the same eight beats. Allow roughly three to four minutes with short rallies and organizer interaction. Both means the court tablet view and organizer dashboard are visible together.

### Shared 3D choreography

Both courts use an abstract premium grass-court championship atmosphere with white-clad NPCs and restrained professional sports presentation. Use original presentation, without Wimbledon branding, logos, or copied trade dress. This is a direction for a later implementation, not a final visual design.

Use 3–5 second predetermined rally clips and a short reset for serve. After every Court 1 rally, NPCs reset and wait while the presenter calls the score. Only an accepted CourtGuard score makes the next rally eligible; rejected/unclear input, an open correction, or dispute leaves it paused. A script checkpoint can keep an eligible rally waiting while another court is demonstrated. Never advance twice for the same accepted event or for a server ACK.

The clip's winner guides the presenter; it does not authorize or silently repair a score. Voice still interprets human input, and the approved touch recoveries/final-point input use the existing path. The deliberate wrong-but-legal call in beat 2 is a checkpoint: keep the next rally paused until the player finishes correcting that same rally. The choreography is not an extra tennis validator.

Court 2's simulator submits its scripted point through CourtGuard after each rally and advances only after acceptance. Freeze, changeover, handshake, and new-player/warmup clips follow authoritative events. See [Demo 3D choreography](architecture.md#demo-3d-choreography) for the authority boundary.

### Beat 1 — Score naturally

- **Actor:** Player.
- **Screen visible:** Both.
- **Action:** Court 1 rally R1 visibly ends with Team A winning. NPCs reset and wait. From 0–0, say **“Fifteen-love.”** Acceptance at 15–0 enables R2.
- **Visible result:** Court 1 and the organizer update to **15–0**. Server and receiver are visible. Court 2 has a separate match and a running sponsor changeover.
- **Mechanism:** Live microphone → typed interpretation → CourtGuard → accepted point → local persistence → synchronization → Tournament Twin.
- **Sponsor proof:** Hands-free scoring and real-time multi-court updates.
- **Why it earns time:** The first interaction explains the product without technical vocabulary.
- **Narration:** “I call the score here; the organizer sees it there.”

### Beat 2 — Correct a mistaken point using touch

- **Actor:** Player.
- **Screen visible:** Both.
- **Action:** R2 visibly ends with Team B winning; the correct call is **“Fifteen-all.”** Preserve the approved correction proof: deliberately call **“Thirty-love”** instead, then say **“Correction.”** NPCs remain at the correction checkpoint. Touch controls open automatically; undo the mistaken point and award it to Team B. Only after this correction reaches 15–15 does R3 become eligible.
- **Visible result:** The erroneous **30–0** is corrected to **15–15**. Both displays agree. History preserves the original event and the appended correction activity.
- **Mechanism:** Voice correction intent opens correction mode; touch correction passes through CourtGuard. History is not deleted.
- **Sponsor proof:** The Correction keyword, tactile input, and recoverable self-scoring mistakes.
- **Why it earns time:** Demonstrates a real correction, rather than confusing the normal transition 15–0 → 15–15 with a correction.
- **Narration:** “That point went to the wrong team. ‘Correction’ opens the touch controls.”

Opening the correction controls leaves the score at 30–0 until the player acts. If undo and replacement are separate actions, the intermediate score is 15–0 and both events remain in history.

### Beat 3 — Block an impossible call and open touch automatically

- **Actor:** Player.
- **Screen visible:** Both.
- **Action:** R3 visibly ends with Team A winning. NPCs reset and wait for the correct **“Thirty-fifteen.”** The recognizer produces **“Thirty-love”** for this failure proof.
- **Visible result:** **CALL BLOCKED** explains that the opponent's point cannot disappear. The score stays **15–15**. Touch choices **30–15 / 15–30**, plus cancel, open automatically. Select **30–15**. NPCs stay waiting throughout rejection; only the accepted touch point enables R4.
- **Mechanism:** Deterministic legal-next-state validation rejects the impossible proposal. Touch produces a legal point through the same CourtGuard authority path.
- **Sponsor proof:** Safe handling of misinterpreted calls and immediate touchscreen fallback.
- **Why it earns time:** Makes the boundary between recognition and scoring authority visible.
- **Narration:** “That score is impossible. The tablet opens the legal touch choices automatically.”

This beat's terminal recognition outcome must be impossible/indefensible. The frozen ASR cascade may still recover a defensible legal interpretation from the same audio; an illegal primary candidate alone is not necessarily final rejection. Once the call is rejected, the controls open automatically. If exact recognizer behavior requires a fixture, label it as injected recognizer output and run it through the real decision path. Never silently substitute a canned result for live recognition. The animated Team A win must not silently turn the rejected Thirty-love into Thirty-fifteen.

### Beat 4 — Lose the network and keep playing

- **Actor:** Presenter, then player.
- **Screen visible:** Both.
- **Action:** Actually disconnect Court 1 from the network. R4 still plays locally and visibly ends with Team B winning. NPCs reset; call **“Thirty-all.”** The existing CourtVoice/CourtGuard path accepts the point locally. R5 then actually plays locally, without waiting for reconnect or a server ACK: Team A wins and NPCs reset, awaiting the next call in beat 6.
- **Visible result:** Tablet reaches **30–30**, showing local persistence and pending synchronization. Organizer retains **30–15**, marked disconnected/stale. Court 2 continues independently.
- **Mechanism:** Local clips, CourtGuard, and event persistence operate without the server. Unacknowledged events remain queued; only organizer synchronization stops.
- **Sponsor proof:** Internet loss does not stop the rally/score loop; the existing tactile fallback remains available.
- **Why it earns time:** The intentional difference between the displays proves local autonomy.
- **Narration:** “The connection is gone. The court still saves the next point.”

Offline recognition assumption: the architecture leaves ASR providers open. Do not introduce a new offline recognizer for this presentation. If the selected recognizer requires internet, use a clearly labeled deterministic recognizer-output fixture for the rehearsed offline utterance through the existing voice path; microphone capture, CourtGuard, persistence, and animation progression remain local. This proves local court continuity, not offline acoustic recognition. Touch remains the honest contingency if voice is unavailable. The implementation must not wait on a cloud timeout to advance a locally accepted point.

### Beat 5 — Publish upcoming rules while the other court operates

- **Actor:** Organizer and Court 2's lifecycle timer.
- **Screen visible:** Both.
- **Action:** Publish the upcoming mixed-doubles ruleset with **No-Ad** and a **10-point deciding match tiebreak**. Let Court 2's existing sponsor changeover finish.
- **Visible result:** Dashboard distinguishes active-match rules from the upcoming published version. Court 2 displays sponsor media and countdown, calls **“Time” at 80 seconds**, and returns to play at **90 seconds**.
- **Mechanism:** Versioned rules publication with active-match pinning; timestamp-driven sponsor/changeover lifecycle.
- **Sponsor proof:** Centralized rules distribution, sponsorship media, and explicit changeover audio alerts.
- **Why it earns time:** Uses the second court for real operational behavior while Court 1 demonstrates isolation from the server.
- **Narration:** “Upcoming matches get the new rules. Existing matches keep theirs, and the other court's break ends on time.”

Court 1 is offline: publication is not proof of delivery to that tablet. Show receipt after reconnect. Start Court 2's real 90-second break at demo opening. Rehearse the early beats around it; never delay the audio cue to match narration. If the cue occurs during a neighboring beat, acknowledge it then. Do not accelerate the clock or attach this ad to Court 1's match completion. Court 2 NPCs show changeover poses while the creative plays, then resume scripted rallies after the authoritative return to PLAYING. This preserves the opening sponsor break; later changeovers are shown only when legally reached.

### Beat 6 — Reconnect and reach deuce

- **Actor:** Presenter, then player.
- **Screen visible:** Both.
- **Action:** Restore the connection and show catch-up to 30–30. R5 already played locally; call **“Forty-thirty”** for that waiting rally. After acceptance, R6 ends with Team B winning; call **“Deuce.”** NPCs reset after each rally and wait for its accepted score. Hold the eligible deciding rally R7 while the organizer resolves Court 2's dispute.
- **Visible result:** Organizer first catches up to **30–30**; pending events receive ACKs. Then both displays advance to **40–30 → 40–40**, with **deciding point** shown under the existing No-Ad rules. Upcoming rules are received without changing M101's pinned ruleset.
- **Mechanism:** Ordered resend, event-ID deduplication, acknowledgment, and deterministic scoring under the pinned ruleset.
- **Sponsor proof:** Reconnect recovery, voice updates, and No-Ad match-state behavior.
- **Why it earns time:** Finishes the failure/recovery proof before the final court handoff.
- **Narration:** “The missing point arrives once. We keep playing under the same rules.”

### Beat 7 — Resolve Court 2's player dispute

- **Actor:** Court 2's scripted players and organizer.
- **Screen visible:** Both; organizer focuses Court 2 history while Court 1 waits at deuce.
- **Action:** After its opening changeover, Court 2's simulator legally builds to 30–30 (E, F, E, F win successive points). Immediately before the dispute, a rally won by Team E produces **40–30**; a rally won by Team F produces **40–40**. Each point uses the normal CourtGuard/event path. The scripted player disagreement disputes that last point. Organizer selects the prior **40–30 event/state**.
- **Visible result:** Court 2 freezes because a player disputes the point, not because deuce is illegal. The organizer sees both point events, appends a rollback to 40–30, and resumes. NPCs leave the frozen pose only on resume; their next rally begins from the restored authoritative state.
- **Mechanism:** Existing dispute state, history-based CourtGuard correction, append-only event record. Neither the animation nor organizer view directly writes the score.
- **Sponsor proof:** Central organizer intervention while a second court remains visible and independently usable.
- **Why it earns time:** Reuses the approved dispute beat on the autonomous court; it adds no second override workflow.
- **Narration:** “Those players dispute the last point. The organizer restores the agreed state, and their match resumes.”

After resolution Court 2 continues scripted legal play (Team F can win the replayed point, advantage, and game to reach 5–5). It stays occupied through Court 1's climax; any subsequent changeover follows CourtGuard's existing lifecycle. Its remaining duration is still the disclosed five-minute fixture estimate at the scheduling comparison, not a prediction made by the animation.

### Beat 8 — Finish the match and advance the tournament

- **Actor:** Player, then system.
- **Screen visible:** Both.
- **Action:** Release R7: Team A visibly wins the No-Ad deciding rally from **40–40**. NPCs reset and wait. Preserve the approved tactile final-point confirmation; only its accepted CourtGuard event completes the match. No new voice “Game” command is required.
- **Visible result:** **Game → set → match complete → result recorded → court free → schedule comparison → semifinal assigned → new players and warmup on the tablet.** The backend compares starting the longer-waiting consolation first (projected finish in 55 minutes) with starting Semifinal A first (50 minutes). Semifinal A wins; the consolation is planned for Court 2. The new match uses the published ruleset.
- **Mechanism:** CourtGuard completion → event → Tournament Twin → optimizer proposal → version check and tournament validation → assignment event → court lifecycle.
- **Sponsor proof:** Freed-court visibility, centralized operation, upcoming rules adoption, and removal of manual result reporting.
- **Why it earns time:** One legal point triggers a real scheduling choice across two courts, bracket dependencies, and player rest. This is the single climax.
- **Narration:** “The next match isn't the one waiting longest. It's the one that unlocks the final—without breaking either player's rest requirement.”

Moving the dispute to Court 2 leaves Court 1 at 40–40, so R7 now proves actual No-Ad deciding-point termination. Match-complete acceptance triggers the handshake; only the committed M103 assignment triggers new players entering and warmup.

## 3. Climax

The same tablet that scored the final point now shows different players preparing for the next match. No one walks to the desk, re-enters the result, or manually selects the next court assignment.

CourtOS chooses **Semifinal A ahead of the longer-waiting consolation match**. The dashboard shows the best continuation for each choice: **55 minutes versus 50 minutes to projected tournament finish**. It moves the consolation's planned placement to Court 2 and brings the projected final forward by five minutes. Both matches are eligible for either court; the advantage comes from unlocking the final earlier while respecting rest, not an artificial court restriction.

Expose a compact proof trace: **legal point → match complete → Twin version → validated plan → committed assignment**. The new players and warmup are the payoff; an “optimized” message alone is insufficient.

The optimizer proposes. The tournament engine checks the current version and constraints before committing. If validation fails or the proposal is stale, re-solve; do not display a proposal as an assignment.

## 4. Exact state flow

```text
COURT 1 — M101, final game
0–0
→ voice 15–love: 15–0
→ deliberately mistaken voice 30–love: 30–0
→ voice Correction: touch correction controls open; score unchanged
→ touch undo: 15–0
→ touch replacement point for B: 15–15
→ impossible voice 30–love: BLOCKED; touch choices open automatically
→ touch point for A: 30–15
→ NETWORK DISCONNECTED
→ local R4: B wins; spoken Thirty-all accepted: 30–30 locally
→ R5 plays locally: A wins; NPCs reset and wait; organizer remains 30–15
→ NETWORK RESTORED
→ queued events ACKed: both 30–30
→ voice 40–30: 40–30
→ voice Deuce: 40–40 / No-Ad deciding point
→ R7 eligible; presentation waits while organizer resolves Court 2 dispute
→ R7: A wins; accepted touch point: GAME / SET / MATCH COMPLETE
→ authoritative match-complete handshake
→ RESULT RECORDED / COURT FREE
→ RE-SOLVE: consolation first 55 min / semifinal first 50 min
→ PLAN VALIDATED / SEMIFINAL A ASSIGNED
→ M103 / NEW PLAYERS / WARMUP / PUBLISHED RULESET
→ M104 PLANNED FOR COURT 2 / M105 FINAL PROJECTED AFTER BOTH WINNERS REST

CONCURRENT COURT 2
90-second CHANGEOVER + sponsor media
→ elapsed 80 seconds: audible Time
→ elapsed 90 seconds: PLAYING / NPC rallies resume
→ legal scripted points to 30–30
→ rally E wins / CourtGuard accepts 40–30
→ rally F wins / CourtGuard accepts 40–40
→ scripted player disagreement / DISPUTE / FROZEN
→ organizer selects prior 40–30 event / append rollback / RESUME
→ NPC rallies continue through existing legal lifecycle

RULE PUBLICATION
upcoming mixed-doubles v2 published
→ active matches remain pinned
→ offline Court 1 receives publication after reconnect
→ M103 adopts v2 before starting
```

### Court 1 rally-to-score mapping

| Rally | Visible winner | Input while NPCs wait | Accepted result / release |
|---|---|---|---|
| R1 | A | Fifteen-love | 15–0; R2 eligible |
| R2 | B | Deliberate Thirty-love, then Correction and touch repair | 30–0 → 15–0 → 15–15; correction checkpoint holds R3 until repair completes |
| R3 | A | Recognizer produces impossible Thirty-love; select Thirty-fifteen by touch | Rejection stays 15–15; accepted touch reaches 30–15 and enables R4 |
| R4, offline | B | Thirty-all through existing voice path | Locally saved 30–30 starts R5 before any server ACK |
| R5, starts offline | A | Wait during rule publication; Forty-thirty after reconnect | 40–30; R6 eligible |
| R6 | B | Deuce | 40–40; R7 eligible, held during Court 2 organizer interaction |
| R7 | A | Existing touch confirmation of final point | Match complete; handshake, then assigned players/warmup on the respective events |

## 5. Deterministic fixture

All names, match timing, and assignments below are reversible demo assumptions. Seed legal event history, not isolated score labels. One real tablet drives Court 1. Court 2 uses a disclosed deterministic simulator through the normal court protocol; no second physical tablet is required.

| Match | Participants | Opening state |
|---|---|---|
| M101 / Court 1 | Team A: Alex Roy / Sam Chen; Team B: Morgan Dubois / Taylor Singh | Doubles No-Ad. Sets 6–4, 4–6; Team A leads deciding set 5–4. Current game starts 0–0. Team A serves. |
| M102 / Court 2 / Semifinal B | Team E: Camille Martin / Jules Bernard; Team F: Maya Laurent / Louis Pelletier | Mixed doubles. Sets 6–4, 4–6; deciding set 5–4, points 0–0; 90-second changeover starts at demo opening. Remains occupied through the climax, with an estimated 5 minutes left at that point. |
| M103 / waiting / Semifinal A | Team C: Noor Ali / Émile Gagnon; Team D: Léa Tremblay / Owen Park | Mixed doubles. All players ready and rested; no unresolved prerequisites; compatible with either court. Estimated occupancy 20 minutes. Receives published mixed-doubles v2. |
| M104 / waiting / consolation | Riley Tran vs Jordan Moreau | Singles. Waiting longer than M103; both players ready and rested, distinct from all other match participants. Compatible with either court. Estimated occupancy 10 minutes. |
| M105 / future / final | Winner of M103 vs winner of M102 | Mixed doubles. Requires both semifinal results and 10 minutes' rest for every finalist after their semifinal. Estimated occupancy 20 minutes. Compatible with either court. Participants remain symbolic until results resolve. |

### Rules and service

- **M101:** `DOUBLES_NO_AD v1`, best of three ordinary sets, six games by two, seven-point set tiebreak at 6–6. Started match remains pinned. Final result after the demo: **6–4, 4–6, 6–4** to Team A.
- **M102:** `MIXED_DOUBLES v1`, advantage scoring, full deciding set, and 90-second changeovers; remains pinned.
- **M103 before publication:** upcoming `MIXED_DOUBLES v1`, advantage scoring/full deciding set.
- **Published M103 policy:** `MIXED_DOUBLES v2`, No-Ad plus ten-point deciding match tiebreak, win by two. This is distributed centrally for applicable upcoming matches.
- **M104:** `STANDARD_SINGLES v1`; unaffected by the mixed-doubles publication.
- **M105:** upcoming mixed-doubles final; adopts published v2 before starting. The 10-minute minimum between-match rest is separate from the 90-second in-match changeover.
- Seed M101's deciding-set service order as **Morgan → Alex → Taylor → Sam**. Alex serves game ten. Team B's deuce receiver is Morgan and ad receiver is Taylor. CourtGuard derives indicators from the seeded history.
- At Court 1 No-Ad deuce, record the required receiver-side choice before R7. The dispute now occurs on Court 2; Court 1 plays its deciding point.
- One preloaded sponsor creative is attached to the tournament and available locally before the demo. Its playback must not interfere with the Time cue.

### Optimization choice — unlock the final

Use the actual M101 completion as time zero for the comparison below. At that moment Court 1 is free; Court 2 has an estimated 5 minutes of Semifinal B remaining. Duration estimates include warmup/court occupancy, and both waiting matches can use either court. M101 belongs to a separate completed draw with no further dependencies. M102–M105 are the remaining tournament workload.

For this fixture, set the objective weight for projected tournament finish to 1 and the waiting-time, idle-time, and churn weights to 0. This makes the objective explicit while preserving all hard constraints. M103 and M104 are only PLANNED, so no announced or playing assignment is displaced.

| Immediate choice on Court 1 | Best feasible continuation | Projected tournament finish |
|---|---|---|
| M104 consolation first | Court 1: M104 at 0–10. Court 2: M102 finishes at 5, then M103 at 5–25. Finalists from M102 are rested at 15; finalists from M103 at 35. M105 runs 35–55. | **55 minutes** |
| **M103 Semifinal A first** | Court 1: M103 at 0–20. Court 2: M102 finishes at 5, then M104 at 5–15. Finalists from M102 are rested at 15; finalists from M103 at 30. M105 runs 30–50. | **50 minutes — selected** |

The consolation-first baseline is **55, not 60 minutes**: its best continuation starts M103 on Court 2 at minute 5 instead of unnecessarily waiting for Court 1 until minute 10. Compare against the best legal alternative, not a deliberately inefficient schedule. All savings are projections from fixture estimates, not measured time saved.

### Live backend and dashboard proof

1. Before the final point, show the current provisional two-court schedule and waiting matches. M104 has waited longer; M105 shows both semifinal dependencies and the rest requirement.
2. M101's actual completion updates the Tournament Twin and triggers a new solve from observed court availability.
3. Calculate the best feasible schedule conditional on each ready match starting next on Court 1. Show **consolation first: 55 min / semifinal first: 50 min** using backend results, not hardcoded labels.
4. Validate the selected plan against the current Twin version and constraints, then commit M103 to Court 1. Its players appear on the tablet in warmup.
5. Keep M104's Court 2 placement provisional. M105 remains a symbolic future projection until both participants, prerequisites, and rest eligibility resolve; do not announce or commit it prematurely.
6. Re-solve on subsequent reality changes. Disconnection/reconnection also trigger reconsideration, but Court 1 stays occupied throughout its outage. Court 2's sponsor changeover is part of its active semifinal, not a free-court window.

The backend may enumerate this small fixture's feasible schedules; no particular solver library is required. Its trace must include input estimates, Twin version, objective values, dependency/rest checks, and the committed assignment. Freeze estimates during this comparison; the demo does not claim point-by-point duration prediction.

## 6. Frontend state inventory

These are behavioral states within the court and organizer surfaces, not separate pages or styling instructions.

### Court tablet

- Playing: points, games, sets, teams, server, receiver, active ruleset, always-available touch controls.
- Predetermined rally, visible point outcome, reset/wait-for-score, and accepted-event release; the next rally remains paused during rejection/correction.
- Locally running rally/wait loop while disconnected; no animation dependency on server ACK.
- Match-complete handshake and newly assigned players entering/warmup, triggered by their authoritative lifecycle events.
- Voice listening and interpretation pending, without speculative score mutation.
- Correction mode opened by the spoken Correction command; touch undo/replacement actions and cancel.
- Impossible call blocked, with reason and legal touch choices opened automatically.
- Accepted voice or touch point with authoritative score update.
- Offline scoring with local-save and pending-sync status.
- Reconnecting/synchronizing, then acknowledged catch-up.
- No-Ad deuce/deciding-point state and receiver-side choice as required by the rules.
- Court 2 dispute/frozen pose, then corrected/resumed state; Court 1 remains at its inter-rally checkpoint.
- Match complete with final result and sync status.
- Awaiting assignment, then committed next match and warmup with applicable ruleset.
- Changeover with sponsor media, countdown, 80-second audio cue, and return to play; exercised by Court 2's simulated node.
- Contingency: voice unclear/unavailable with usable touch; legal ambiguity confirmation if needed during live recognition.

### Organizer dashboard

- Persistent two-court overview with scores, server, lifecycle, connectivity, and ruleset versions.
- Accepted score updates and recent history.
- Blocked voice alert; distinction between rejected proposals and scored points.
- Disconnected court with explicitly stale last-known score.
- Upcoming rules controls and publication result; active pinning and delivery status.
- Court 2 sponsor/changeover state and return to playing.
- Court 1 catching up and synchronized.
- Court 2 dispute queue/state after 30–30 → 40–30 → 40–40, prior-event selection, appended resolution, and resume.
- Both courts' 3D presentation state accompanies their actual match status; no simulated dashboard-only score changes.
- Match result, freed court, solver activity, validated assignment, and next-match identity.
- Provisional two-court schedule, waiting age, final's semifinal dependencies, and 10-minute rest eligibility.
- Backend-generated alternative comparison: consolation first 55 minutes versus semifinal first 50 minutes; distinguish projected future matches from the committed immediate assignment.
- Judge trace: transcript/candidate, fallback status, CourtGuard decision, event ID/sequence, ACK state, Twin version, assignment validation.
- Contingency: stale proposal/no valid assignment, without pretending a plan has been committed.

### Presentation requirements

- Keep both court identities visible so Court 2 never looks like a duplicate of Court 1.
- Giant readable points, clear games/sets hierarchy, ultra-high contrast, and audible Time cue are requirements for the later UI pass.
- Connectivity status remains visible while correction, rejection, or dispute controls are open.
- Use a tablet projection path that survives the intentional network outage, such as wired display capture.

## 7. Main-stage coverage and secondary proofs

| Sponsor capability or constraint | Main-stage coverage | Secondary proof / limit |
|---|---|---|
| Hands-free score calls and Correction | Live score calls; Correction opens touch correction mode | Fault and other narrow-vocabulary commands available if asked |
| Noisy/ accented recognition | Use a real microphone, optionally modest background court noise | Actual accented recordings and adjacent-court tests; scripted errors do not establish acoustic robustness |
| Impossible interpretation and tactile fallback | Rejection automatically opens legal touch choices | Same-audio successful cascade recovery and two-legal-candidate confirmation retained as secondary proofs |
| Real-time two-court dashboard | Persistent dashboard, independent Court 2 lifecycle, catch-up | Court 2 simulation disclosed |
| Singles, doubles, mixed doubles | Singles consolation in the waiting schedule, active doubles on Court 1, mixed-doubles semifinal on Court 2 and assigned next | Singles scoring is secondary; mere presence is not full format correctness proof |
| No-Ad | Court 1 reaches deuce and plays the winning deciding point | Court 2 dispute does not change Court 1 rules/state |
| Doubles server/receiver order | Visible derived indicators | Tiebreak 1-2-2 rotation and receiver-order fixture |
| Fast-Play / Express without rest | Not in the main sequence | Prepared no-rest fixture; keep sponsor break on a rest-enabled format |
| Sponsor audio/video | Preloaded media on a genuine changeover | Creative selection/upload and tournament attachment available if asked |
| Time at 80 seconds of 90-second rest | Real timestamp-based cue and return to play | Do not substitute accelerated timing |
| Centralized rules push | Upcoming No-Ad/ten-point tiebreak policy, active pinning, next-match adoption | Serve-clock policy behavior requires separate implementation verification |
| Offline operation and local recording | Real disconnection, local rally → spoken score → accepted event → next-rally eligibility | If ASR is cloud-only, disclose the offline recognizer-output fixture; touch contingency, refresh recovery, and duplicate-delivery tests |
| Reconnect synchronization | Pending events ACKed; organizer catches up | Same offline point recorded once, not just matching labels |
| Disputes/manual override | Court 2 scripted disagreement freezes play; organizer restores prior state, appends correction, resumes NPC rallies | Deuce itself is not an error; no rule mutation |
| Freed court and tournament advancement | Backend compares two legal choices using both courts, semifinal dependencies, and rest; commits the semifinal and shows warmup | Later semifinal completion/final readiness and stale-plan rejection tested separately |
| Outdoor readability / heat | High-contrast, large-text frontend requirement | Actual glare and thermal behavior not proven by indoor presentation |
| 24-hour, two-court deliverable | One real scorer tablet, one organizer dashboard, two represented courts using Socket.IO | No additional infrastructure needed for this plan |

## 8. Architecture boundaries

**Probabilistic ML interprets humans. Deterministic systems own tennis and tournament state.**

- Voice opens correction mode or proposes a score; it cannot directly rewrite match state.
- All scoring and correction actions, including touch and organizer resolution, pass through CourtGuard.
- Impossible-call rejection changes interaction/trace state, not the authoritative score.
- Court event history remains append-only and canonical for its match; corrections do not erase mistakes.
- During disconnection the organizer does not silently alter live court scoring. The staged organizer dispute targets connected Court 2 after Court 1's reconnection.
- Published scoring rules apply to upcoming matches. M101 never changes rules at deuce or after reconnect.
- The optimizer proposes assignments; the tournament engine validates and commits against current Twin state.
- Sponsor media belongs to changeover state. Match completion is not used as a fabricated changeover.
- The 3D layer consumes authoritative state; it never sets scores, bypasses CourtGuard, mutates the Twin, or fakes organizer updates. Scripted outcomes are presentation, not scoring authority.

## 9. Cut from the main presentation

- Additional normal scoring calls beyond the chosen sequence: they add little new proof.
- A separate legal-ambiguity scene or forced cascade recovery: useful secondary tests, but the chosen game already contains two recovery interactions.
- Live format switching, Express walkthrough, and tiebreak lessons: keep focused fixtures for questions.
- Sponsor upload and media administration: preload the creative.
- Additional optimizer scenarios or unverified time-saved claims: show only the computed 55-versus-50-minute choice; label the five-minute improvement as projected.
- Long history exploration: expose only the entries that prove correction, rejection, replay, and assignment.

## 10. Rehearsal and verification

### Required checks before presenting

- Replay this exact point sequence from a deterministic seed; no hidden score jumps during the demo.
- Verify Correction opens touch correction controls immediately without changing the score.
- Verify rejected 30–love from 15–15 automatically opens 30–15 / 15–30 choices and cancel; score changes only after selection.
- Verify the wrong 30–love in beat 2 is legal from 15–0, while the same words in beat 3 are illegal from 15–15.
- Verify every Court 1 rally resets and waits for accepted CourtGuard scoring; correction checkpoints and rejected calls cannot start another rally. The visual winner never silently repairs a call.
- Verify local acceptance starts R5 during the outage; reconnect/ACK cannot replay either rally or advance the script a second time. Disclose recognizer-output fixtures; do not claim new offline ASR capability.
- Verify Court 2's 30–30 → 40–30 → 40–40 sequence uses legal events; a separate player disagreement triggers the dispute. Its rollback remains append-only and resumes from the selected complete prior state.
- Verify no animation callback writes a score or Twin state; handshake and player-entry visuals follow match completion and assignment respectively.
- Verify player correction and organizer rollback preserve append-only history and synchronize correctly.
- Verify the real disconnection preserves local rally/score progression, touch fallback, and persistence; the dashboard labels its score stale.
- Verify pending events clear only after ACK and duplicate delivery does not score an extra point.
- Verify upcoming rules publication is not marked delivered to the offline tablet until reconnect; active rules remain pinned.
- Verify the real 80/90-second sponsor timing, local media availability, microphone, and projected audio.
- Verify the final score is 6–4, 4–6, 6–4; Court 1 becomes free only after valid match completion.
- Verify the next match is displayed as assigned only after tournament validation and commit; new rules apply before it starts.
- Verify both conditional schedules are generated from fixture inputs: consolation-first finishes at 55 minutes and semifinal-first at 50. The baseline must use Court 2 at minute 5.
- Verify the final starts no earlier than the later semifinal completion plus 10 minutes' rest. Unknown winners remain symbolic and unassigned.
- Verify all court/player overlaps, readiness, and dependencies are checked. M104 and M105 remain provisional after M103 is committed.
- Verify actual match completion triggers a fresh solve, and a Twin version change during solving causes stale output to be discarded.
- Verify an input change affects the selected match: in a secondary fixture, extend M104 occupancy from 10 to 60 minutes. Consolation-first now finishes at 60 minutes (M104 at 0–60; M103 on Court 2 at 5–25; final at 35–55), versus 65 for semifinal-first (M103 at 0–20; M104 on Court 2 at 5–65; final at 30–50). The selected first match must switch to M104.
- Verify the tablet projection remains visible during network loss.
- Rehearse touch fallback if the live microphone fails. Disclose any injected recognition fixture.

### S-tier check

- **Ten-second comprehension:** the first spoken call changes both displays.
- **Single climax:** the final point delivers new players to the court tablet.
- **Visible technical mechanism:** state-aware rejection, explicit correction history, offline ACKs, and a computed choice across two courts with bracket dependencies and rest constraints.
- **Failure strengthens the story:** a rejected call and a disconnected court both recover visibly.
- **Weekend-shaped reliability:** one real court, one disclosed simulated court, deterministic seed, short predetermined local animations, one sponsor creative, and touch available throughout.
- **Authentic builder connection:** not supplied in the source documents; add only a truthful team-specific sentence to the spoken introduction if available.

This plan is verified against the stated source boundaries and user edits. Runtime behavior remains to be implemented/tested. Sponsor IP acknowledgment is an administrative requirement outside this demo flow.
