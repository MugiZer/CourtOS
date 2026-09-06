// B03 — RuleCompiler: declarative RulesetDefinition -> CompiledRuleset.
// Authority: architecture.md §§7,15. Shape conforms EXACTLY to B01's
// CompiledRuleset in shared/types.ts (frozen seam shared with B02).
// Erasable-syntax only so node --test runs it with zero deps.
import type {
  CompiledRuleset,
  MatchPhase,
  MatchState,
  RulesetDefinition,
  TeamId,
  TennisIntent,
} from "../../shared/types.ts";

function fail(reason: string): never {
  throw new Error(`invalid ruleset: ${reason}`);
}

function leader(a: number, b: number): TeamId | null {
  if (a > b) return "A";
  if (b > a) return "B";
  return null;
}

function assertPosInt(v: unknown, name: string): asserts v is number {
  if (!Number.isInteger(v) || (v as number) <= 0) fail(`${name} must be integer >= 1, got ${v}`);
}

// Demo scope is best-of-3: first to 2 sets (incl. deciding match tiebreak).
const SETS_TO_WIN = 2;

function setWins(sets: Array<[number, number]>): [number, number] {
  let a = 0;
  let b = 0;
  for (const [x, y] of sets) {
    if (x > y) a++;
    else if (y > x) b++;
  }
  return [a, b];
}

// True once the completed sets are split (1-1): the deciding match tiebreak is due.
function setsSplit(state: MatchState): boolean {
  const [a, b] = setWins(state.sets);
  return a >= 1 && a === b;
}

// True while the live tiebreak is the deciding match tiebreak (distinct phase,
// not a third set): deciding format is MATCH_TIEBREAK and sets are split 1-1.
function inMatchTiebreak(state: MatchState, def: RulesetDefinition): boolean {
  return (
    state.inTiebreak &&
    def.decidingSet.kind === "MATCH_TIEBREAK" &&
    setsSplit(state)
  );
}

