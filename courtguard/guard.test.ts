// B02 proof — stdlib only (`node --test` + `assert/strict`). No LLM near this layer.
// Run: node --test courtguard/guard.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { legalNextStates, transition } from "./guard.ts";
import { compileRuleset } from "./rules/compiler.ts";
import type { CompiledRuleset, MatchState, RulesetDefinition, TeamId } from "../shared/types.ts";

const singles = (over: Partial<MatchState> = {}): MatchState => ({
  matchId: "m1",
  courtId: "c1",
  rulesetId: "standard-singles",
  rulesetVersion: 1,
  phase: "PLAYING",
  serverPoints: 2, // 30
  receiverPoints: 1, // 15
  games: [2, 1],
  sets: [],
  inTiebreak: false,
  service: {
    servingTeam: "A",
    server: "p1",
    receivingTeam: "B",
    deuceReceiver: "p2",
    adReceiver: "p2",
    serviceOrder: ["p1", "p2"],
  },
  winner: null,
  ...over,
});

const stdDef = (over: object = {}): RulesetDefinition => ({
  id: "t",
  version: 1,
  participants: { mode: "SINGLES" },
  game: { scoring: "ADVANTAGE" },
  set: { gamesToWin: 6, winByGames: 2, tiebreak: { atGames: [6, 6], pointsToWin: 7, winByPoints: 2 } },
  decidingSet: { kind: "NORMAL_SET" },
  ...over,
});
const NO_AD = stdDef({ game: { scoring: "NO_AD" } });
const TB10 = stdDef({
  set: { gamesToWin: 6, winByGames: 2, tiebreak: { atGames: [6, 6], pointsToWin: 10, winByPoints: 2 } },
});

const point = (s: MatchState, w: TeamId, rules?: RulesetDefinition | CompiledRuleset) =>
  transition(s, { type: "POINT_WON", winner: w }, rules);

describe("voice table: 30-15 hears a resulting score", () => {
  const cases = [
    { hear: { serverPoints: 3, receiverPoints: 1 }, ok: true as const, label: "40-15 accepts" },
    { hear: { serverPoints: 2, receiverPoints: 2 }, ok: true as const, label: "30-all accepts" },
    { hear: { serverPoints: 3, receiverPoints: 0 }, ok: false as const, label: "40-love rejects" },
  ];
  for (const c of cases) {
    it(c.label, () => {
      const prev = singles();
      const r = transition(prev, { type: "SCORE_CALL", score: c.hear });
      if (c.ok) {
        assert.equal(r.accepted, true);
        if (r.accepted) {
          assert.equal(r.state.serverPoints, c.hear.serverPoints);
          assert.equal(r.state.receiverPoints, c.hear.receiverPoints);
        }
      } else {
        assert.equal(r.accepted, false);
        if (!r.accepted) assert.equal(r.reason, "ILLEGAL_TRANSITION");
        assert.equal(r.state, prev); // unchanged, same reference
        assert.deepEqual(r.state, prev);
      }
    });
  }
});

describe("POINT_WON primitive + game completion", () => {
  it("increments the winner's counter", () => {
    const r = point(singles(), "A");
    assert.equal(r.accepted, true);
    if (r.accepted) {
      assert.equal(r.state.serverPoints, 3);
      assert.equal(r.state.receiverPoints, 1);
      assert.deepEqual(r.state.games, [2, 1]);
    }
  });
  it("40-15 won by server takes the game, resets points, flips serve", () => {
    const r = point(singles({ serverPoints: 3, receiverPoints: 1 }), "A");
    assert.equal(r.accepted, true);
    if (r.accepted) {
      assert.deepEqual(r.state.games, [3, 1]);
      assert.equal(r.state.serverPoints, 0);
      assert.equal(r.state.receiverPoints, 0);
      assert.equal(r.state.service.servingTeam, "B");
      assert.equal(r.state.service.server, "p2");
    }
  });
  it("does not mutate its input", () => {
    const prev = singles();
    Object.freeze(prev);
    point(prev, "A");
    assert.deepEqual([prev.serverPoints, prev.receiverPoints], [2, 1]);
  });
});

