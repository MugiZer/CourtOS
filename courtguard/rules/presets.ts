// B03 — demo rule presets through the ONE declarative model (no engine forks).
// Authority: architecture.md §7. All compile via compileRuleset().
import type { RulesetDefinition } from "../../shared/types.ts";

const SET_TIEBREAK = {
  atGames: [6, 6] as [number, number],
  pointsToWin: 7,
  winByPoints: 2,
};

export const standardSingles: RulesetDefinition = {
  id: "standard-singles",
  version: 1,
  participants: { mode: "SINGLES" },
  game: { scoring: "ADVANTAGE" },
  set: { gamesToWin: 6, winByGames: 2, tiebreak: { ...SET_TIEBREAK } },
  decidingSet: { kind: "NORMAL_SET" },
};

export const standardDoubles: RulesetDefinition = {
  id: "standard-doubles",
  version: 1,
  participants: { mode: "DOUBLES" },
  game: { scoring: "ADVANTAGE" },
  set: { gamesToWin: 6, winByGames: 2, tiebreak: { ...SET_TIEBREAK } },
  decidingSet: { kind: "NORMAL_SET" },
};

// No-Ad doubles: 40-40 deciding point + 10-pt deciding match tiebreak.
export const noAdDoubles: RulesetDefinition = {
  id: "no-ad-doubles",
  version: 1,
  participants: { mode: "DOUBLES" },
  game: { scoring: "NO_AD" },
  set: { gamesToWin: 6, winByGames: 2, tiebreak: { ...SET_TIEBREAK } },
  decidingSet: { kind: "MATCH_TIEBREAK", pointsToWin: 10, winByPoints: 2 },
};

// Express / fast-play: same model, short sets (first to 4) + No-Ad + 10-pt MTB.
export const express: RulesetDefinition = {
  id: "express",
  version: 1,
  participants: { mode: "SINGLES" },
  game: { scoring: "NO_AD" },
  set: {
    gamesToWin: 4,
    winByGames: 2,
    tiebreak: { atGames: [4, 4], pointsToWin: 7, winByPoints: 2 },
  },
  decidingSet: { kind: "MATCH_TIEBREAK", pointsToWin: 10, winByPoints: 2 },
};

export const PRESETS = { standardSingles, standardDoubles, noAdDoubles, express };
