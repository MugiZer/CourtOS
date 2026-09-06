// B02 CourtGuard core + B04 doubles/tiebreak rotation — deterministic scoring firewall.
// Authority: architecture.md §§6,8 + shared/types.ts (frozen contract, mirrored only).
// No LLM, no deps, numeric counters only (never display strings as state).
// Erasable-syntax TS so `node --test` loads it directly. All game/set/TB
// verdicts come from the CompiledRuleset (single authority); rotation.ts owns
// only the who-serves-next math the compiler does not.
import type {
  CompiledRuleset,
  MatchState,
  PlayerId,
  RulesetDefinition,
  TeamId,
  TennisIntent,
} from "../shared/types.ts";
import { compileRuleset } from "./rules/compiler.ts";
import {
  advanceGameService,
  advanceTiebreakService,
  enterTiebreakService,
  exitTiebreakService,
  expectedReceiver,
  resyncTiebreakService,
  tbFirstTeam,
} from "./rotation.ts";

export type GuardResult =
  | { accepted: true; state: MatchState }
  | { accepted: false; reason: string; state: MatchState };

export interface LegalTransition {
  intent: TennisIntent;
  nextState: MatchState;
}

// B03 passes a CompiledRuleset; tests/fixtures pass a definition or nothing.
export type RulesInput = CompiledRuleset | RulesetDefinition | undefined;

const STANDARD_SINGLES: RulesetDefinition = {
  id: "standard-singles",
  version: 1,
  participants: { mode: "SINGLES" },
  game: { scoring: "ADVANTAGE" },
  set: {
    gamesToWin: 6,
    winByGames: 2,
    tiebreak: { atGames: [6, 6], pointsToWin: 7, winByPoints: 2 },
  },
  decidingSet: { kind: "NORMAL_SET" },
};
const STANDARD_POLICY: CompiledRuleset = compileRuleset(STANDARD_SINGLES);

const idx = (t: TeamId): number => (t === "A" ? 0 : 1);

// One scoring authority (arch §26 rule 3): every game/set/tiebreak/match
// verdict below comes from the compiled policy. Guard only books state
// (points/games/sets/service/phase) around those verdicts.
function policyOf(rules: RulesInput): CompiledRuleset {
  if (rules === undefined) return STANDARD_POLICY;
  if (typeof (rules as CompiledRuleset).gameWinner === "function")
    return rules as CompiledRuleset; // full policy honored, incl. decidingSet
  const def = (rules as { definition?: RulesetDefinition }).definition ??
    (rules as RulesetDefinition);
  return compileRuleset(def);
}

function winGame(s: MatchState, winner: TeamId, policy: CompiledRuleset): MatchState {
  const games = [s.games[0], s.games[1]] as [number, number];
  games[idx(winner)] += 1;
  const probe = { ...s, games };
  if (policy.shouldStartTiebreak(probe)) {
    const base = { ...s, serverPoints: 0, receiverPoints: 0, games, inTiebreak: true };
    return { ...base, service: enterTiebreakService(s.service) };
  }
  if (policy.setWinner(probe) !== null) {
    const sets = [...s.sets, games];
    // Match-winning game keeps the final set in `games` (see match-complete fixture).
    if (policy.nextPhase({ ...s, sets }) === "COMPLETE") {
      return { ...s, serverPoints: 0, receiverPoints: 0, games, phase: "COMPLETE", winner };
    }
    const base = {
      ...s,
      serverPoints: 0,
      receiverPoints: 0,
      games: [0, 0] as [number, number],
      sets,
    };
    // Split sets under a MATCH_TIEBREAK decider start the match tiebreak as a
    // distinct phase — never a third set.
    if (policy.shouldStartMatchTiebreak(base)) {
      const mtb = { ...base, inTiebreak: true };
      return { ...mtb, service: enterTiebreakService(s.service) };
    }
    return { ...base, service: advanceGameService(s.service) };
  }
  const base = { ...s, serverPoints: 0, receiverPoints: 0, games };
  return { ...base, service: advanceGameService(s.service) };
}

function winTiebreak(s: MatchState, winner: TeamId, policy: CompiledRuleset): MatchState {
  // Decided match tiebreak ends the match in place: distinct phase, no third set.
  if (policy.nextPhase(s) === "COMPLETE") {
    return { ...s, phase: "COMPLETE", winner };
  }
  // Set-tiebreak win is recorded as one extra game (compiler convention).
  const decided = [s.games[0], s.games[1]] as [number, number];
  decided[idx(winner)] += 1;
  const sets = [...s.sets, decided];
  const base = {
    ...s, serverPoints: 0, receiverPoints: 0,
    games: [0, 0] as [number, number], sets, inTiebreak: false,
  };
  if (policy.nextPhase(base) === "COMPLETE") {
    return { ...base, phase: "COMPLETE", winner };
  }
  // Post-TB restore (ITF order): resume one rotation step after the TB's
  // first server. s.service still describes the final TB point, so invert
  // from its 0-based index (points played - 1). Legacy frozen seeds (no
  // tiebreakPointNumber) exit via the plain game advance, as before.
  if (s.service.tiebreakPointNumber === undefined) {
    return { ...base, service: advanceGameService(s.service) };
  }
  const lastPoint = s.serverPoints + s.receiverPoints - 1;
  return { ...base, service: exitTiebreakService(s.service, lastPoint) };
}