describe("deuce / advantage (+2 invariant)", () => {
  it("deuce -> ad -> back to deuce: deciding point alone never takes the game", () => {
    let s = singles({ serverPoints: 3, receiverPoints: 3 });
    let r = point(s, "A");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.deepEqual([r.state.serverPoints, r.state.receiverPoints], [4, 3]);
    assert.deepEqual(r.state.games, [2, 1]); // ad, not game
    r = point(r.state, "B");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.deepEqual([r.state.serverPoints, r.state.receiverPoints], [4, 4]);
    assert.deepEqual(r.state.games, [2, 1]); // +2 required after deuce
  });
  it("ad + one more takes the game", () => {
    const r = point(singles({ serverPoints: 4, receiverPoints: 3 }), "A");
    assert.equal(r.accepted, true);
    if (r.accepted) assert.deepEqual(r.state.games, [3, 1]);
  });
  it("No-Ad: deciding point terminates the game for either side", () => {
    for (const w of ["A", "B"] as TeamId[]) {
      const r = point(singles({ serverPoints: 3, receiverPoints: 3 }), w, NO_AD);
      assert.equal(r.accepted, true);
      if (r.accepted) {
        assert.deepEqual(r.state.games, w === "A" ? [3, 1] : [2, 2]);
        assert.deepEqual([r.state.serverPoints, r.state.receiverPoints], [0, 0]);
      }
    }
  });
});

describe("tiebreak points math", () => {
  const tb = (sp: number, rp: number, over = {}) =>
    singles({ games: [6, 6], sets: [], inTiebreak: true, serverPoints: sp, receiverPoints: rp, ...over });
  it("7-pt TB cannot end 7-6 (win-by-2)", () => {
    const r = point(tb(6, 6), "A");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.inTiebreak, true);
    assert.deepEqual(r.state.sets, []);
    assert.deepEqual([r.state.serverPoints, r.state.receiverPoints], [7, 6]);
  });
  it("7-pt TB ends 9-7 with the set recorded 7-6", () => {
    let s = tb(6, 6);
    for (const w of ["A", "B", "A", "A"] as TeamId[]) {
      const r = point(s, w);
      assert.equal(r.accepted, true);
      if (r.accepted) s = r.state;
    }
    assert.equal(s.inTiebreak, false);
    assert.deepEqual(s.sets, [[7, 6]]);
    assert.deepEqual(s.games, [0, 0]);
  });
  it("10-pt TB: 10-9 not over, 12-10 over", () => {
    let r = point(tb(9, 9), "A", TB10);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.inTiebreak, true);
    r = point(r.state, "B", TB10);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.inTiebreak, true); // 10-all
    r = point(r.state, "A", TB10);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.inTiebreak, true); // 11-10, margin 1
    r = point(r.state, "A", TB10);
    assert.equal(r.accepted, true);
    if (r.accepted) {
      assert.equal(r.state.inTiebreak, false);
      assert.deepEqual(r.state.sets, [[7, 6]]);
    }
  });
});

describe("set completion", () => {
  it("6-5 -> 7-5 closes the set; 5-5 -> 6-5 does not", () => {
    const r = point(singles({ games: [5, 5], serverPoints: 3, receiverPoints: 1 }), "A");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.deepEqual(r.state.games, [6, 5]);
    assert.deepEqual(r.state.sets, []);
    const r2 = point({ ...r.state, serverPoints: 1, receiverPoints: 3 }, "A"); // A now receiving
    assert.equal(r2.accepted, true);
    if (r2.accepted) {
      assert.deepEqual(r2.state.sets, [[7, 5]]);
      assert.deepEqual(r2.state.games, [0, 0]);
    }
  });
  it("a set cannot terminate 6-6: 6-5 vs 5-6 starts the tiebreak instead", () => {
    const r = point(singles({ games: [5, 6], serverPoints: 3, receiverPoints: 1 }), "A");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.deepEqual(r.state.games, [6, 6]);
    assert.deepEqual(r.state.sets, []);
    assert.equal(r.state.inTiebreak, true);
  });
  it("second set won ends the match (winner set, phase COMPLETE)", () => {
    const prev = singles({
      games: [5, 3], sets: [[6, 4]], serverPoints: 3, receiverPoints: 1,
    });
    const r = point(prev, "A");
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.phase, "COMPLETE");
    assert.equal(r.state.winner, "A");
    assert.deepEqual(r.state.games, [6, 3]);
    assert.deepEqual(r.state.sets, [[6, 4]]);
  });
});

