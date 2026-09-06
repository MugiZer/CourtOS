export type CourtId = 1 | 2;
export type Team = 0 | 1;
export type Pair = [number, number];
export type Phase = 'playing' | 'changeover' | 'dispute' | 'complete' | 'warmup';
export type EventKind = 'snapshot' | 'point' | 'correction' | 'blocked' | 'dispute' | 'resumed' | 'changeover' | 'assignment' | 'connection' | 'rules';
export type MatchFormat = 'Singles' | 'Doubles' | 'Mixed doubles';
export interface Rules { version: number; noAd: boolean; deciding: 'full' | 'tiebreak'; changeover: 0 | 60 | 90; pace: 'Standard' | 'Express'; setRest: number; matchRest: number; estimatedMinutes: number }
export interface Score { points: Pair; games: Pair; sets: Pair[]; winner: Team | null; tieBreak: boolean; matchTieBreak: boolean; serviceGame: number }
export interface Match {
  id: string; round: string; format: MatchFormat; teams: [string[], string[]]; dependencies?: string[];
  rules: Rules; score: Score; phase: Phase; serverOrder: string[]; firstServer: number; receiverSide: 'deuce' | 'ad' | null;
}
export interface CourtEvent {
  id: string; sequence: number; kind: EventKind; title: string; detail: string;
  at: number; source: 'Touch' | 'Voice input' | 'Organizer' | 'Scenario'; scoringTeam?: Team;
  score: Score; previousScore?: Score; reverts?: string; matchId: string; acknowledged: boolean;
}
export interface Decision { type: 'ready' | 'accepted' | 'blocked' | 'correction' | 'confirmation' | 'unclear'; title: string; detail: string; heard?: string; candidate?: string }
export interface Court {
  id: CourtId; match: Match; remoteMatch: Match; online: boolean; pending: number;
  events: CourtEvent[]; seenThrough: number; decision: Decision;
  changeoverEndsAt: number | null; timeCalled: boolean; rallyStartedAt: number | null;
  changeoverSeconds?: number;
  rallyIndex?: number; rallyFinished?: boolean; rallyWinner?: Team;
  resultDeliveryRequired?: boolean; resultDelivered?: boolean;
}
export interface ScheduledItem { match: string; label: string; court: CourtId; start: number; end: number; projected: boolean }
export interface Plan { first: 'semifinal' | 'consolation'; firstMatch?: string; finish: number; items: ScheduledItem[] }
export interface DemoState {
  schema: 1; revision: number; courts: [Court, Court]; upcomingRules: Rules; rulesPublished: boolean;
  plan: { status: 'idle' | 'solving' | 'validated' | 'assigned'; options: Plan[]; basedOnRevision: number } ;
  sponsor: { name: string; headline: string; media?: string; mediaType?: 'image' | 'video'; clickUrl?: string; audio?: string; skipAds?: boolean };
  upcomingMatches: Match[]; completedMatches: { match: Match; finishedAt: number }[];
  optimizationDecision?: { options: Plan[]; at: number; assignedMatch: string; court: CourtId };
  lastResult: string | null; storageError: boolean;
}