export function compileRuleset(definition: RulesetDefinition): CompiledRuleset {
  if (!definition || typeof definition !== "object") fail("definition must be an object");
  if (typeof definition.id !== "string" || definition.id.length === 0)
    fail("id must be a non-empty string");
  assertPosInt(definition.version, "version");
  if (!["SINGLES", "DOUBLES"].includes(definition.participants?.mode))
    fail(`participants.mode must be SINGLES|DOUBLES, got ${definition.participants?.mode}`);
  if (!["ADVANTAGE", "NO_AD"].includes(definition.game?.scoring))
    fail(`game.scoring must be ADVANTAGE|NO_AD, got ${definition.game?.scoring}`);

  const set = definition.set;
  assertPosInt(set?.gamesToWin, "set.gamesToWin");
  assertPosInt(set?.winByGames, "set.winByGames");
  if (set.winByGames > set.gamesToWin)
    fail(`set.winByGames (${set.winByGames}) cannot exceed set.gamesToWin (${set.gamesToWin})`);

  const tb = set?.tiebreak;
  if (tb !== undefined) {
    if (!Array.isArray(tb.atGames) || tb.atGames.length !== 2) fail("set.tiebreak.atGames must be [n, n]");
    for (const g of tb.atGames) assertPosInt(g, "set.tiebreak.atGames[]");
    if (tb.atGames[0] !== tb.atGames[1])
      fail(`set.tiebreak.atGames must be symmetric, got [${tb.atGames}]`);
    if (tb.atGames[0] < set.gamesToWin)
      fail(`set.tiebreak.atGames [${tb.atGames}] fires before a set can be won (gamesToWin ${set.gamesToWin})`);
    assertPosInt(tb.pointsToWin, "set.tiebreak.pointsToWin");
    assertPosInt(tb.winByPoints, "set.tiebreak.winByPoints");
  }

  const dec = definition.decidingSet;
  const decKind = dec?.kind;
  if (decKind !== "NORMAL_SET" && decKind !== "MATCH_TIEBREAK")
    fail(`decidingSet.kind must be NORMAL_SET|MATCH_TIEBREAK, got ${decKind}`);
  if (dec.kind === "MATCH_TIEBREAK") {
    assertPosInt(dec.pointsToWin, "decidingSet.pointsToWin");
    assertPosInt(dec.winByPoints, "decidingSet.winByPoints");
  }

  const noAd = definition.game.scoring === "NO_AD";

  // Match is decided by 2 set wins, or by a completed deciding match tiebreak.
  function matchWinner(state: MatchState): TeamId | null {
    const [a, b] = setWins(state.sets);
    if (a >= SETS_TO_WIN) return "A";
    if (b >= SETS_TO_WIN) return "B";
    if (inMatchTiebreak(state, definition)) return tiebreakWinner(state);
    return null;
  }

  function gameWinner(state: MatchState): TeamId | null {
    if (state.inTiebreak) return null;
    const { serverPoints: s, receiverPoints: r } = state;
    if (noAd) return Math.max(s, r) >= 4 ? leader(s, r) : null; // 40-40: next point wins
    return Math.max(s, r) >= 4 && Math.abs(s - r) >= 2 ? leader(s, r) : null;
  }

  function setWinner(state: MatchState): TeamId | null {
    const [gA, gB] = state.games;
    if (Math.max(gA, gB) >= set.gamesToWin && Math.abs(gA - gB) >= set.winByGames)
      return leader(gA, gB);
    // Post-tiebreak 7-6 (tiebreak win recorded as one extra game).
    if (tb !== undefined) {
      const t = tb.atGames[0];
      if ((gA === t + 1 && gB === t) || (gB === t + 1 && gA === t)) return leader(gA, gB);
    }
    return null;
  }

  function shouldStartTiebreak(state: MatchState): boolean {
    if (tb === undefined || state.phase !== "PLAYING" || state.inTiebreak) return false;
    if (matchWinner(state) !== null) return false;
    // Deciding match tiebreak takes precedence over a set tiebreak once split.
    if (definition.decidingSet.kind === "MATCH_TIEBREAK" && setsSplit(state)) return false;
    return state.games[0] === tb.atGames[0] && state.games[1] === tb.atGames[1];
  }

  function shouldStartMatchTiebreak(state: MatchState): boolean {
    if (definition.decidingSet.kind !== "MATCH_TIEBREAK") return false;
    if (state.phase !== "PLAYING" || state.inTiebreak) return false;
    if (matchWinner(state) !== null) return false;
    return setsSplit(state);
  }

  function tiebreakWinner(state: MatchState): TeamId | null {
    if (!state.inTiebreak) return null;
    const target = inMatchTiebreak(state, definition)
      ? definition.decidingSet
      : tb !== undefined
        ? tb
        : null;
    if (target === null || !("pointsToWin" in target)) return null;
    const { serverPoints: s, receiverPoints: r } = state;
    return Math.max(s, r) >= target.pointsToWin && Math.abs(s - r) >= target.winByPoints
      ? leader(s, r)
      : null;
  }

  function legalEvents(state: MatchState): TennisIntent[] {
    if (state.phase !== "PLAYING" || matchWinner(state) !== null) return [];
    return [{ type: "POINT_WON", winner: "A" }, { type: "POINT_WON", winner: "B" }];
  }

  function nextPhase(state: MatchState): MatchPhase {
    // ponytail: DISPUTE/CHANGEOVER preserved verbatim; only the engine may
    // declare COMPLETE (B02 transition owns the DISPUTE freeze, not this).
    return matchWinner(state) !== null ? "COMPLETE" : state.phase;
  }

  return {
    definition,
    gameWinner,
    setWinner,
    shouldStartTiebreak,
    shouldStartMatchTiebreak,
    tiebreakWinner,
    legalEvents,
    nextPhase,
  };
}
