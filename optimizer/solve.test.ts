// B07 proof: fixture Twins (match finishes -> court frees) -> valid next
// assignment + 0-violation trace. Stdlib only (`node --test optimizer/solve.test.ts`).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Assignment,
  MatchState,
  TournamentTwinSnapshot,
} from "../shared/types.ts";
import { commitPlan, countViolations, solve } from "./solve.ts";
import { explainPlan } from "./explain.ts";

const NOW = 1725464000000;

function svc(order: string[]): MatchState["service"] {
  return {
    servingTeam: "A",
    server: order[0],
    receivingTeam: "B",
    deuceReceiver: order[1],
    adReceiver: order[1],
    serviceOrder: order,
  };
}

function match(
  matchId: string,
  courtId: string,
  phase: MatchState["phase"],
  order: string[],
  winner: MatchState["winner"] = null,
): MatchState {
  return {
    matchId,
    courtId,
    rulesetId: "standard-singles",
    rulesetVersion: 1,
    phase,
    serverPoints: 0,
    receiverPoints: 0,
    games: [0, 0],
    sets: [],
    inTiebreak: false,
    service: svc(order),
    winner,
  };
}

// m1 COMPLETE on c1 (court just freed), m2 live on c2 (pinned), m3 awaiting.
function finishedFreesCourtTwin(): TournamentTwinSnapshot {
  return {
    version: 18,
    courts: {
      c1: { courtId: "c1", status: "FREE", currentMatchId: null },
      c2: { courtId: "c2", status: "PLAYING", currentMatchId: "m2" },
    },
    matches: {
      m1: { ...match("m1", "c1", "COMPLETE", ["p1", "p2"], "A"), games: [6, 3], sets: [[6, 4]] },
      m2: match("m2", "c2", "PLAYING", ["p3", "p4"]),
      m3: match("m3", "", "PLAYING", ["p5", "p6"]),
    },
    players: {
      p1: { playerId: "p1", available: true },
      p2: { playerId: "p2", available: true },
      p3: { playerId: "p3", available: true },
      p4: { playerId: "p4", available: true },
      p5: { playerId: "p5", available: true },
      p6: { playerId: "p6", available: true },
    },
    assignments: { c2: { matchId: "m2", courtId: "c2", status: "PLAYING" } },
    rulesets: {},
    connectivity: { c1: "ONLINE", c2: "ONLINE" },
    sponsor: { creativeId: null },
  };
}

describe("B07 optimizer solve", () => {
  it("match finishes -> freed court gets valid next assignment, 0 violations", () => {
    const twin = finishedFreesCourtTwin();
    const plan = solve(twin, { now: NOW });
    assert.equal(plan.basedOnStateVersion, 18);
    assert.ok(plan.assignments.some((a) => a.matchId === "m3" && a.courtId === "c1"));
    assert.ok(plan.projectedFinishTime > NOW);
    const v = countViolations(twin, plan.assignments, NOW);
    assert.equal(v.total, 0);
    const trace = explainPlan(plan, v);
    assert.ok(trace.includes("Court c1 → Match m3"));
    assert.ok(trace.includes("0 player overlaps"));
    assert.ok(trace.includes("0 dependency violations"));
    assert.ok(trace.includes("0 rest violations"));
    assert.ok(trace.includes("0 court conflicts"));
  });

  it("PLAYING immutable: live match stays pinned to its court", () => {
    const plan = solve(finishedFreesCourtTwin(), { now: NOW });
    assert.ok(
      plan.assignments.some((a) => a.matchId === "m2" && a.courtId === "c2" && a.status === "PLAYING"),
    );
  });

  it("never mutates the Twin", () => {
    const twin = finishedFreesCourtTwin();
    const before = JSON.stringify(twin);
    solve(twin, { now: NOW });
    assert.equal(JSON.stringify(twin), before);
  });

  it("resting player's match waits for the next horizon", () => {
    const twin = finishedFreesCourtTwin();
    twin.players.p5 = { playerId: "p5", available: true, restUntil: NOW + 10 * 60000 };
    const plan = solve(twin, { now: NOW });
    assert.ok(!plan.assignments.some((a) => a.matchId === "m3"));
    assert.equal(countViolations(twin, plan.assignments, NOW).total, 0);
  });

  it("offline court is never assigned (compat)", () => {
    const twin = finishedFreesCourtTwin();
    twin.connectivity.c1 = "OFFLINE";
    const plan = solve(twin, { now: NOW });
    assert.ok(!plan.assignments.some((a) => a.courtId === "c1" && a.status !== "PLAYING"));
  });

  it("symbolic unknown-winner match (<2 participants) is never committed", () => {
    const twin = finishedFreesCourtTwin();
    twin.matches.m4 = match("m4", "", "PLAYING", ["p1"]); // TBD finalist
    const plan = solve(twin, { now: NOW });
    assert.ok(!plan.assignments.some((a) => a.matchId === "m4"));
  });

  it("shared player defers to next horizon (no concurrent player overlap)", () => {
    const twin = finishedFreesCourtTwin();
    twin.matches.m4 = match("m4", "", "PLAYING", ["p5", "p7"]);
    twin.players.p7 = { playerId: "p7", available: true };
    twin.courts.c2 = { courtId: "c2", status: "FREE", currentMatchId: null };
    twin.matches.m2 = { ...twin.matches.m2, phase: "COMPLETE", winner: "A" };
    twin.assignments = {};
    const plan = solve(twin, { now: NOW });
    const v = countViolations(twin, plan.assignments, NOW);
    assert.equal(v.playerOverlap, 0);
    assert.equal(v.total, 0);
  });

  it("counter flags hand-built infeasible plans", () => {
    const twin = finishedFreesCourtTwin();
    const dupCourt: Assignment[] = [
      { matchId: "m3", courtId: "c1", status: "PLANNED" },
      { matchId: "m2", courtId: "c1", status: "PLANNED" },
    ];
    assert.ok(countViolations(twin, dupCourt, NOW).courtConflict >= 1);
    const movedLive: Assignment[] = [{ matchId: "m2", courtId: "c1", status: "PLANNED" }];
    assert.ok(countViolations(twin, movedLive, NOW).playingChanged >= 1);
  });

  it("commitPlan: fresh version commits, moved version discards as stale", () => {
    const twin = finishedFreesCourtTwin();
    const plan = solve(twin, { now: NOW });
    assert.equal(commitPlan(twin, plan, { now: NOW }).ok, true);
    const moved = { ...twin, version: 19 };
    const stale = commitPlan(moved, plan, { now: NOW });
    assert.equal(stale.ok, false);
    assert.equal((stale as { reason: string }).reason, "STALE_PLAN");
  });

  it("commitPlan rejects constraint-violating plans without mutating", () => {
    const twin = finishedFreesCourtTwin();
    const before = JSON.stringify(twin);
    const bad = {
      basedOnStateVersion: 18,
      assignments: [{ matchId: "m2", courtId: "c1", status: "PLANNED" as const }],
      projectedFinishTime: NOW + 1000,
      objectiveBreakdown: {},
    };
    const r = commitPlan(twin, bad, { now: NOW });
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, "CONSTRAINT_VIOLATION");
    assert.equal(JSON.stringify(twin), before);
  });

  it("explain shows improvement vs previous finish", () => {
    const twin = finishedFreesCourtTwin();
    const plan = solve(twin, { now: NOW });
    const v = countViolations(twin, plan.assignments, NOW);
    const trace = explainPlan(plan, v, { previousFinish: plan.projectedFinishTime + 14 * 60000 });
    assert.ok(trace.includes("Improvement: 14 minutes"));
  });
});
