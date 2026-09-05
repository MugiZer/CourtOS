# CourtOS Architecture

> **Purpose:** this file is the durable architectural context map for CourtOS. Future agents should read it before making structural changes. New architectural decisions should update or append this document rather than creating parallel sources of truth.
>
> **Project thesis:** probabilistic ML interprets humans; deterministic systems own tennis and tournament state.

---

## 1. Product definition

**CourtOS turns every tablet into a reliable autonomous court:** it understands players’ score calls using the state of the match itself, enforces tennis rules locally, survives internet failure, synchronizes the tournament centrally, and automatically advances the event when a court becomes free.

### Core architectural line

```text
Voice (probabilistic)
    ↓
typed intent
    ↓
CourtGuard (deterministic)
    ↓
match events
    ↓
Tournament Twin (deterministic)
    ↓
CourtOptimizer (deterministic)
    ↓
real-world tournament
```

### Authority boundaries

- **ML / ASR:** authoritative over nothing. It proposes interpretations.
- **CourtGuard:** authoritative over score, games, sets, tiebreaks, service/receiver order, corrections, and match completion.
- **Tournament Twin / tournament engine:** authoritative over court assignments, match readiness, player availability, and ruleset versions.
- **Append-only event log:** authoritative over what happened.
- **CourtOptimizer:** proposes a plan; it never mutates authoritative state directly.

---

## 2. Hackathon scope and non-goals

### Must ship

- 1 real court tablet UI.
- 1 organizer dashboard showing 2 courts.
- Voice scoring with a narrow tennis vocabulary.
- Deterministic legal-transition verification.
- Tactile fallback through the same CourtGuard path.
- Singles plus doubles / No-Ad / tiebreak support sufficient for demo.
- Local event persistence and reconnect recovery.
- Real-time court ↔ organizer sync.
- Receding-horizon global court-assignment optimization.
- One polished sponsor changeover flow.
- Minimal centralized rule push for upcoming matches.
- Minimal dispute/rollback workflow.

### Explicit non-goals for the hackathon

- Ball tracking / line calling / Hawk-Eye.
- Full registration or bracket-generation platform.
- Payments or player accounts.
- Sponsor marketplace.
- Native mobile apps.
- Sophisticated speaker identification.
- Exhaustive professional-tour edge cases.
- Production-grade server disaster recovery.
- Mid-match mutation of scoring rules.

---

## 3. Simplest chosen stack

The stack is intentionally minimal. Complexity belongs in CourtGuard, voice interpretation, event consistency, and optimization — not infrastructure.

```text
Frontend
- React
- TypeScript
- Vite

Realtime
- Socket.IO

Court persistence
- localStorage

Server
- one Node.js / TypeScript process
- in-memory Tournament Twin

Database
- none

Auth
- none

ORM
- none

Microservices
- none
```

### Single-repo topology

```text
                    ONE REPO

              React / Vite app
          ┌──────────────────────┐
          │ /court               │
          │ /organizer           │
          └──────────┬───────────┘
                     │
                  Socket.IO
                     │
          ┌──────────▼───────────┐
          │ Node / TS server     │
          │                      │
          │ Tournament Twin      │
          │ CourtOptimizer       │
          │ in-memory Maps       │
          └──────────────────────┘
```

### Why Socket.IO

Use Socket.IO instead of raw WebSockets because it removes glue:

- reconnect handling
- named events
- acknowledgements
- JSON serialization
- broadcast
- connection state
- optional rooms later

### Why no database

The demo has tiny state volume and only two courts. Court-side resilience is handled locally in the browser. The central process may restart and reload fixture state if needed; server durability is not part of the sponsor’s core offline requirement.

---

## 4. Autonomous court node

Each court is an autonomous client. Losing the server must not stop the match.

```text
Court Tablet
├── CourtGuard
├── current ruleset
├── voice controller
├── tactile controls
├── changeover timers
├── local event log
└── Socket.IO sync
```

### Offline behavior

