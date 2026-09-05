// B01 frozen contract — the one shared seam backend + frontend code against.
// Authority: architecture.md §§3, 6, 7, 8, 9, 11, 12, 13. Frozen before batch B.
// Erasable-syntax only (interfaces / type aliases / `as const`) so Node's
// type-stripping can load this file with zero dependencies.
//
// DISPUTE RULE (SPEC ONLY — B02 implements it):
//   transition(state, intent, rules) MUST reject every non-resolution intent
//   while state.phase === "DISPUTE", returning reason "DISPUTE_FROZEN" with
//   state unchanged. The ONLY acceptable intent in DISPUTE is the resolution
//   intent SCORE_ROLLBACK (organizer answers "what score do we return to?",
//   history is never deleted — the rollback is appended as a new event).

export type TeamId = "A" | "B";
export type PlayerId = string;
export type CourtId = string;
export type MatchId = string;

// Ticket scope: exactly these four (B02+ guard on DISPUTE; B06/B07 use the rest).
export type MatchPhase = "PLAYING" | "DISPUTE" | "CHANGEOVER" | "COMPLETE";

// architecture.md §8 — who may legally serve/receive next.
export interface ServiceState {
  servingTeam: TeamId;
  server: PlayerId;
  receivingTeam: TeamId;
  deuceReceiver: PlayerId;
  adReceiver: PlayerId;
  serviceOrder: PlayerId[];
  tiebreakPointNumber?: number;
}

// architecture.md §6 — numeric counters only (0=Love 1=15 2=30 3=40;
// tiebreak points when inTiebreak). Never display strings as state.
export interface MatchState {
  matchId: MatchId;
  courtId: CourtId;
  rulesetId: string;
  rulesetVersion: number;
  phase: MatchPhase;
  serverPoints: number;
  receiverPoints: number;
  games: [number, number];
  sets: Array<[number, number]>;
  inTiebreak: boolean;
  service: ServiceState;
  winner: TeamId | null;
}

// Numeric form of a spoken resulting score (resolved against legalNextStates).
export interface CanonicalScore {
  serverPoints: number;
  receiverPoints: number;
}

// architecture.md §5 voice intents + §6 POINT_WON primitive + §10 rollback.
export type TennisIntent =
  | { type: "SCORE_CALL"; score: CanonicalScore; transcript?: string }
  | { type: "POINT_WON"; winner: TeamId }
  | { type: "FAULT" }
  | { type: "LET" }
  | { type: "CORRECTION" }
  | { type: "CONFIRM_YES" }
  | { type: "CONFIRM_NO" }
  | { type: "DISPUTE_START"; reason?: string }
  | { type: "SCORE_ROLLBACK"; to: CanonicalScore };

// The only intent transition() may accept while phase === "DISPUTE" (see spec above).
export type ResolutionIntent = Extract<TennisIntent, { type: "SCORE_ROLLBACK" }>;

// architecture.md §9 — append-only event history (§4 CourtEvent `synced` flag
// lives on the sync envelope, not here; see offline-unsynced-batch fixture).
export type EventSource = "VOICE" | "TOUCH" | "ORGANIZER" | "SYSTEM";
export type EventDecision = "ACCEPTED" | "REJECTED";
export interface MatchEventRecord {
  id: string;
  courtId: CourtId;
  matchId: MatchId;
  sequence: number;
  timestamp: number;
  source: EventSource;
  transcript?: string;
  candidates?: unknown[];
  proposedIntent?: unknown;
  previousState: MatchState;
  decision: EventDecision;
  rejectionReason?: string;
  resultingState: MatchState;
}

// architecture.md §7 — declarative versioned ruleset.
export interface RulesetDefinition {
  id: string;
  version: number;
  participants: { mode: "SINGLES" | "DOUBLES" };
  game: { scoring: "ADVANTAGE" | "NO_AD" };
  set: {
    gamesToWin: number;
    winByGames: number;
    tiebreak?: { atGames: [number, number]; pointsToWin: number; winByPoints: number };
  };
  decidingSet:
    | { kind: "NORMAL_SET" }
    | { kind: "MATCH_TIEBREAK"; pointsToWin: number; winByPoints: number };
}

// architecture.md §7 — compiled policy signatures (B03 implements).
export interface CompiledRuleset {
  definition: RulesetDefinition;
  gameWinner(state: MatchState): TeamId | null;
  setWinner(state: MatchState): TeamId | null;
  shouldStartTiebreak(state: MatchState): boolean;
  shouldStartMatchTiebreak(state: MatchState): boolean;
  tiebreakWinner(state: MatchState): TeamId | null;
  legalEvents(state: MatchState): TennisIntent[];
  nextPhase(state: MatchState): MatchPhase;
}

// architecture.md §12 — JSON-friendly Twin snapshot (Records, not Maps).
export type ConnectivityState = "ONLINE" | "OFFLINE";
export type CourtStatus = "FREE" | "WARMUP" | "PLAYING" | "CHANGEOVER" | "COMPLETE";
export interface CourtState {
  courtId: CourtId;
  status: CourtStatus;
  currentMatchId: MatchId | null;
}
export interface PlayerState {
  playerId: PlayerId;
  available: boolean;
  restUntil?: number;
}
// architecture.md §13 churn semantics: PLANNED cheap → PLAYING fixed.
export type AssignmentStatus = "PLANNED" | "ANNOUNCED" | "WARMUP" | "PLAYING";
export interface Assignment {
  matchId: MatchId;
  courtId: CourtId;
  status: AssignmentStatus;
}
export interface TournamentTwinSnapshot {
  version: number;
  courts: Record<CourtId, CourtState>;
  matches: Record<MatchId, MatchState>;
  players: Record<PlayerId, PlayerState>;
  assignments: Record<CourtId, Assignment>;
  rulesets: Record<string, RulesetDefinition>;
  connectivity: Record<CourtId, ConnectivityState>;
  sponsor: SponsorState;
}

// architecture.md §13 — optimizer output; stale if version moved (B07 implements).
export interface AssignmentPlan {
  basedOnStateVersion: number;
  assignments: Assignment[];
  projectedFinishTime: number;
  objectiveBreakdown: unknown;
}

// architecture.md §18 — lifecycle-driven sponsor creative.
export interface SponsorCreative {
  id: string;
  type: "image" | "video" | "audio";
  src: string;
  durationSec: number;
}
export interface SponsorState {
  creativeId: string | null;
}

// architecture.md §19 — changeover derives from authoritative start timestamp.
export interface ChangeoverInfo {
  startedAt: number;
  durationSec: number;
  timeCueAtSec: number;
}

// architecture.md §11 — the 7 frozen socket event names.
export const SOCKET_EVENTS = [
  "court:event",
  "court:sync",
  "court:status",
  "tournament:update",
  "court:update",
  "ruleset:published",
  "assignment:update",
] as const;
export type SocketEventName = (typeof SOCKET_EVENTS)[number];
