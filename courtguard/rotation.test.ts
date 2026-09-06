// B04 proof — doubles + tiebreak rotation, stdlib only (`node --test` + `assert/strict`).
// Run: node --test courtguard/rotation.test.ts
// Covers the ticket verification: full singles + doubles TB sequences (seeded
// 6-6 entry), doubles full-match service-order trace, wrong-server rejection,
// post-TB restore, deciding 10-pt MTB under B03's preset. Zero rotation drift.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transition } from "./guard.ts";
import { compileRuleset } from "./rules/compiler.ts";
import { noAdDoubles, standardDoubles, standardSingles } from "./rules/presets.ts";
import { expectedReceiver, shouldChangeEnds } from "./rotation.ts";
import type { CompiledRuleset, MatchState, PlayerId, TeamId, TennisIntent } from "../shared/types.ts";

const SGL: CompiledRuleset = compileRuleset(structuredClone(standardSingles));
const DBL: CompiledRuleset = compileRuleset(structuredClone(standardDoubles));
const MTB: CompiledRuleset = compileRuleset(structuredClone(noAdDoubles));

const PAIR = ["p1", "p2"];
const ORDER = ["A1", "B1", "A2", "B2"];

const base = (over: Partial<MatchState> = {}): MatchState => ({
  matchId: "m1",
  courtId: "c1",
  rulesetId: "t",
  rulesetVersion: 1,
  phase: "PLAYING",
  serverPoints: 0,
  receiverPoints: 0,
  games: [0, 0],
  sets: [],
  inTiebreak: false,
  service: {
    servingTeam: "A",
    server: "A1",
    receivingTeam: "B",
    deuceReceiver: "B1",
    adReceiver: "B2",
    serviceOrder: [...ORDER],
  },
  winner: null,
  ...over,
});

const singles = (over: Partial<MatchState> = {}): MatchState =>
  base({
    service: {
      servingTeam: "A", server: "p1", receivingTeam: "B",
      deuceReceiver: "p2", adReceiver: "p2", serviceOrder: [...PAIR],
    },
    ...over,
  });

type Claim = { server?: PlayerId; receiver?: PlayerId };

function point(s: MatchState, w: TeamId, rules: CompiledRuleset, claim: Claim = {}): MatchState {
  const r = transition(s, { type: "POINT_WON", winner: w, ...claim } as TennisIntent, rules);
  assert.equal(r.accepted, true, `expected accept, got ${!r.accepted ? r.reason : "?"}`);
  if (!r.accepted) throw new Error("unreachable");
  return r.state;
}

function game(s: MatchState, w: TeamId, rules: CompiledRuleset): MatchState {
  let c = s;
  for (let i = 0; i < 4; i++) c = point(c, w, rules);
  return c;
}

