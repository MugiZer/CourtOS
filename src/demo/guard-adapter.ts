// Demo Match <-> CourtGuard bridge. The demo Match/Score stays the stored UI
// shape (component API stable); every scoring commit is computed by
// courtguard's transition() and mapped back. Reuses definitionFromToggles,
// compileRuleset, transition and expectedReceiver — never reimplements them.
// Service construction mirrors push.startMatch (server from the rotation,
// teams from the team containing the server); without a tiebreakPointNumber
// the engine treats the state as a frozen seed, so counters map via the
// serving team and each call is self-consistent.
import { legalNextStates, transition } from '../../courtguard/guard.ts';
import { compileRuleset } from '../../courtguard/rules/compiler.ts';
import { createStore, definitionFromToggles, publish } from '../../courtguard/rules/push.ts';
import type { DemoToggles, RulesetStore } from '../../courtguard/rules/push.ts';
import { expectedReceiver } from '../../courtguard/rotation.ts';
import type {
  CanonicalScore,
  CompiledRuleset,
  EventSource,
  MatchEventRecord,
  MatchState,
  RulesetDefinition,
  TeamId,
  TennisIntent,
} from '../../shared/types.ts';
import { labels, serverName, serverTeam, setWins } from './score';
import type { CourtEvent, Match, Rules, Score, Team } from './types';

export const RULESET_ID = 'demo';

const teamId = (t: Team): TeamId => (t === 0 ? 'A' : 'B');
const teamIdx = (t: TeamId): Team => (t === 'A' ? 0 : 1);

const SOURCE: Record<CourtEvent['source'], EventSource> = {
  Touch: 'TOUCH',
  'Voice preview': 'VOICE',
  Organizer: 'ORGANIZER',
  Demo: 'SYSTEM',
};

// Demo Rules -> declarative definition. Mode comes from the player names
// (DOUBLES iff 4 names); changeover seconds ride the toggles (validated by
// definitionFromToggles, consumed by the changeover info, not the definition).
export function toDefinition(rules: Rules, playerNames: string[]): RulesetDefinition {
  const toggles: DemoToggles = {
    mode: playerNames.length === 4 ? 'DOUBLES' : 'SINGLES',
    noAd: rules.noAd,
    deciding: rules.deciding === 'tiebreak' ? 'MATCH_TIEBREAK' : 'FULL_SET',
    changeoverSec: rules.changeover,
  };
  return definitionFromToggles(toggles, RULESET_ID, rules.version);
}

export function definitionFor(match: Match): RulesetDefinition {
  return toDefinition(match.rules, match.teams.flat());
}

const compiled = new Map<string, CompiledRuleset>();
export function compiledFor(match: Match): CompiledRuleset {
  const key = JSON.stringify(definitionFor(match));
  let c = compiled.get(key);
  if (!c) {
    c = compileRuleset(definitionFor(match));
    compiled.set(key, c);
  }
  return c;
}

// Team-indexed demo Score -> server-indexed engine counters via the CURRENT
// serving team. Demo warmup has no engine phase, so it maps to PLAYING (the
// warmup score is always a fresh 0-0).
export function toMatchState(match: Match, courtId: string): MatchState {
  const servingIdx = serverTeam(match);
  const serving = teamId(servingIdx);
  const receiving: TeamId = serving === 'A' ? 'B' : 'A';
  const receivers = match.teams[teamIdx(receiving)];
  const [serverPoints, receiverPoints] =
    servingIdx === 0 ? match.score.points : [match.score.points[1], match.score.points[0]];
  return {
    matchId: match.id,
    courtId,
    rulesetId: RULESET_ID,
    rulesetVersion: match.rules.version,
    phase:
      match.phase === 'dispute'
        ? 'DISPUTE'
        : match.phase === 'changeover'
          ? 'CHANGEOVER'
          : match.phase === 'complete'
            ? 'COMPLETE'
            : 'PLAYING',
    serverPoints,
    receiverPoints,
    games: [match.score.games[0], match.score.games[1]],
    sets: match.score.sets.map((s) => [s[0], s[1]] as [number, number]),
    inTiebreak: match.score.tieBreak || match.score.matchTieBreak,
    service: {
      servingTeam: serving,
      server: serverName(match),
      receivingTeam: receiving,
      deuceReceiver: receivers[0],
      adReceiver: receivers[receivers.length - 1],
      serviceOrder: [...match.serverOrder],
    },
    winner: match.score.winner === null ? null : teamId(match.score.winner),
  };
}