```text
voice / touch
    ↓
CourtGuard
    ↓
accepted event
    ↓
localStorage event log
    ↓
Socket.IO if connected
```

When disconnected:

- scoring continues
- touch continues
- rules continue
- corrections continue
- changeover timers continue
- events are persisted locally
- organizer sync pauses

On reconnect:

```text
reconnect
   ↓
find unsynced local events
   ↓
re-send in sequence order
   ↓
server ACK
   ↓
mark synced
```

### Local event shape

```ts
type CourtEvent = {
  id: string;
  sequence: number;
  courtId: string;
  matchId: string;
  timestamp: number;
  type: string;
  payload: unknown;
  synced: boolean;
};
```

The court event log for a live match is canonical for that court’s scoring history.

---

## 5. Voice architecture

### Frozen voice flow

```text
microphone
   ↓
audio preprocessing / VAD / noise suppression / wake phrase
   ↓
2–4 second buffered utterance
   ↓
primary ASR
   ↓
tennis-intent normalization
   ↓
current-match-state constrained ranking
   ↓
clear result ───────────────────────→ CourtGuard
   │
   └ weak / ambiguous / illegal
                ↓
      fallback ASR on SAME audio
                ↓
      deterministic evidence fusion
                ↓
       CourtGuard OR confirmation/touch
```

This is deliberately a **two-stage cascade**, not a many-provider ensemble.

### Tiny vocabulary

Canonical command/intent vocabulary should remain intentionally small:

- love
- fifteen
- thirty
- forty
- deuce
- advantage
- correction
- fault
- let
- yes / no for confirmation
- optionally undo

Canonical typed intents:

```ts
type TennisIntent =
  | { type: "SCORE_CALL"; score: CanonicalScore }
  | { type: "CORRECTION" }
  | { type: "FAULT" }
  | { type: "LET" }
  | { type: "CONFIRM_YES" }
  | { type: "CONFIRM_NO" };
```

### State-aware interpretation

At `30–15`, CourtOS does not ask an unrestricted speech model what sentence was spoken. It asks which currently plausible tennis intent is best supported by the audio.

Possible local outcomes might be:

```text
30–15
├── Team A wins point → 40–15
├── Team B wins point → 30–all
├── Correction
├── Fault
└── Let
```

### Adjacent-court defense

Layered defense:

- VAD
- wake phrase
- short authoritative listening window
- tiny tennis vocabulary
- state-aware ranking

If adjacent speech is weak or inconsistent with current match state, reject or escalate.

If adjacent-court speech happens to produce an equally legal local score, CourtOS must **not pretend rules can disambiguate it**. It surfaces uncertainty and asks the player.

### Primary decision policy

- Clear + legal primary candidate with a strong margin → CourtGuard.
- Weak confidence, small margin between legal candidates, or illegal primary interpretation → fallback ASR on the same buffered utterance.

### Fallback fusion policy

- Primary and fallback agree on same legal intent → CourtGuard.
- They disagree and one candidate is illegal → prefer the legal candidate only if the fallback clears its own minimum evidence threshold.
- They disagree and both candidates are legal → do not guess; enter confirmation state.
- Neither is defensible → `VOICE UNCLEAR` and use tactile controls.

Do **not** directly average confidence values across providers. Provider confidence scores are not guaranteed to be calibrated against each other.

### Confirmation state

```text
"Did you say 40–15?"
        ↓
voice yes/no OR touch
        ↓
CourtGuard
```

No authoritative match state mutates until CourtGuard accepts the final typed intent.

### Tactile fallback

Touch is a first-class peer to voice, not an error path.

```text
voice intent ─┐
              ├→ CourtGuard transition() → event log
 touch event ─┘
```

### Four demo-critical voice paths

1. **Golden path** — primary ASR clear; score updates immediately.
2. **Cascade recovery** — primary weak/wrong/illegal; fallback recovers intended legal call from same audio.
3. **Legal ambiguity** — both legal interpretations plausible; CourtOS asks player.
4. **Complete failure** — both recognizers unusable; tactile input continues through same authority layer.

