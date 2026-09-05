// B02 CourtGuard core — deterministic scoring firewall (singles scope, generic point math).
// Authority: architecture.md §§6,8 + shared/types.ts (frozen contract, mirrored only).
// No LLM, no deps, numeric counters only (never display strings as state).
// Erasable-syntax TS so `node --test` loads it directly. No tiebreak serve
// rotation here (B04 owns doubles/TB rotation); singles serve just alternates.
import type {
  CompiledRuleset,
  MatchState,
  RulesetDefinition,
  TeamId,
  TennisIntent,
} from "../shared/types.ts";

export type GuardResult =
  | { accepted: true; state: MatchState }
  | { accepted: false; reason: string; state: MatchState };

export interface LegalTransition {
  intent: TennisIntent;
  nextState: MatchState;
}

// B03 passes a CompiledRuleset; tests/fixtures pass a definition or nothing.
export type RulesInput = CompiledRuleset | RulesetDefinition | undefined;

interface GuardCfg {
  scoring: "ADVANTAGE" | "NO_AD";
  gamesToWin: number;
  winByGames: number;
  tiebreakAt: [number, number] | null;
  tiebreakPoints: number;
  tiebreakMargin: number;
}

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

const idx = (t: TeamId): number => (t === "A" ? 0 : 1);
const other = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

function cfgOf(rules: RulesInput): GuardCfg {
  const d: RulesetDefinition =
    rules === undefined
      ? STANDARD_SINGLES
      : ((rules as { definition?: RulesetDefinition }).definition ??
        (rules as RulesetDefinition));
  const tb = d.set?.tiebreak;
  return {
    scoring: d.game?.scoring ?? "ADVANTAGE",
    gamesToWin: d.set?.gamesToWin ?? 6,
    winByGames: d.set?.winByGames ?? 2,
    tiebreakAt: tb ? tb.atGames : null,
    tiebreakPoints: tb?.pointsToWin ?? 7,
    tiebreakMargin: tb?.winByPoints ?? 2,
  };
}

// Singles alternation: the other player serves next, receives accordingly.
function flipService(s: MatchState): MatchState["service"] {
  const server = s.service.serviceOrder.find((p) => p !== s.service.server) ?? s.service.server;
  const receiver = s.service.serviceOrder.find((p) => p !== server) ?? s.service.receivingTeam;
  return {
    ...s.service,
    servingTeam: other(s.service.servingTeam),
    server,
    receivingTeam: other(s.service.receivingTeam),
    deuceReceiver: receiver,
    adReceiver: receiver,
  };
}

function setWon(games: readonly number[], cfg: GuardCfg): boolean {
  return (
    Math.max(games[0], games[1]) >= cfg.gamesToWin &&
    Math.abs(games[0] - games[1]) >= cfg.winByGames
  );
}

// Standard singles: best-of-3, first to 2 completed sets.
function matchWon(sets: Array<[number, number]>, winner: TeamId): boolean {
  return sets.filter((g) => (g[0] > g[1] ? "A" : "B") === winner).length >= 2;
}

function winGame(s: MatchState, winner: TeamId, cfg: GuardCfg): MatchState {
  const games = [s.games[0], s.games[1]] as [number, number];
  games[idx(winner)] += 1;
  if (cfg.tiebreakAt !== null && games[0] === cfg.tiebreakAt[0] && games[1] === cfg.tiebreakAt[1]) {
    const base = { ...s, serverPoints: 0, receiverPoints: 0, games, inTiebreak: true };
    return { ...base, service: flipService(base) };
  }
  if (setWon(games, cfg)) {
    // Match-winning game keeps the final set in `games` (see match-complete fixture).
    if (matchWon([...s.sets, games], winner)) {
      return { ...s, serverPoints: 0, receiverPoints: 0, games, phase: "COMPLETE", winner };
    }
    const base = {
      ...s,
      serverPoints: 0,
      receiverPoints: 0,
      games: [0, 0] as [number, number],
      sets: [...s.sets, games],
    };
    return { ...base, service: flipService(base) };
  }
  const base = { ...s, serverPoints: 0, receiverPoints: 0, games };
  return { ...base, service: flipService(base) };
}

function winTiebreak(s: MatchState, winner: TeamId): MatchState {
  const decided: [number, number] = winner === "A" ? [7, 6] : [6, 7];
  const sets = [...s.sets, decided];
  if (matchWon(sets, winner)) {
    return {
      ...s, serverPoints: 0, receiverPoints: 0,
      games: [0, 0] as [number, number], sets, inTiebreak: false, phase: "COMPLETE", winner,
    };
  }
  const base = {
    ...s, serverPoints: 0, receiverPoints: 0,
    games: [0, 0] as [number, number], sets, inTiebreak: false,
  };
  return { ...base, service: flipService(base) };
}

function applyPoint(s: MatchState, winner: TeamId, cfg: GuardCfg): MatchState {
  const serverWon = winner === s.service.servingTeam;
  const serverPoints = s.serverPoints + (serverWon ? 1 : 0);
  const receiverPoints = s.receiverPoints + (serverWon ? 0 : 1);
  const next = { ...s, serverPoints, receiverPoints };
  const w = serverWon ? serverPoints : receiverPoints;
  const l = serverWon ? receiverPoints : serverPoints;
  if (s.inTiebreak) {
    if (w >= cfg.tiebreakPoints && w - l >= cfg.tiebreakMargin) return winTiebreak(next, winner);
    return next;
  }
  if (w >= 4 && (cfg.scoring === "NO_AD" || w - l >= 2)) return winGame(next, winner, cfg);
  return next;
}

// First-class API: every legal point outcome from here (powers transition,
// voice ranking, tactile controls). Empty when no point can be played.
export function legalNextStates(state: MatchState, rules?: RulesInput): LegalTransition[] {
  if (state.phase === "DISPUTE" || state.phase === "COMPLETE") return [];
  const cfg = cfgOf(rules);
  return (["A", "B"] as TeamId[]).map((winner) => ({
    intent: { type: "POINT_WON", winner },
    nextState: applyPoint(state, winner, cfg),
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
      return { accepted: true, state: applyPoint(state, intent.winner, cfgOf(rules)) };
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
      if (hits.length === 1) return { accepted: true, state: hits[0].nextState };
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
      return {
        accepted: true,
        state: {
          ...state,
          serverPoints: t.serverPoints,
          receiverPoints: t.receiverPoints,
          phase: state.phase === "DISPUTE" ? "PLAYING" : state.phase,
        },
      };
    }
    case "CORRECTION":
    case "CONFIRM_YES":
    case "CONFIRM_NO":
      return reject(state, "UNSUPPORTED_INTENT");
  }
}