function applyPoint(s: MatchState, winner: TeamId, policy: CompiledRuleset): MatchState {
  // Scoring reference: the game server — or, inside a tiebreak, the stable
  // TB-first-serving team (rotation.ts). A TB WITHOUT tiebreakPointNumber is
  // a legacy/frozen mid-TB seed (B02): service stays frozen and scores map via
  // the frozen team, exactly as before rotation existed.
  const tracked = s.inTiebreak && s.service.tiebreakPointNumber !== undefined;
  const ref = tracked
    ? tbFirstTeam(s.service, s.serverPoints + s.receiverPoints)
    : s.service.servingTeam;
  const serverWon = winner === ref;
  const serverPoints = s.serverPoints + (serverWon ? 1 : 0);
  const receiverPoints = s.receiverPoints + (serverWon ? 0 : 1);
  const next = { ...s, serverPoints, receiverPoints };
  if (s.inTiebreak) {
    if (policy.tiebreakWinner(next) !== null) return winTiebreak(next, winner, policy);
    if (!tracked) return next;
    // TB service describes the upcoming point: derive it from the rotation +
    // tiebreak point number (points played so far), never ad-hoc UI state.
    const played = next.serverPoints + next.receiverPoints;
    return { ...next, service: advanceTiebreakService(next.service, played) };
  }
  if (policy.gameWinner(next) !== null) return winGame(next, winner, policy);
  return next;
}

// First-class API: every legal point outcome from here (powers transition,
// voice ranking, tactile controls). Empty when no point can be played.
export function legalNextStates(state: MatchState, rules?: RulesInput): LegalTransition[] {
  const policy = policyOf(rules);
  if (policy.legalEvents(state).length === 0) return [];
  return (["A", "B"] as TeamId[]).map((winner) => ({
    intent: { type: "POINT_WON", winner },
    nextState: applyPoint(state, winner, policy),
  }));
}

const reject = (state: MatchState, reason: string): GuardResult => ({
  accepted: false,
  reason,
  state,
});

export function transition(state: MatchState, intent: TennisIntent, rules?: RulesInput): GuardResult {
  if (state.phase === "COMPLETE") return reject(state, "MATCH_COMPLETE");
  // DISPUTE rule (specced in shared/types.ts): ONLY SCORE_ROLLBACK resolves.
  if (state.phase === "DISPUTE" && intent.type !== "SCORE_ROLLBACK") {
    return reject(state, "DISPUTE_FROZEN");
  }
  switch (intent.type) {
    case "POINT_WON": {
      if (intent.winner !== "A" && intent.winner !== "B") return reject(state, "INVALID_INTENT");
      // B04 rotation firewall: an optional server/receiver claim on the intent
      // (voice/touch knows who served) is checked against the engine's expected
      // server for the upcoming point. Absent claim = no check (back-compat).
      const claim = intent as { winner: TeamId; server?: PlayerId; receiver?: PlayerId };
      if (claim.server !== undefined && claim.server !== state.service.server) {
        return reject(state, `WRONG_SERVER: expected ${state.service.server}`);
      }
      if (claim.receiver !== undefined) {
        const want = expectedReceiver(state.service, state.serverPoints, state.receiverPoints);
        if (claim.receiver !== want) return reject(state, `WRONG_RECEIVER: expected ${want}`);
      }
      return { accepted: true, state: applyPoint(state, intent.winner, policyOf(rules)) };
    }
    case "SCORE_CALL": {
      const p = intent.score;
      if (
        !Number.isInteger(p?.serverPoints) || !Number.isInteger(p?.receiverPoints) ||
        p.serverPoints < 0 || p.receiverPoints < 0
      ) {
        return reject(state, "ILLEGAL_TRANSITION");
      }
      const hits = legalNextStates(state, rules).filter(
        (t) =>
          t.nextState.serverPoints === p.serverPoints &&
          t.nextState.receiverPoints === p.receiverPoints,
      );
      // B02 spec: a score call resolves to exactly one POINT_WON — commit it
      // through the same path, never the previewed state directly. Any
      // server/receiver claim rides along so the rotation firewall still applies.
      if (hits.length === 1 && hits[0].intent.type === "POINT_WON") {
        const heard = intent as { server?: PlayerId; receiver?: PlayerId };
        const point: TennisIntent & { server?: PlayerId; receiver?: PlayerId } = {
          type: "POINT_WON",
          winner: hits[0].intent.winner,
        };
        if (heard.server !== undefined) point.server = heard.server;
        if (heard.receiver !== undefined) point.receiver = heard.receiver;
        return transition(state, point, rules);
      }
      if (hits.length > 1) return reject(state, "AMBIGUOUS_SCORE");
      return reject(state, "ILLEGAL_TRANSITION");
    }
    case "FAULT":
    case "LET":
      return { accepted: true, state };
    case "DISPUTE_START":
      return { accepted: true, state: { ...state, phase: "DISPUTE" } };
    case "SCORE_ROLLBACK": {
      const t = intent.to;
      if (
        !Number.isInteger(t?.serverPoints) || !Number.isInteger(t?.receiverPoints) ||
        t.serverPoints < 0 || t.receiverPoints < 0
      ) {
        return reject(state, "INVALID_ROLLBACK");
      }
      // A rollback inside a tracked TB resets the counters explicitly, so the
      // rotation re-syncs to the target (otherwise it would drift silently).
      const tracked =
        state.inTiebreak && state.service.tiebreakPointNumber !== undefined;
      return {
        accepted: true,
        state: {
          ...state,
          serverPoints: t.serverPoints,
          receiverPoints: t.receiverPoints,
          phase: state.phase === "DISPUTE" ? "PLAYING" : state.phase,
          ...(tracked
            ? {
                service: resyncTiebreakService(
                  state.service,
                  state.service.tiebreakPointNumber as number,
                  t.serverPoints + t.receiverPoints,
                ),
              }
            : {}),
        },
      };
    }
    case "CORRECTION":
    case "CONFIRM_YES":
    case "CONFIRM_NO":
      return reject(state, "UNSUPPORTED_INTENT");
  }
}