### Suggested package structure

```text
packages/
  voice/
    audio/
      capture.ts
      vad.ts
      buffer.ts
    asr/
      primary.ts
      fallback.ts
      types.ts
    tennis-language/
      normalize.ts
      vocabulary.ts
      enumerateCandidates.ts
    arbitration/
      rank.ts
      cascade.ts
      fuse.ts
      policy.ts
    controller/
      voiceController.ts
```

Public API:

```ts
interpretScoreCall({
  audio,
  matchState,
  ruleset
}): Promise<VoiceInterpretation>
```

Possible result categories:

```ts
ACCEPT
CONFIRM
REJECT
```

CourtGuard remains outside the voice package.

---

## 6. CourtGuard: deterministic tennis engine

CourtGuard is a pure deterministic TypeScript reducer/state machine.

```ts
transition(
  currentMatchState,
  proposedEvent,
  compiledRuleset
): AcceptedTransition | RejectedTransition
```

No LLM is allowed inside this layer.

CourtGuard owns:

- points
- games
- sets
- singles
- doubles / mixed doubles
- No-Ad
- tiebreaks
- 10-point match tiebreaks
- express / fast-play policy inputs
- server / receiver order
- corrections / rollback
- changeovers
- clocks
- match completion
- legal transition verification

### Primitive event

The preferred primitive scoring event is:

```ts
{ type: "POINT_WON", winner: TeamId }
```

The engine derives the resulting tennis score.

Voice score calls are resolved by comparing the spoken resulting score against the engine’s legal next states.

Example:

```text
Current: 30–30

If A wins → 40–30
If B wins → 30–40

Voice says: 40–30
→ exactly one legal transition matches
→ resolve to POINT_WON(A)
→ CourtGuard commits
```

### `legalNextStates()` is a first-class API

```ts
legalNextStates(
  state: MatchState,
  rules: CompiledRuleset
): LegalTransition[]
```

This one mechanism powers:

- CourtGuard correctness
- voice candidate ranking
- impossible-call rejection
- tactile controls
- debug explanations
- exhaustive/property-based testing

### Internal score representation

Do not store tennis display strings as authoritative state.

Prefer numeric internal counters and derive presentation labels.

```text
0 → Love
1 → 15
2 → 30
3 → 40
```

Advantage and tiebreak logic should be mathematical, not string-driven.

---

## 7. Ruleset architecture

### One engine, parameterized by declarative versioned rulesets

Do **not** build separate singles, doubles, No-Ad, or Express engines.

```text
Versioned RulesetDefinition
          ↓
     RuleCompiler
          ↓
    CompiledRuleset
          ↓
MatchState + MatchEvent
          ↓
      CourtGuard
```

### Example definition

```ts
type RulesetDefinition = {
  id: string;
  version: number;

  participants: {
    mode: "SINGLES" | "DOUBLES";
  };

  game: {
    scoring: "ADVANTAGE" | "NO_AD";
  };

  set: {
    gamesToWin: number;
    winByGames: number;
    tiebreak?: {
      atGames: [number, number];
      pointsToWin: number;
      winByPoints: number;
    };
  };

  decidingSet:
    | { kind: "NORMAL_SET" }
    | {
        kind: "MATCH_TIEBREAK";
        pointsToWin: number;
        winByPoints: number;
      };
};
```

### RuleCompiler

```ts
compileRuleset(definition): CompiledRuleset
```

The compiler validates impossible configuration before the reducer sees it.

Examples of invalid config:

- `gamesToWin <= 0`
- `pointsToWin <= 0`
- `winByPoints <= 0`
- nonsensical tiebreak trigger

Compiled policies may include:

```ts
type CompiledRuleset = {
  gameWinner(state): TeamId | null;
  setWinner(state): TeamId | null;
  shouldStartTiebreak(state): boolean;
  shouldStartMatchTiebreak(state): boolean;
  tiebreakWinner(state): TeamId | null;
  legalEvents(state): MatchEvent[];
  nextPhase(state): MatchPhase;
};
```