// Engine state -> demo Score. serviceGame carries forward (one increment per
// completed game, exactly like the legacy scorer: never inside a tiebreak).
// In a tiebreak the flag is tieBreak vs matchTieBreak by context (deciding
// tiebreak + split sets = MTB).
export function toDisplay(next: MatchState, prev: Score, rules: Rules): Score {
  const servingIdx = teamIdx(next.service.servingTeam);
  const points: [number, number] =
    servingIdx === 0 ? [next.serverPoints, next.receiverPoints] : [next.receiverPoints, next.serverPoints];
  const games: [number, number] = [next.games[0], next.games[1]];
  const gamesChanged = games[0] !== prev.games[0] || games[1] !== prev.games[1];
  const gameWon =
    !prev.tieBreak && !prev.matchTieBreak && (gamesChanged || (next.winner !== null && prev.winner === null));
  let tieBreak = false;
  let matchTieBreak = false;
  if (next.inTiebreak) {
    const [a, b] = setWins(next.sets);
    if (rules.deciding === 'tiebreak' && a === 1 && b === 1) matchTieBreak = true;
    else tieBreak = true;
  }
  return {
    points,
    games,
    sets: next.sets.map((s) => [s[0], s[1]] as [number, number]),
    winner: next.winner === null ? null : teamIdx(next.winner),
    tieBreak,
    matchTieBreak,
    serviceGame: prev.serviceGame + (gameWon ? 1 : 0),
  };
}

export function serverFromState(ms: MatchState): string {
  return ms.service.server;
}

export function receiverFromState(ms: MatchState): string {
  return expectedReceiver(ms.service, ms.serverPoints, ms.receiverPoints);
}

export interface GuardCommit {
  accepted: boolean;
  score: Score | null;
  reason?: string;
  prevMs: MatchState;
  nextMs: MatchState | null;
  intent: TennisIntent;
}

export function commitPoint(match: Match, courtId: string, team: Team): GuardCommit {
  const prevMs = toMatchState(match, courtId);
  const intent: TennisIntent = { type: 'POINT_WON', winner: teamId(team) };
  const r = transition(prevMs, intent, compiledFor(match));
  if (!r.accepted) return { accepted: false, score: null, reason: r.reason, prevMs, nextMs: null, intent };
  return { accepted: true, score: toDisplay(r.state, match.score, match.rules), prevMs, nextMs: r.state, intent };
}

export function commitDispute(match: Match, courtId: string): GuardCommit {
  const prevMs = toMatchState(match, courtId);
  const intent: TennisIntent = { type: 'DISPUTE_START' };
  const r = transition(prevMs, intent, compiledFor(match));
  if (!r.accepted) return { accepted: false, score: null, reason: r.reason, prevMs, nextMs: null, intent };
  return { accepted: true, score: structuredClone(match.score), prevMs, nextMs: r.state, intent };
}

// Rollback to a prior accepted Score (undo / dispute restore). The engine
// gates validity; the restored Score is the recorded snapshot itself, since a
// rollback can cross a game boundary the point counters alone cannot express.
export function commitRollback(match: Match, courtId: string, target: Score): GuardCommit {
  const prevMs = toMatchState(match, courtId);
  const servingIdx = teamIdx(prevMs.service.servingTeam);
  const [serverPoints, receiverPoints] =
    servingIdx === 0 ? target.points : [target.points[1], target.points[0]];
  const intent: TennisIntent = { type: 'SCORE_ROLLBACK', to: { serverPoints, receiverPoints } };
  const r = transition(prevMs, intent, compiledFor(match));
  if (!r.accepted) return { accepted: false, score: null, reason: r.reason, prevMs, nextMs: null, intent };
  return { accepted: true, score: structuredClone(target), prevMs, nextMs: r.state, intent };
}

// Voice + touch share one engine listing: each legal next state mapped to its
// display Score and server-first spoken form (same order legacy resolveCall
// used). Matching spoken text against these is the only voice resolution.
export interface EngineOption { team: Team; score: Score; spoken: string; nextMs: MatchState }
export function engineOptions(match: Match, courtId: string): EngineOption[] {
  const prevMs = toMatchState(match, courtId);
  const order = serverTeam(match);
  return legalNextStates(prevMs, compiledFor(match)).map(t => {
    const team: Team = t.intent.type === 'POINT_WON' && t.intent.winner === 'B' ? 1 : 0;
    const score = toDisplay(t.nextState, match.score, match.rules);
    const lab = labels(score);
    const spoken = (order === 0 ? lab : [...lab].reverse()).join(' ').toLowerCase();
    return { team, score, spoken, nextMs: t.nextState };
  });
}