describe("DISPUTE guard", () => {
  const frozen = singles({ phase: "DISPUTE", serverPoints: 3, receiverPoints: 2 });
  it("rejects POINT_WON / SCORE_CALL / DISPUTE_START with DISPUTE_FROZEN", () => {
    const intents = [
      { type: "POINT_WON", winner: "A" },
      { type: "SCORE_CALL", score: { serverPoints: 4, receiverPoints: 2 } },
      { type: "DISPUTE_START" },
    ] as const;
    for (const intent of intents) {
      const r = transition(frozen, { ...intent });
      assert.equal(r.accepted, false);
      if (!r.accepted) assert.equal(r.reason, "DISPUTE_FROZEN");
      assert.equal(r.state, frozen);
    }
  });
  it("SCORE_ROLLBACK resolves: points set, phase back to PLAYING", () => {
    const r = transition(frozen, { type: "SCORE_ROLLBACK", to: { serverPoints: 2, receiverPoints: 1 } });
    assert.equal(r.accepted, true);
    if (r.accepted) {
      assert.equal(r.state.phase, "PLAYING");
      assert.deepEqual([r.state.serverPoints, r.state.receiverPoints], [2, 1]);
      assert.deepEqual(r.state.games, [2, 1]);
    }
  });
  it("DISPUTE_START freezes scoring; rollback also works mid-match as a correction", () => {
    const d = transition(singles(), { type: "DISPUTE_START", reason: "contested call" });
    assert.equal(d.accepted, true);
    if (d.accepted) assert.equal(d.state.phase, "DISPUTE");
    const c = transition(singles(), { type: "SCORE_ROLLBACK", to: { serverPoints: 1, receiverPoints: 1 } });
    assert.equal(c.accepted, true);
    if (c.accepted) {
      assert.equal(c.state.phase, "PLAYING");
      assert.deepEqual([c.state.serverPoints, c.state.receiverPoints], [1, 1]);
    }
  });
});

describe("legalNextStates is first-class", () => {
  it("30-15 yields exactly the two point outcomes", () => {
    const nexts = legalNextStates(singles());
    assert.equal(nexts.length, 2);
    assert.deepEqual(
      nexts.map((t) => [t.nextState.serverPoints, t.nextState.receiverPoints]).sort(),
      [[2, 2], [3, 1]],
    );
  });
  it("empty while DISPUTE or COMPLETE", () => {
    assert.deepEqual(legalNextStates(singles({ phase: "DISPUTE" })), []);
    assert.deepEqual(legalNextStates(singles({ phase: "COMPLETE", winner: "A" })), []);
  });
});

describe("protocol edges", () => {
  it("FAULT / LET accept with state untouched", () => {
    const prev = singles();
    for (const t of ["FAULT", "LET"] as const) {
      const r = transition(prev, { type: t });
      assert.equal(r.accepted, true);
      assert.equal(r.state, prev);
    }
  });
  it("CORRECTION / CONFIRM_* are not scoring transitions", () => {
    const prev = singles();
    for (const intent of [{ type: "CORRECTION" }, { type: "CONFIRM_YES" }, { type: "CONFIRM_NO" }] as const) {
      const r = transition(prev, intent);
      assert.equal(r.accepted, false);
      if (!r.accepted) assert.equal(r.reason, "UNSUPPORTED_INTENT");
    }
  });
  it("COMPLETE rejects everything, state unchanged", () => {
    const done = singles({ phase: "COMPLETE", winner: "A" });
    const r = transition(done, { type: "POINT_WON", winner: "A" });
    assert.equal(r.accepted, false);
    if (!r.accepted) assert.equal(r.reason, "MATCH_COMPLETE");
    assert.equal(r.state, done);
  });
  it("same point sequence replays deterministically", () => {
    const seq = ["A", "B", "A", "A"] as TeamId[];
    const run = () => {
      let s = singles();
      for (const w of seq) {
        const r = point(s, w);
        assert.equal(r.accepted, true);
        if (r.accepted) s = r.state;
      }
      return s;
    };
    assert.deepEqual(run(), run());
  });
});

describe("B01 fixture replay", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "shared", "fixtures");
  const load = (n: string): any => JSON.parse(readFileSync(join(dir, n), "utf8"));
  it("offline batch: POINT_WON chain reproduces every resultingState", () => {
    const f = load("offline-unsynced-batch.json");
    for (const e of f.events) {
      const r = transition(e.previousState, e.proposedIntent);
      assert.equal(r.accepted, true, JSON.stringify(e.proposedIntent));
      if (r.accepted) assert.deepEqual(r.state, e.resultingState);
    }
  });
  it("blocked call: 40-love heard from 30-15 rejects, state unchanged", () => {
    const f = load("blocked-call.json");
    const r = transition(f.previousState, f.record.proposedIntent);
    assert.equal(r.accepted, false);
    if (!r.accepted) assert.equal(r.reason, "ILLEGAL_TRANSITION");
    assert.deepEqual(r.state, f.record.resultingState);
  });
  it("match-complete: final POINT_WON ends the match as recorded", () => {
    const f = load("match-complete-next-assignment.json");
    const r = transition(f.finalRecord.previousState, f.finalRecord.proposedIntent);
    assert.equal(r.accepted, true);
    if (r.accepted) assert.deepEqual(r.state, f.finalRecord.resultingState);
  });
});