### Demo rule presets

At minimum:

- Standard Singles
- Standard Doubles
- No-Ad Doubles
- Express / Fast-Play variant represented through the same ruleset model
- 10-point deciding match tiebreak option

### No-Ad behavior

Normal advantage game:

```text
40–40 → Advantage → Game
```

No-Ad:

```text
40–40 → next point wins Game
```

### 10-point deciding match tiebreak

Treat this as a distinct match phase, not a fake third set.

```text
Set 1
Set 2
MATCH_TIEBREAK
```

Winning condition:

```text
pointsToWin = 10
winByPoints = 2
```

Examples:

```text
10–8  → over
10–9  → not over
11–9  → over
12–10 → over
```

### Ruleset version pinning

Each match stores:

```ts
rulesetId
rulesetVersion
```

A started match is pinned to the ruleset version it began with.

---

## 8. Doubles service / receiver model

CourtGuard must explicitly track who is legally allowed to serve and receive next.

Suggested state:

```ts
type ServiceState = {
  servingTeam: TeamId;
  server: PlayerId;
  receivingTeam: TeamId;
  deuceReceiver: PlayerId;
  adReceiver: PlayerId;
  serviceOrder: PlayerId[];
  tiebreakPointNumber?: number;
};
```

The exact deterministic advancement rules live inside CourtGuard, never UI code.

### Tiebreak service rotation

Tiebreak serving follows the standard `1-2-2-2...` sequence.

The engine derives the next server from tiebreak point number and service order, rather than manually mutating ad hoc UI state.

Strong invariant:

> CourtOS does not just track score; it tracks who is legally allowed to serve and receive next.

---

## 9. Event-sourced state

The source of truth is the event history, not only the displayed score.

Each event should capture enough information for deterministic replay and debugging:

```ts
type MatchEventRecord = {
  id: string;
  courtId: string;
  matchId: string;
  sequence: number;
  timestamp: number;
  source: "VOICE" | "TOUCH" | "ORGANIZER" | "SYSTEM";
  transcript?: string;
  candidates?: unknown[];
  proposedIntent?: unknown;
  previousState: MatchState;
  decision: "ACCEPTED" | "REJECTED";
  rejectionReason?: string;
  resultingState: MatchState;
};
```

Benefits:

- correction
- dispute handling
- replay
- auditability
- offline recovery
- reconciliation
- deterministic reconstruction
- judge/debug proof trace

---

## 10. Dispute handling

Keep this intentionally simple for the demo.

```text
PLAYING
  ↓
DISPUTE
  ↓
SCORING FROZEN
  ↓
organizer sees recent score/event history
  ↓
organizer selects the correct prior score
  ↓
append rollback/correction event
  ↓
RESUME
```

There is no need for a three-button `KEEP / CORRECT / ROLLBACK` taxonomy.

The organizer answers one question:

> **What score should we return to?**

History is never deleted. The resolution is appended as a new event.

Example:

```text
30–15
40–15
40–30
DISPUTE
↓
Organizer selects 40–15
↓
SCORE_ROLLBACK { from: 40–30, to: 40–15 }
↓
resume
```

---

## 11. Realtime synchronization protocol

### Court → server

Suggested Socket.IO event families:

```text
court:event
court:sync
court:status
```

### Server → clients

```text
tournament:update
court:update
ruleset:published
assignment:update
```

### ACK policy

Court events remain `synced: false` locally until the server acknowledges receipt.

### Reconnect / dedupe

Use deterministic event IDs plus monotonically increasing per-match/per-court sequence numbers.

The server should ignore duplicate event IDs and request or accept missing sequence ranges.

### Conflict policy

For hackathon scope:

- court tablet is authoritative for live match scoring
- sequence-numbered court event log is canonical for that match
- organizer should not silently mutate live court scoring while that court is offline
- if conflicting organizer intervention occurs, surface an explicit reconciliation state rather than silently merging

