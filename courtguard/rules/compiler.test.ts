// B03 proof — compiler accept/reject table (stdlib only: node:test + assert).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileRuleset } from "./compiler.ts";
import { PRESETS } from "./presets.ts";
import type { RulesetDefinition } from "../../shared/types.ts";

const base: RulesetDefinition = structuredClone(PRESETS.standardSingles);
const withPatch = (patch: (d: RulesetDefinition) => void): RulesetDefinition => {
  const d = structuredClone(base);
  patch(d);
  return d;
};

describe("compileRuleset accept table", () => {
  for (const [name, def] of Object.entries(PRESETS)) {
    it(`compiles preset ${name}`, () => {
      const c = compileRuleset(structuredClone(def));
      assert.equal(c.definition.id, def.id);
      for (const fn of ["gameWinner", "setWinner", "shouldStartTiebreak",
        "shouldStartMatchTiebreak", "tiebreakWinner", "legalEvents", "nextPhase"] as const)
        assert.equal(typeof c[fn], "function", `${name}.${fn}`);
    });
  }
});

describe("compileRuleset reject table", () => {
  const bad: Array<[string, (d: RulesetDefinition) => void, RegExp]> = [
    ["gamesToWin 0", (d) => { d.set.gamesToWin = 0; }, /gamesToWin/],
    ["gamesToWin -2", (d) => { d.set.gamesToWin = -2; }, /gamesToWin/],
    ["winByGames 0", (d) => { d.set.winByGames = 0; }, /winByGames/],
    ["winByGames exceeds gamesToWin", (d) => { d.set.winByGames = 7; }, /winByGames/],
    ["set TB pointsToWin 0", (d) => { d.set.tiebreak!.pointsToWin = 0; }, /pointsToWin/],
    ["set TB winByPoints 0", (d) => { d.set.tiebreak!.winByPoints = 0; }, /winByPoints/],
    ["TB trigger before set winnable", (d) => { d.set.tiebreak!.atGames = [2, 2]; }, /atGames/],
    ["TB trigger asymmetric", (d) => { d.set.tiebreak!.atGames = [6, 5]; }, /atGames/],
    ["deciding MTB pointsToWin 0", (d) => {
      d.decidingSet = { kind: "MATCH_TIEBREAK", pointsToWin: 0, winByPoints: 2 };
    }, /pointsToWin/],
    ["deciding MTB winByPoints -1", (d) => {
      d.decidingSet = { kind: "MATCH_TIEBREAK", pointsToWin: 10, winByPoints: -1 };
    }, /winByPoints/],
    ["version 0", (d) => { d.version = 0; }, /version/],
    ["empty id", (d) => { d.id = ""; }, /id/],
    ["bad scoring", (d) => { (d as any).game.scoring = "FIRST_TO_4"; }, /scoring/],
    ["bad mode", (d) => { (d as any).participants.mode = "TRIPLES"; }, /mode/],
  ];
  for (const [name, patch, reason] of bad) {
    it(`rejects ${name} with reason`, () => {
      assert.throws(() => compileRuleset(withPatch(patch)), reason);
    });
  }
});