describe("singles full tiebreak from seeded 6-6 entry (1-2-2-2, ends, restore)", () => {
  it("servers alternate 1-2-2-2, ends change at 6/12, order restored after", () => {
    // Seeded entry: 5-6, deuce on B's serve; A takes two points -> 6-6 TB, p1 first.
    let s = point(singles({
      games: [5, 6], serverPoints: 3, receiverPoints: 3,
      service: {
        servingTeam: "B", server: "p2", receivingTeam: "A",
        deuceReceiver: "p1", adReceiver: "p1", serviceOrder: [...PAIR],
      },
    }), "A", SGL);
    s = point(s, "A", SGL);
    assert.equal(s.inTiebreak, true);
    assert.deepEqual(s.games, [6, 6]);
    assert.equal(s.service.server, "p1");
    assert.equal(s.service.servingTeam, "A");
    assert.equal(s.service.tiebreakPointNumber, 0);

    // Absolute 8-6 for A (t0 = A, so serverPoints tracks A): [A,B]x6 then A,A.
    const winners = ["A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "A"] as TeamId[];
    const servers = ["p1", "p2", "p2", "p1", "p1", "p2", "p2", "p1", "p1", "p2", "p2", "p1", "p1", "p2"];
    const teams = ["A", "B", "B", "A", "A", "B", "B", "A", "A", "B", "B", "A", "A", "B"] as TeamId[];
    for (let n = 0; n < winners.length; n++) {
      const total = s.serverPoints + s.receiverPoints;
      assert.equal(total, n);
      assert.equal(s.service.server, servers[n], `point ${n} server`);
      assert.equal(s.service.servingTeam, teams[n], `point ${n} team`);
      assert.equal(s.service.tiebreakPointNumber, n, `point ${n} number`);
      assert.equal(shouldChangeEnds(total), total === 6 || total === 12, `ends at ${total}`);
      s = point(s, winners[n], SGL);
    }
    assert.equal(s.inTiebreak, false);
    assert.deepEqual(s.sets, [[7, 6]]);
    assert.deepEqual(s.games, [0, 0]);
    // Restore: p1 served first, so p2 serves the next set; A receives.
    assert.equal(s.service.server, "p2");
    assert.equal(s.service.servingTeam, "B");
    assert.equal(s.service.receivingTeam, "A");
    assert.equal(s.service.deuceReceiver, "p1");
    assert.equal(s.service.adReceiver, "p1");
    assert.ok(!("tiebreakPointNumber" in s.service));
    assert.deepEqual(s.service.serviceOrder, PAIR); // zero drift
  });
});

describe("doubles full-match service trace + full tiebreak + restore", () => {
  it("12 games cycle A1,B1,A2,B2 with correct pairs, TB is 1-2-2-2, next set resumes at B1", () => {
    let s = base();
    const gameServers = ["A1", "B1", "A2", "B2", "A1", "B1", "A2", "B2", "A1", "B1", "A2", "B2"];
    const gameWinners = ["A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "B"] as TeamId[];
    for (let g = 0; g < 12; g++) {
      assert.equal(s.service.server, gameServers[g], `game ${g + 1} server`);
      assert.equal(s.service.servingTeam, g % 2 === 0 ? "A" : "B", `game ${g + 1} team`);
      // Rotation advances regardless of who wins the game.
      if (s.service.servingTeam === "A") {
        assert.deepEqual([s.service.deuceReceiver, s.service.adReceiver], ["B1", "B2"]);
      } else {
        assert.deepEqual([s.service.deuceReceiver, s.service.adReceiver], ["A1", "A2"]);
      }
      s = game(s, gameWinners[g], DBL);
    }
    // Engine TB entry: last game served by B2 -> A1 serves the first TB point.
    assert.deepEqual(s.games, [6, 6]);
    assert.equal(s.inTiebreak, true);
    assert.equal(s.service.server, "A1");
    assert.equal(s.service.servingTeam, "A");
    assert.equal(s.service.tiebreakPointNumber, 0);

    // Server-relative 7-5 path (12 points, ends 7-5 exactly at the last point).
    // t0 = A, so these absolute A/B counts ARE the tiebreak score.
    const winners = ["A", "A", "B", "B", "A", "B", "A", "A", "B", "B", "A", "A"] as TeamId[];
    const servers = ["A1", "B1", "B1", "A2", "A2", "B2", "B2", "A1", "A1", "B1", "B1", "A2"];
    const teams = ["A", "B", "B", "A", "A", "B", "B", "A", "A", "B", "B", "A"] as TeamId[];
    for (let n = 0; n < winners.length; n++) {
      const total = s.serverPoints + s.receiverPoints;
      assert.equal(total, n);
      assert.equal(s.service.server, servers[n], `TB point ${n} server`);
      assert.equal(s.service.servingTeam, teams[n], `TB point ${n} team`);
      assert.equal(s.service.tiebreakPointNumber, n, `TB point ${n} number`);
      assert.equal(shouldChangeEnds(total), total === 6, `ends at ${total}`);
      const pair = teams[n] === "A" ? ["B1", "B2"] : ["A1", "A2"];
      assert.deepEqual([s.service.deuceReceiver, s.service.adReceiver], pair, `TB point ${n} receivers`);
      s = point(s, winners[n], DBL);
    }
    assert.equal(s.serverPoints + s.receiverPoints, 0); // points reset on TB win
    assert.equal(s.inTiebreak, false);
    assert.deepEqual(s.sets, [[7, 6]]);
    assert.deepEqual(s.games, [0, 0]);
    // Restore: A1 served first -> B1 (one rotation step on) serves set two.
    assert.equal(s.service.server, "B1");
    assert.equal(s.service.servingTeam, "B");
    assert.equal(s.service.receivingTeam, "A");
    assert.deepEqual([s.service.deuceReceiver, s.service.adReceiver], ["A1", "A2"]);
    assert.ok(!("tiebreakPointNumber" in s.service));
    // The cycle continues with zero drift: B1 then A2.
    s = game(s, "B", DBL);
    assert.equal(s.service.server, "A2");
    assert.equal(s.service.servingTeam, "A");
    s = game(s, "A", DBL);
    assert.equal(s.service.server, "B2");
    assert.deepEqual(s.service.serviceOrder, ORDER);
  });
});

describe("wrong-server / wrong-receiver firewall", () => {
  const mid = () => base({ serverPoints: 2, receiverPoints: 0 }); // A1 serving, B1/B2 receiving
  it("rejects the wrong server with the expected name, accepts the right one", () => {
    const prev = mid();
    const r = transition(prev, { type: "POINT_WON", winner: "A", server: "B1" } as TennisIntent, DBL);
    assert.equal(r.accepted, false);
    if (!r.accepted) {
      assert.match(r.reason, /WRONG_SERVER/);
      assert.ok(r.reason.includes("A1"), `reason names A1: ${r.reason}`);
    }
    assert.equal(r.state, prev); // unchanged, same reference
    const ok = point(mid(), "A", DBL, { server: "A1" });
    assert.equal(ok.serverPoints, 3);
  });
  it("rejects the wrong receiver per court (even total -> deuce), names them", () => {
    const r = transition(mid(), { type: "POINT_WON", winner: "A", receiver: "B2" } as TennisIntent, DBL);
    assert.equal(r.accepted, false);
    if (!r.accepted) {
      assert.match(r.reason, /WRONG_RECEIVER/);
      assert.ok(r.reason.includes("B1"), `reason names B1: ${r.reason}`);
    }
    const ok = point(mid(), "A", DBL, { receiver: "B1" });
    assert.equal(ok.serverPoints, 3);
    // Odd total -> ad court (B2) is now expected.
    const r2 = transition(ok, { type: "POINT_WON", winner: "B", receiver: "B1" } as TennisIntent, DBL);
    assert.equal(r2.accepted, false);
    if (!r2.accepted) assert.ok(r2.reason.includes("B2"), `reason names B2: ${r2.reason}`);
  });
  it("SCORE_CALL carries the claim through, so the voice path is firewalled too", () => {
    const bad = transition(
      mid(),
      { type: "SCORE_CALL", score: { serverPoints: 3, receiverPoints: 0 }, server: "B1" } as unknown as TennisIntent,
      DBL,
    );
    assert.equal(bad.accepted, false);
    if (!bad.accepted) assert.ok(bad.reason.includes("A1"));
    const good = transition(
      mid(),
      { type: "SCORE_CALL", score: { serverPoints: 3, receiverPoints: 0 } },
      DBL,
    );
    assert.equal(good.accepted, true);
  });
  it("claim-free intents stay backward compatible", () => {
    const r = transition(mid(), { type: "POINT_WON", winner: "B" }, DBL);
    assert.equal(r.accepted, true);
  });
});

describe("deciding 10-pt MTB rotation under B03's no-Ad preset", () => {
  it("1-2-2-2 servers, ends at 6/12, 10-8 completes with no third set", () => {
    // Seeded split: A takes set two 6-3 after dropping set one -> deciding MTB.
    // Last server A1 -> B1 starts the MTB.
    let s = point(
      base({ sets: [[4, 6]], games: [5, 3], serverPoints: 3, receiverPoints: 1 }),
      "A",
      MTB,
    );
    assert.deepEqual(s.sets, [[4, 6], [6, 3]]);
    assert.deepEqual(s.games, [0, 0]);
    assert.equal(s.inTiebreak, true);
    assert.equal(s.service.server, "B1");
    assert.equal(s.service.servingTeam, "B");
    assert.equal(s.service.tiebreakPointNumber, 0);

    // Absolute 10-8 for A (t0 = B serves first, so this is 8-10 server-side):
    // [A,B]x8 then A,A. Ends at the last point only.
    const winners = [
      "A", "B", "A", "B", "A", "B", "A", "B",
      "A", "B", "A", "B", "A", "B", "A", "B", "A", "A",
    ] as TeamId[];
    const first7 = ["B1", "A2", "A2", "B2", "B2", "A1", "A1"];
    for (let n = 0; n < winners.length; n++) {
      assert.equal(s.serverPoints + s.receiverPoints, n);
      if (n < 7) assert.equal(s.service.server, first7[n], `MTB point ${n} server`);
      assert.equal(s.service.tiebreakPointNumber, n);
      const total = s.serverPoints + s.receiverPoints;
      assert.equal(shouldChangeEnds(total), total === 6 || total === 12, `ends at ${total}`);
      s = point(s, winners[n], MTB);
    }
    assert.equal(s.phase, "COMPLETE");
    assert.equal(s.winner, "A");
    assert.deepEqual(s.sets, [[4, 6], [6, 3]]); // distinct phase: no third set
  });
});

describe("zero rotation drift", () => {
  it("same doubles TB sequence replays byte-identical; order array never mutates", () => {
    const seed = () =>
      base({ games: [5, 6], serverPoints: 3, receiverPoints: 3, service: {
        servingTeam: "B", server: "B2", receivingTeam: "A",
        deuceReceiver: "A1", adReceiver: "A2", serviceOrder: [...ORDER],
      } });
    // Absolute 7-4 for A (t0 = A): A reaches 7 at the last point only.
    const winners = ["A", "B", "A", "B", "A", "B", "A", "B", "A", "A", "A"] as TeamId[]; // 7-4
    const run = () => {
      let s = point(seed(), "A", DBL); // deuce -> ad, still 5-6
      assert.deepEqual(s.games, [5, 6]);
      s = point(s, "A", DBL); // game -> 6-6 TB, A1 first
      assert.equal(s.service.server, "A1");
      for (const w of winners) s = point(s, w, DBL);
      return s;
    };
    const a = run();
    const b = run();
    assert.deepEqual(a, b);
    assert.equal(a.inTiebreak, false);
    assert.deepEqual(a.sets, [[7, 6]]); // absolute 7-4 for A, last point won by A
    assert.equal(a.service.server, "B1"); // one step after A1, regardless of winner
    assert.deepEqual(a.service.serviceOrder, ORDER);
  });
  it("rollback inside a tracked TB re-syncs the rotation to the target", () => {
    // Engine TB (B1 first: A served game 12), play 5 points, roll back to 1-1.
    let s = point(base({ games: [5, 6], serverPoints: 3, receiverPoints: 3 }), "A", DBL);
    s = point(s, "A", DBL); // 6-6 -> TB, B1 first
    assert.equal(s.service.server, "B1");
    for (const w of ["A", "B", "A", "B", "A"] as TeamId[]) s = point(s, w, DBL);
    assert.equal(s.serverPoints + s.receiverPoints, 5);
    const r = transition(s, { type: "SCORE_ROLLBACK", to: { serverPoints: 1, receiverPoints: 1 } }, DBL);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    // Target re-derived from the rotation: point 2 is A2's (1-2-2-2 from B1).
    assert.equal(r.state.service.tiebreakPointNumber, 2);
    assert.equal(r.state.service.server, "A2");
    assert.equal(r.state.service.servingTeam, "A");
    // And play continues with zero drift: point 3 -> B2, point 4 -> B2 (pair), 5 -> A1.
    let c = point(r.state, "A", DBL);
    assert.equal(c.service.server, "B2");
    c = point(c, "B", DBL);
    assert.equal(c.service.server, "B2");
    c = point(c, "A", DBL);
    assert.equal(c.service.server, "A1");
  });
  it("receiver helper follows the court: even total deuce, odd total ad", () => {
    const s = base();
    assert.equal(expectedReceiver(s.service, 0, 0), "B1");
    assert.equal(expectedReceiver(s.service, 2, 1), "B2");
    assert.equal(shouldChangeEnds(0), false);
    assert.equal(shouldChangeEnds(5), false);
    assert.equal(shouldChangeEnds(6), true);
  });
});