---

## 12. Tournament Twin

The server maintains a deterministic live model of the tournament.

```ts
type TournamentTwin = {
  version: number;
  courts: Map<CourtId, CourtState>;
  matches: Map<MatchId, MatchStateSummary>;
  players: Map<PlayerId, PlayerState>;
  assignments: Map<CourtId, Assignment>;
  rulesets: Map<RulesetKey, RulesetDefinition>;
  connectivity: Map<CourtId, ConnectivityState>;
  sponsorState: SponsorState;
};
```

It represents:

- courts
- matches
- players / teams
- bracket dependencies
- rulesets
- assignments
- readiness
- availability
- connectivity
- event history
- sponsor / changeover state

It is not AI.

---

## 13. CourtOptimizer

CourtOptimizer is a **global receding-horizon constraint optimizer**.

It does not greedily pick the next match for one free court. It asks:

> Given all courts, matches, players, dependencies, rest requirements, and current conditions, what is the best near-term schedule across the whole tournament?

### Decision variables

For match `m`, court `c`:

```text
x[m,c] ∈ {0,1}
```

Also planned start/end times:

```text
s_m
e_m = s_m + duration_m
```

Ongoing matches are fixed intervals.

### Hard constraints

Inviolable:

- no court overlap
- no player overlap
- bracket prerequisites completed
- required player rest
- court compatibility
- division/tournament restrictions
- match readiness
- one match per court at a time
- playing matches immutable

### Soft objective

Minimize a weighted combination of:

- projected tournament makespan
- total player waiting time
- court idle time
- schedule churn

### Churn semantics

Suggested statuses:

```text
PLANNED   → cheap to move
ANNOUNCED → expensive to move
WARMUP    → nearly fixed
PLAYING   → fixed
```

### Receding-horizon triggers

Re-solve when reality changes:

```text
MATCH_FINISHED
PLAYER_READY
PLAYER_DELAYED
COURT_OFFLINE
COURT_ONLINE
MATCH_WITHDRAWN
RULE_CHANGED
```

### Unknown future winners

Unknown bracket winners may be represented symbolically for projection, but only commit assignments whose participants and prerequisites are resolved.

### Stale-plan protection

Every solve returns an `AssignmentPlan` tied to Tournament Twin version.

```ts
type AssignmentPlan = {
  basedOnStateVersion: number;
  assignments: Assignment[];
  projectedFinishTime: number;
  objectiveBreakdown: unknown;
};
```

Before commit:

```text
if currentTwin.version === plan.basedOnStateVersion
    validate and append assignment events
else
    discard stale plan and re-solve
```

The optimizer never mutates the Tournament Twin directly.

### Architectural symmetry

> CourtGuard answers **“which match states are legal?”**
>
> CourtOptimizer answers **“among legal near-term tournament schedules, which one is best?”**

### Suggested package structure

```text
packages/
  tennis-engine/
  tournament-core/
  optimizer/
    model.ts
    variables.ts
    hardConstraints.ts
    objective.ts
    solve.ts
    explain.ts
    scenarios.ts
```

Solver implementation remains an implementation choice; the architecture is constraint-based and receding-horizon regardless of the specific library.

---

## 14. Automatic court lifecycle

```text
WAITING
  ↓
WARMUP
  ↓
PLAYING
  ↓
CHANGEOVER
  ↓
PLAYING
  ↓
MATCH_COMPLETE
  ↓
RESULT_RECORDED
  ↓
COURT_FREE
  ↓
NEXT_MATCH_ASSIGNED
  ↓
WARMUP
```

Sponsor media attaches to `CHANGEOVER` state automatically.

---

## 15. Centralized rule push

The sponsor requires centralized rule control, but **CourtOS does not mutate scoring rules in a live match**.

### Chosen behavior

```text
Organizer changes tournament policy
        ↓
create RULESET vN+1
        ↓
publish to clients immediately
        ↓
ACTIVE matches stay pinned to existing version
        ↓
UPCOMING applicable matches use new version
```

