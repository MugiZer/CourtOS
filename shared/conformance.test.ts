// B01 conformance proof — stdlib only (`node --test` + `assert/strict`).
// Run: node --test shared/conformance.test.ts
// The value import below forces Node to parse shared/types.ts (type-stripping),
// so this single command proves both: types.ts is valid TS AND every fixture
// conforms to it. No typescript dep, no test framework (YAGNI).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOCKET_EVENTS } from "./types.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (n: string): any => JSON.parse(readFileSync(join(dir, n), "utf8"));

const PHASES = ["PLAYING", "DISPUTE", "CHANGEOVER", "COMPLETE"];
const SOURCES = ["VOICE", "TOUCH", "ORGANIZER", "SYSTEM"];

function assertMatchState(s: any, label: string): void {
  assert.ok(s && typeof s === "object", `${label}: must be object`);
  for (const k of ["matchId", "courtId", "rulesetId", "rulesetVersion", "phase",
    "serverPoints", "receiverPoints", "games", "sets", "inTiebreak", "service", "winner"])
    assert.ok(k in s, `${label}: missing ${k}`);
  assert.ok(PHASES.includes(s.phase), `${label}: bad phase ${s.phase}`);
  for (const k of ["serverPoints", "receiverPoints"])
    assert.ok(Number.isInteger(s[k]) && s[k] >= 0, `${label}: bad ${k}`);
  assert.ok(Array.isArray(s.games) && s.games.length === 2, `${label}: bad games`);
  assert.ok(Array.isArray(s.sets), `${label}: bad sets`);
  const sv = s.service;
  assert.equal(sv.servingTeam === "A" ? "B" : "A", sv.receivingTeam, `${label}: service teams`);
  assert.ok(Array.isArray(sv.serviceOrder) && sv.serviceOrder.length >= 2, `${label}: serviceOrder`);
  assert.ok(s.winner === null || s.winner === "A" || s.winner === "B", `${label}: bad winner`);
  if (s.phase === "COMPLETE") assert.ok(s.winner !== null, `${label}: COMPLETE needs winner`);
}

function assertEventRecord(r: any, label: string): void {
  assert.ok(r && typeof r === "object", `${label}: must be object`);
  for (const k of ["id", "courtId", "matchId", "sequence", "timestamp", "source",
    "proposedIntent", "previousState", "decision", "resultingState"])
    assert.ok(k in r, `${label}: missing ${k}`);
  assert.ok(Number.isInteger(r.sequence) && r.sequence > 0, `${label}: bad sequence`);
  assert.ok(SOURCES.includes(r.source), `${label}: bad source`);
  assert.ok(r.decision === "ACCEPTED" || r.decision === "REJECTED", `${label}: bad decision`);
  if (r.decision === "REJECTED") assert.ok(typeof r.rejectionReason === "string" && r.rejectionReason.length > 0, `${label}: REJECTED needs reason`);
  assertMatchState(r.previousState, `${label}.previousState`);
  assertMatchState(r.resultingState, `${label}.resultingState`);
}

describe("B01 frozen contract", () => {
  it("socket protocol exposes exactly the 7 frozen event names", () => {
    assert.deepEqual([...SOCKET_EVENTS], ["court:event", "court:sync", "court:status",
      "tournament:update", "court:update", "ruleset:published", "assignment:update"]);
  });

  it("ships exactly 6 fixtures", () => {
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".json")).sort(), [
      "blocked-call.json", "changeover-sponsor.json", "dispute-frozen.json",
      "match-complete-next-assignment.json", "mid-game-30-15.json", "offline-unsynced-batch.json",
    ]);
  });

  it("mid-game 30-15", () => {
    const f = load("mid-game-30-15.json");
    assertMatchState(f.state, "mid-game");
    assert.equal(f.state.phase, "PLAYING");
    assert.equal(f.state.serverPoints, 2);
    assert.equal(f.state.receiverPoints, 1);
  });

  it("blocked-call: 40-love heard from 30-15 is rejected, state unchanged", () => {
    const f = load("blocked-call.json");
    assertMatchState(f.previousState, "blocked.previous");
    assert.equal(f.previousState.serverPoints, 2);
    assert.equal(f.previousState.receiverPoints, 1);
    assertEventRecord(f.record, "blocked.record");
    assert.equal(f.record.decision, "REJECTED");
    assert.deepEqual(f.record.resultingState, f.record.previousState);
  });

  it("offline-unsynced batch: monotonic sequences, chained states", () => {
    const f = load("offline-unsynced-batch.json");
    assert.equal(f.events.length, 3);
    assert.deepEqual(f.unsyncedSequences, f.events.map((e: any) => e.sequence));
    f.events.forEach((e: any, i: number) => {
      assertEventRecord(e, `batch[${i}]`);
      assert.equal(e.decision, "ACCEPTED");
      if (i > 0) {
        assert.equal(e.sequence, f.events[i - 1].sequence + 1, "sequences must be consecutive");
        assert.deepEqual(e.previousState, f.events[i - 1].resultingState, "states must chain");
      }
    });
  });

  it("dispute-frozen: scoring frozen, history intact", () => {
    const f = load("dispute-frozen.json");
    assertMatchState(f.state, "dispute");
    assert.equal(f.state.phase, "DISPUTE");
    assert.ok(f.recentHistory.length >= 1);
    f.recentHistory.forEach((e: any, i: number) => assertEventRecord(e, `dispute[${i}]`));
    const last = f.recentHistory[f.recentHistory.length - 1];
    assert.equal(f.frozenAtSequence, last.sequence);
    assert.deepEqual(last.resultingState, f.state);
  });

  it("changeover-sponsor: countdown + creative attached", () => {
    const f = load("changeover-sponsor.json");
    assertMatchState(f.state, "changeover");
    assert.equal(f.state.phase, "CHANGEOVER");
    assert.ok(f.changeover.startedAt > 0 && f.changeover.durationSec > 0);
    assert.ok(f.changeover.timeCueAtSec < f.changeover.durationSec, "Time cue precedes end");
    assert.ok(["image", "video", "audio"].includes(f.sponsor.type));
    assert.ok(typeof f.sponsor.src === "string" && f.sponsor.src.length > 0);
  });

  it("match-complete + next-assignment: winner set, version-bound plan", () => {
    const f = load("match-complete-next-assignment.json");
    assertMatchState(f.state, "complete");
    assert.equal(f.state.phase, "COMPLETE");
    assert.equal(f.state.winner, "A");
    assertEventRecord(f.finalRecord, "complete.final");
    assert.deepEqual(f.finalRecord.resultingState, f.state);
    assert.ok(Number.isInteger(f.plan.basedOnStateVersion));
    assert.ok(f.plan.assignments.length >= 1);
    assert.ok(f.plan.assignments.some((a: any) => a.courtId === f.state.courtId), "freed court reassigned");
    assert.ok(f.plan.projectedFinishTime > 0);
  });
});