describe("SCORE_CALL resolves to POINT_WON (B02 spec)", () => {
  it("commits through the POINT_WON path: same resulting state as the primitive", () => {
    const prev = singles();
    for (const heard of [{ serverPoints: 3, receiverPoints: 1 }, { serverPoints: 2, receiverPoints: 2 }]) {
      const viaCall = transition(prev, { type: "SCORE_CALL", score: heard });
      const winner = heard.serverPoints === 3 ? "A" : "B";
      const viaPoint = transition(prev, { type: "POINT_WON", winner });
      assert.equal(viaCall.accepted, true);
      assert.equal(viaPoint.accepted, true);
      if (viaCall.accepted && viaPoint.accepted) assert.deepEqual(viaCall.state, viaPoint.state);
    }
  });
  it("game-winning call resolves to the game (0-0 from 40-15 takes it for A)", () => {
    const prev = singles({ serverPoints: 3, receiverPoints: 1 });
    const viaCall = transition(prev, { type: "SCORE_CALL", score: { serverPoints: 0, receiverPoints: 0 } });
    const viaPoint = transition(prev, { type: "POINT_WON", winner: "A" });
    assert.equal(viaCall.accepted, true);
    if (viaCall.accepted) {
      assert.deepEqual(viaCall.state.games, [3, 1]);
      if (viaPoint.accepted) assert.deepEqual(viaCall.state, viaPoint.state);
    }
  });
});

describe("deciding match tiebreak honors the compiled policy (F1/F3)", () => {
  const MTB = stdDef({
    set: { gamesToWin: 6, winByGames: 2, tiebreak: { atGames: [6, 6], pointsToWin: 7, winByPoints: 2 } },
    decidingSet: { kind: "MATCH_TIEBREAK", pointsToWin: 10, winByPoints: 2 },
  });
  const COMPILED: CompiledRuleset = compileRuleset(structuredClone(MTB));
  const SPLIT: Array<[number, number]> = [[6, 4], [4, 6]];
  const mtb = (sp: number, rp: number): MatchState =>
    singles({ games: [0, 0], sets: structuredClone(SPLIT), inTiebreak: true, serverPoints: sp, receiverPoints: rp });
  // 10-pt MTB table (arch §7): 10-8 over, 10-9 not, 11-9/12-10 over.
  const rows: Array<[string, number, number, TeamId, boolean]> = [
    ["10-8 over", 9, 8, "A", true],
    ["10-9 not over", 9, 9, "A", false],
    ["11-9 over", 10, 9, "A", true],
    ["12-10 over", 11, 10, "A", true],
    ["8-10 over for B", 8, 9, "B", true],
  ];
  for (const [name, sp, rp, w, over] of rows) {
    it(`MTB ${name}`, () => {
      const kinds = [["definition", MTB], ["compiled", COMPILED]] as const;
      for (const [kind, rules] of kinds) {
        const r = point(mtb(sp, rp), w, rules);
        assert.equal(r.accepted, true, `${name} (${kind})`);
        if (!r.accepted) return;
        assert.equal(r.state.phase, over ? "COMPLETE" : "PLAYING", `${name} (${kind})`);
        if (over) {
          assert.equal(r.state.winner, w);
          assert.deepEqual(r.state.sets, SPLIT); // distinct phase: no third set recorded
        } else {
          assert.equal(r.state.inTiebreak, true);
        }
      }
    });
  }
  it("compiled ruleset and definition inputs agree (decidingSet honored)", () => {
    const s = mtb(9, 9);
    const a = point(s, "A", MTB);
    const b = point(structuredClone(s), "A", COMPILED);
    assert.equal(a.accepted, true);
    assert.equal(b.accepted, true);
    if (a.accepted && b.accepted) assert.deepEqual(a.state, b.state);
  });
  it("second set won at 1-1 starts the deciding MTB, not a third set", () => {
    const prev = singles({
      games: [5, 3], sets: [[4, 6]], serverPoints: 3, receiverPoints: 1,
    });
    const r = point(prev, "A", MTB);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.state.phase, "PLAYING");
    assert.equal(r.state.inTiebreak, true);
    assert.deepEqual(r.state.sets, [[4, 6], [6, 3]]);
    assert.deepEqual(r.state.games, [0, 0]);
  });
});