For demo scope, scoring-format changes apply to **upcoming matches only**.

Examples:

- No-Ad on/off
- full deciding set vs 10-point match tiebreak

Operational timing settings may be applied at a safe future boundary if desired, but no live rally/game mutation is required for the demo.

### Demo rule controls

Keep only three organizer controls:

```text
TOURNAMENT RULES

NO-AD SCORING
[ ON / OFF ]

DECIDING SET
( ) Full Set
( ) 10-Point Match Tiebreak

CHANGEOVER TIMER
( ) 90 sec
( ) 60 sec

[ APPLY TO UPCOMING MATCHES ]
```

Do not expose generic low-level knobs such as `gamesToWin`, `winBy`, or `tiebreakTarget` in the demo UI.

### Ruleset UI state

After publish:

```text
RULESET v2 PUBLISHED

Court 1 — active match      v1
Court 2 — upcoming match    v2
```

This proves centralized distribution without unsafe mutation.

---

## 16. Organizer dashboard

The organizer dashboard is an **operational control plane**, not an analytics product.

Each court card should expose:

- court status
- score
- server
- ruleset version
- connectivity state
- ambiguous/rejected voice alerts
- dispute state
- next assignment

System-level UI should expose:

- available/free courts
- optimizer re-solve / assignment result
- current tournament rules
- rule publish action
- sponsor creative config

### Debug / judge trace

For the demo, expose a developer/judge panel showing:

```text
Primary ASR transcript/candidate
Legality decision
Fallback invoked? yes/no
Fallback candidate
Final typed intent
CourtGuard ACCEPT / REJECT reason
Event sequence number
Sync ACK state
Optimizer solve / reassignment explanation
```

This makes the architecture visible instead of hidden.

---

## 17. Scoreboard UI system

The court scoreboard must be optimized for outdoor readability and fast interpretation.

### Required visual states

- giant point score
- games / sets hierarchy
- serving indicator
- voice listening state
- confirmation state
- offline state
- dispute/frozen state
- changeover countdown
- sponsor creative
- match complete
- next-match assignment

### Impossible-call state

The blocked-call state should be visually unforgettable.

```text
CALL BLOCKED

Heard: 40–LOVE
Impossible from 30–15
```

State does not change.

### Animation policy

Use only purposeful animations:

- point update
- game/set win
- call blocked
- changeover entry
- match complete
- next-match assignment

Avoid decorative motion that hurts outdoor legibility.

---

## 18. Sponsor media / changeover flow

Do not build a sponsor CMS or marketplace.

For the demo, sponsor config can be simple fixture/upload metadata:

```ts
type SponsorCreative = {
  id: string;
  type: "image" | "video" | "audio";
  src: string;
  durationSec: number;
};
```

Organizer flow:

```text
Add / select sponsor creative
        ↓
attach to tournament
        ↓
CHANGEOVER state
        ↓
show creative automatically
        ↓
countdown
        ↓
"Time" audio cue
        ↓
return to PLAYING
```

Optional but useful event:

```ts
SPONSOR_IMPRESSION {
  sponsorId,
  courtId,
  matchId,
  startedAt,
  durationSec
}
```

---

## 19. Changeover timer semantics

Default sponsor-demo behavior:

```text
90-second changeover
"Time" audio cue at 80 seconds
```

Timer should derive from an authoritative start timestamp, not only an interval counter, so a browser refresh/backgrounding event does not reset the intended elapsed time.

---

## 20. Match / tournament configuration

Do not build full tournament registration.

Use a deterministic fixture/config object:

```ts
type TournamentConfig = {
  courts: CourtConfig[];
  matches: MatchConfig[];
  players: PlayerConfig[];
  dependencies: MatchDependency[];
  rulesets: RulesetDefinition[];
};
```

Organizer may change only high-value operational settings for the demo:

- match format
- upcoming-match ruleset
- court assignment / pause if needed

---

## 21. Testing architecture

CourtGuard should be tested more aggressively than ordinary UI code.