// Score-call commit: spoken result already matched to one EngineOption; its
// counters ride a SCORE_CALL through transition() (guard resolves it to the
// same POINT_WON internally). Rejects carry the engine reason.
export function commitScoreCall(match: Match, courtId: string, score: CanonicalScore, transcript?: string): GuardCommit {
  const prevMs = toMatchState(match, courtId);
  const intent: TennisIntent = { type: 'SCORE_CALL', score, ...(transcript !== undefined ? { transcript } : {}) };
  const r = transition(prevMs, intent, compiledFor(match));
  if (!r.accepted) return { accepted: false, score: null, reason: r.reason, prevMs, nextMs: null, intent };
  return { accepted: true, score: toDisplay(r.state, match.score, match.rules), prevMs, nextMs: r.state, intent };
}

// Same-session outbox of accepted records (keyed by demo event id). Memory
// only: a reload keeps the demo events (localStorage) but not these envelopes.
const outbox = new Map<string, MatchEventRecord[]>();

export function noteAccepted(opts: {
  matchId: string;
  id: string;
  sequence: number;
  courtId: string;
  source: CourtEvent['source'];
  commit: GuardCommit;
  transcript?: string;
}): MatchEventRecord {
  if (!opts.commit.accepted || !opts.commit.nextMs) throw new Error('noteAccepted: commit was not accepted');
  const record: MatchEventRecord = {
    id: opts.id,
    courtId: opts.courtId,
    matchId: opts.matchId,
    sequence: opts.sequence,
    timestamp: Date.now(),
    source: SOURCE[opts.source],
    ...(opts.transcript !== undefined ? { transcript: opts.transcript } : {}),
    proposedIntent: opts.commit.intent,
    previousState: opts.commit.prevMs,
    decision: 'ACCEPTED',
    resultingState: opts.commit.nextMs,
  };
  const q = outbox.get(opts.matchId) ?? [];
  q.push(record);
  outbox.set(opts.matchId, q);
  return record;
}

export function pendingFor(matchId: string): MatchEventRecord[] {
  return [...(outbox.get(matchId) ?? [])];
}

// Rejected envelope: same id/sequence space, unchanged resultingState, engine
// reason attached. Stored verbatim so replay() re-rejects deterministically.
export function noteRejected(opts: {
  matchId: string;
  id: string;
  sequence: number;
  courtId: string;
  source: CourtEvent['source'];
  commit: GuardCommit;
  transcript?: string;
}): MatchEventRecord {
  if (opts.commit.accepted || !opts.commit.reason) throw new Error('noteRejected: commit was not rejected');
  const record: MatchEventRecord = {
    id: opts.id,
    courtId: opts.courtId,
    matchId: opts.matchId,
    sequence: opts.sequence,
    timestamp: Date.now(),
    source: SOURCE[opts.source],
    ...(opts.transcript !== undefined ? { transcript: opts.transcript } : {}),
    proposedIntent: opts.commit.intent,
    previousState: opts.commit.prevMs,
    decision: 'REJECTED',
    rejectionReason: opts.commit.reason,
    resultingState: opts.commit.prevMs,
  };
  const q = outbox.get(opts.matchId) ?? [];
  q.push(record);
  outbox.set(opts.matchId, q);
  return record;
}

export function ackRecord(matchId: string, id: string): void {
  const q = outbox.get(matchId);
  if (!q) return;
  const i = q.findIndex((r) => r.id === id);
  if (i >= 0) q.splice(i, 1);
}

export function confirmAll(matchId: string): void {
  outbox.delete(matchId);
}

// Upcoming-rules store: APPLY publishes vN+1 immediately while active matches
// stay pinned (their rules objects are never touched here; each MatchState
// carries its own pinned rulesetVersion). Rebases if the demo version moved
// on (e.g. a localStorage snapshot from a newer session).
let upcoming: RulesetStore | null = null;

export function publishDemoRules(rules: Rules): RulesetDefinition {
  const mode = upcoming?.current.definition.participants.mode ?? 'DOUBLES';
  const toggles: DemoToggles = {
    mode,
    noAd: rules.noAd,
    deciding: rules.deciding === 'tiebreak' ? 'MATCH_TIEBREAK' : 'FULL_SET',
    changeoverSec: rules.changeover,
  };
  if (!upcoming || upcoming.current.definition.version !== rules.version - 1) {
    upcoming = createStore(
      definitionFromToggles(
        { mode, noAd: false, deciding: 'FULL_SET', changeoverSec: 90 },
        RULESET_ID,
        rules.version - 1,
      ),
      90,
    );
  }
  upcoming = publish(upcoming, toggles);
  return upcoming.current.definition;
}
