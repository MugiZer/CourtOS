// B03 proof — preset behavior table (stdlib only: node:test + assert).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileRuleset } from "./compiler.ts";
import { express, noAdDoubles, standardDoubles, standardSingles } from "./presets.ts";
import type { CompiledRuleset, MatchState } from "../../shared/types.ts";

const adv = compileRuleset(structuredClone(standardSingles));
const dbl = compileRuleset(structuredClone(standardDoubles));
const noAd = compileRuleset(structuredClone(noAdDoubles));
const exp = compileRuleset(structuredClone(express));

function mkGame(c: CompiledRuleset, s: number, r: number, extra: Partial<MatchState> = {}): MatchState {
  return {
    matchId: "m", courtId: "c1", rulesetId: c.definition.id, rulesetVersion: 1,
    phase: "PLAYING", serverPoints: s, receiverPoints: r, games: [0, 0], sets: [],
    inTiebreak: false,
    service: {
      servingTeam: "A", server: "p1", receivingTeam: "B",
      deuceReceiver: "p2", adReceiver: "p2", serviceOrder: ["p1", "p2"],
    },
    winner: null, ...extra,
  };
}
const tbPts = (c: CompiledRuleset, s: number, r: number, sets: Array<[number, number]> = []) =>
  mkGame(c, s, r, { inTiebreak: true, sets });

describe("game policy: advantage vs No-Ad", () => {
  const rows: Array<[string, CompiledRuleset, number, number, "A" | "B" | null]> = [
    ["adv 40-40 stays", adv, 3, 3, null],
    ["adv ad-in stays", adv, 4, 3, null],
    ["adv +2 wins", adv, 5, 3, "A"],
    ["adv long deuce wins", adv, 7, 5, "A"],
    ["adv receiver wins", adv, 3, 5, "B"],
    ["no-ad 40-40 stays", noAd, 3, 3, null],
    ["no-ad 40-40 next point wins", noAd, 4, 3, "A"],
    ["no-ad receiver deciding point", noAd, 3, 4, "B"],
    ["dbl advantage needs +2", dbl, 4, 3, null],
    ["express no-ad deciding point", exp, 4, 3, "A"],
  ];
  for (const [name, c, s, r, want] of rows) {
    it(name, () => assert.equal(c.gameWinner(mkGame(c, s, r)), want));
  }
  it("gameWinner is null inside a tiebreak", () => {
    assert.equal(adv.gameWinner(tbPts(adv, 4, 3)), null);
  });
});

describe("set policy", () => {
  it("6-4 wins, 6-5 waits, 7-5 wins, 6-6 waits for tiebreak", () => {
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [6, 4] })), "A");
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [6, 5] })), null);
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [7, 5] })), "A");
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [6, 6] })), null);
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [4, 6] })), "B");
  });
  it("post-tiebreak 7-6 wins the set", () => {
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [7, 6] })), "A");
    assert.equal(adv.setWinner(mkGame(adv, 0, 0, { games: [6, 7] })), "B");
  });
  it("express short set: 4-2 wins, trigger at 4-4", () => {
    assert.equal(exp.setWinner(mkGame(exp, 0, 0, { games: [4, 2] })), "A");
    assert.equal(exp.shouldStartTiebreak(mkGame(exp, 0, 0, { games: [4, 4] })), true);
    assert.equal(exp.shouldStartTiebreak(mkGame(exp, 0, 0, { games: [6, 6] })), false);
  });
  it("set tiebreak starts at 6-6 only", () => {
    assert.equal(adv.shouldStartTiebreak(mkGame(adv, 0, 0, { games: [6, 6] })), true);
    assert.equal(adv.shouldStartTiebreak(mkGame(adv, 0, 0, { games: [6, 5] })), false);
    assert.equal(adv.shouldStartTiebreak(mkGame(adv, 0, 0, { games: [5, 5] })), false);
  });
});

describe("tiebreak policy: 7-pt set TB + 10-pt deciding MTB as distinct phase", () => {
  const setTb: Array<[string, number, number, "A" | "B" | null]> = [
    ["7-5 over", 7, 5, "A"],
    ["7-6 not over", 7, 6, null],
    ["6-6 not over", 6, 6, null],
    ["9-7 over", 9, 7, "A"],
  ];
  for (const [name, s, r, want] of setTb)
    it(`set TB ${name}`, () => assert.equal(adv.tiebreakWinner(tbPts(adv, s, r)), want));

  const mtb: Array<[string, number, number, "A" | "B" | null]> = [
    ["10-8 over", 10, 8, "A"],
    ["10-9 not over", 10, 9, null],
    ["11-9 over", 11, 9, "A"],
    ["12-10 over", 12, 10, "A"],
    ["9-9 not over", 9, 9, null],
  ];
  for (const [name, s, r, want] of mtb) {
    it(`deciding MTB ${name}`, () => {
      assert.equal(noAd.tiebreakWinner(tbPts(noAd, s, r, [[6, 4], [4, 6]])), want);
    });
  }
  it("MTB target applies only when sets split 1-1 (7-pt TB otherwise)", () => {
    assert.equal(noAd.tiebreakWinner(tbPts(noAd, 7, 5, [[6, 4]])), "A"); // set-1 TB
    assert.equal(noAd.tiebreakWinner(tbPts(noAd, 9, 8, [[6, 4], [4, 6]])), null); // MTB needs 10
  });
  it("deciding MTB starts at 1-1 sets, never on NORMAL_SET", () => {
    const split = mkGame(noAd, 0, 0, { sets: [[6, 4], [4, 6]] });
    assert.equal(noAd.shouldStartMatchTiebreak(split), true);
    assert.equal(noAd.shouldStartTiebreak({ ...split, games: [0, 0] }), false);
    assert.equal(adv.shouldStartMatchTiebreak(mkGame(adv, 0, 0, { sets: [[6, 4], [4, 6]] })), false);
    assert.equal(noAd.shouldStartMatchTiebreak(mkGame(noAd, 0, 0, { sets: [[6, 4]] })), false);
  });
  it("completed deciding MTB ends the match", () => {
    const done = tbPts(noAd, 10, 8, [[6, 4], [4, 6]]);
    assert.equal(noAd.nextPhase(done), "COMPLETE");
    assert.deepEqual(noAd.legalEvents(done), []);
  });
});

describe("phase + legalEvents seam (B02 builds on this)", () => {
  it("2-0 sets completes; 1-1 stays; DISPUTE preserved", () => {
    assert.equal(adv.nextPhase(mkGame(adv, 0, 0, { sets: [[6, 4], [6, 3]] })), "COMPLETE");
    assert.equal(adv.nextPhase(mkGame(adv, 0, 0, { sets: [[6, 4], [4, 6]] })), "PLAYING");
    assert.equal(adv.nextPhase(mkGame(adv, 3, 3, { phase: "DISPUTE" })), "DISPUTE");
  });
  it("PLAYING offers POINT_WON A/B; frozen/complete offers nothing", () => {
    assert.deepEqual(adv.legalEvents(mkGame(adv, 2, 1)).map((e) => (e as { winner: string }).winner), ["A", "B"]);
    assert.deepEqual(adv.legalEvents(mkGame(adv, 2, 1, { phase: "DISPUTE" })), []);
    assert.deepEqual(adv.legalEvents(mkGame(adv, 0, 0, { phase: "COMPLETE", winner: "A" })), []);
  });
  it("tiebreakWinner is null outside a tiebreak", () => {
    assert.equal(adv.tiebreakWinner(mkGame(adv, 7, 5)), null);
  });
});