### Unit tests

Cover direct rules:

- normal game scoring
- deuce / advantage
- No-Ad deciding point
- set completion
- 7-point tiebreak
- 10-point match tiebreak
- doubles service rotation
- correction / rollback

### Property-based tests

Use `fast-check` or equivalent to generate adversarial legal/illegal sequences.

Core invariants:

- no invalid score is reachable
- deterministic replay
- rollback semantics are explicit
- no impossible server order
- no double-booked court
- no player overlap
- no dependency violation
- rule-version pinning is preserved
- offline replay converges

### Reachable-state exploration

Tennis scoring has a constrained enough state space that large portions can be enumerated.

```ts
function explore(state) {
  for (const transition of legalNextStates(state)) {
    assertInvariants(transition.nextState);
    explore(transition.nextState);
  }
}
```

Normalize repeating advantage-equivalent states as needed to keep exploration finite.

Useful assertions:

```text
No-Ad games terminate on the deciding point.
A normal game requires a two-point margin after deuce.
A 7-point tiebreak cannot end 7–6.
A 10-point tiebreak cannot end 10–9.
A 10-point tiebreak may end 12–10.
A set cannot terminate at 6–6.
Replay(events) always reproduces the same authoritative state.
```

---

## 22. Demo proof sequence

CourtOS should be demonstrated as a sequence of proofs, not as a feature checklist.

### Proof 1 — HEAR

Noisy voice call updates score correctly.

### Proof 2 — RECOVER

Primary ASR fails / is weak; fallback recovers the intended legal call from the same audio.

### Proof 3 — REFUSE

An impossible or ambiguous event does not corrupt state.

```text
CALL BLOCKED
Heard: 40–LOVE
Impossible from 30–15
```

### Proof 4 — SURVIVE

Kill network connectivity. Continue scoring locally. Reconnect and show zero lost points.

### Proof 5 — OPTIMIZE

Finish a match. Court becomes free. Tournament Twin changes. CourtOptimizer re-solves and assigns the best next match.

Example judge-visible trace:

```text
OPTIMAL / BEST FEASIBLE PLAN FOUND
Court 2 → Match 16
Court 4 → Match 14
Projected tournament finish:
7:31 PM → 7:17 PM
✓ 0 player overlaps
✓ 0 dependency violations
✓ 0 rest violations
✓ 0 court conflicts
Improvement: 14 minutes
```

### Proof 6 — OPERATE

Changeover enters sponsor state, runs countdown, calls `Time`, and returns to play.

### Optional additional proof — RULE PUSH

Organizer publishes No-Ad + 10-point deciding tiebreak for upcoming matches; active match remains pinned; next assigned match starts under the new ruleset.

---

## 23. Recommended repo/package shape

```text
apps/
  web/
    routes/
      court/
      organizer/

server/
  index.ts
  socket.ts
  tournamentTwin.ts

packages/
  courtguard/
    state.ts
    events.ts
    transition.ts
    legalNextStates.ts
    rules/
      definitions.ts
      compiler.ts
      presets.ts
    service/
      singles.ts
      doubles.ts
      tiebreakRotation.ts

  voice/
    audio/
    asr/
    tennis-language/
    arbitration/
    controller/

  tournament-core/
    types.ts
    events.ts
    lifecycle.ts
    rulesetVersions.ts

  optimizer/
    model.ts
    variables.ts
    hardConstraints.ts
    objective.ts
    solve.ts
    explain.ts
    scenarios.ts

  shared/
    ids.ts
    schemas.ts
    protocol.ts
```

---

## 24. Architectural decision log

Use this section for future decisions. Replace obsolete decisions explicitly rather than leaving contradictory guidance elsewhere.

### ADR-001 — Deterministic authority boundary

**Decision:** probabilistic systems may interpret human input, but only deterministic code may mutate authoritative tennis/tournament state.

**Reason:** voice is uncertain; tennis legality and tournament constraints are deterministic.

---

### ADR-002 — Two-stage ASR cascade

**Decision:** use one primary ASR and one conditional fallback ASR on the exact same buffered utterance.

**Reason:** improves robustness while keeping latency, cost, and implementation complexity low.

---

### ADR-003 — State-constrained voice interpretation

**Decision:** rank recognized speech against legal/plausible next tennis states from CourtGuard.

**Reason:** the match state dramatically reduces ambiguity and makes imperfect ASR useful.

---

### ADR-004 — Tactile input shares CourtGuard

**Decision:** voice and touch terminate at the same deterministic transition API.

**Reason:** avoids two scoring implementations and guarantees identical authority semantics.

---

### ADR-005 — Event-sourced scoring history

**Decision:** accepted/rejected scoring activity is represented as append-only events; current state is reconstructible by replay.

**Reason:** enables correction, disputes, auditability, offline recovery, and demo proof traces.

---

### ADR-006 — Minimal infrastructure stack

**Decision:** React + TypeScript + Vite + Socket.IO + localStorage + one Node/TypeScript server with in-memory state. No database/auth/ORM/microservices for the hackathon.

**Reason:** minimizes glue and preserves engineering time for the differentiating mechanisms.

---

### ADR-007 — Declarative versioned rulesets

**Decision:** one CourtGuard engine is parameterized by compiled versioned rulesets.

**Reason:** singles, doubles, No-Ad, Express, and deciding-tiebreak formats should not fork the engine.

---

### ADR-008 — Started matches pin their ruleset version

**Decision:** centralized scoring-rule changes apply to upcoming matches; active matches keep the ruleset they started with.

**Reason:** avoids unsafe hybrid match semantics and keeps demo behavior easy to explain.

---

### ADR-009 — Minimal dispute workflow

**Decision:** dispute freezes scoring; organizer chooses a prior correct score; system appends a rollback/correction event and resumes.

**Reason:** satisfies the sponsor’s dispute requirement without building umpire workflow complexity.

---

### ADR-010 — Receding-horizon global optimizer

**Decision:** scheduling is a global constrained optimization problem re-solved when tournament reality changes, not a greedy per-court queue.

**Reason:** this is a major differentiator and directly addresses tournament bottlenecks.

---

### ADR-011 — Optimizer plans are version-bound proposals

**Decision:** solver output is tied to the Tournament Twin version and discarded if stale before commit.

**Reason:** mirrors CourtGuard’s semantic firewall at the tournament-scheduling layer.

---

### ADR-012 — Sponsor media is lifecycle-driven

**Decision:** sponsor content is automatically attached to `CHANGEOVER` state.

**Reason:** monetization is part of real match operations rather than a disconnected ad feature.

---

## 25. Open implementation choices

These are intentionally **not** architectural decisions yet:

- exact primary ASR provider
- exact fallback ASR provider
- provider-specific thresholds
- exact constraint solver library
- exact optimizer objective weights
- exact match-duration estimates by format
- final visual design tokens / font sizes

When one of these is chosen, append a new ADR here.

---

## 26. Rules for future agents

1. Read this file before proposing architecture changes.
2. Preserve the authority boundary: ML proposes; deterministic systems commit.
3. Prefer one shared mechanism over parallel special-case implementations.
4. Do not add infrastructure unless it directly supports a required demo proof.
5. Do not introduce a database, auth system, microservice, or second state authority without an explicit ADR.
6. Do not let UI code own tennis legality, server rotation, or tournament assignment correctness.
7. Do not let ASR mutate match state directly.
8. Do not let the optimizer mutate Tournament Twin directly.
9. Preserve append-only event history for corrections and disputes.
10. When architectural decisions change, update or supersede the relevant ADR in this file so this remains the single context map.

---

## 27. One-sentence architecture summary

> **CourtOS uses probabilistic intelligence to understand humans and deterministic systems to run tennis: CourtGuard owns legal match state, event history makes it replayable and offline-safe, the Tournament Twin centralizes reality, and CourtOptimizer globally re-plans the event whenever reality changes.**
