// B05 proofs — stdlib only (`node --test` + `assert/strict`).
// Run: node --test courtguard/events.test.ts
// NOTE: courtguard/transition.* (B02) hasn't landed, so replay/resolution are
// verified against the minimal stub below, which implements the frozen signature
// transition(state, intent, rules). Swap the stub for the real import once B02
// lands — events.ts takes transition as a parameter, no change needed there.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, replay, recentHistory, resolveDispute } from "./events.ts";
import type { CompiledRuleset, MatchEventRecord, MatchState, TennisIntent } from "../shared/types.ts";

const RULES = {} as CompiledRuleset;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mkState(o: Partial<MatchState> = {}): MatchState {
  return {
    matchId: "m1", courtId: "c1", rulesetId: "standard-singles", rulesetVersion: 1,
    phase: "PLAYING", serverPoints: 0, receiverPoints: 0, games: [0, 0], sets: [],
    inTiebreak: false,
    service: { servingTeam: "A", server: "p1", receivingTeam: "B", deuceReceiver: "p2", adReceiver: "p2", serviceOrder: ["p1", "p2"] },
    winner: null, ...o,
  };
}

// Minimal stub of B02's frozen signature — point math + DISPUTE freeze only.
function stubTransition(state: MatchState, intent: TennisIntent, _rules: CompiledRuleset) {
  if (state.phase === "DISPUTE" && intent.type !== "SCORE_ROLLBACK")
    return { decision: "REJECTED" as const, rejectionReason: "DISPUTE_FROZEN", resultingState: state };
  switch (intent.type) {
    case "POINT_WON": {
      const s = { ...state };
      if (intent.winner === state.service.servingTeam) s.serverPoints += 1; else s.receiverPoints += 1;
      return { decision: "ACCEPTED" as const, resultingState: s };
    }
    case "DISPUTE_START":
      return { decision: "ACCEPTED" as const, resultingState: { ...state, phase: "DISPUTE" as const } };
    case "SCORE_ROLLBACK":
      return { decision: "ACCEPTED" as const, resultingState: { ...state, serverPoints: intent.to.serverPoints, receiverPoints: intent.to.receiverPoints, phase: "PLAYING" as const } };
    default:
      return { decision: "REJECTED" as const, rejectionReason: "ILLEGAL_TRANSITION", resultingState: state };
  }
}

let ts = 1725460000000;
function drive(log: MatchEventRecord[], intent: TennisIntent, source: "VOICE" | "TOUCH" | "ORGANIZER" | "SYSTEM" = "TOUCH"): MatchEventRecord {
  const prev = log.length ? log.filter((e) => e.matchId === "m1").sort((a, b) => a.sequence - b.sequence).at(-1)!.resultingState : mkState({ serverPoints: 2, receiverPoints: 1 });
  const r = stubTransition(prev, intent, RULES);
  return appendEvent(log, {
    courtId: prev.courtId, matchId: prev.matchId, source, proposedIntent: intent,
    previousState: prev, decision: r.decision,
    ...(r.rejectionReason ? { rejectionReason: r.rejectionReason } : {}),
    resultingState: r.resultingState, timestamp: (ts += 1000),
  });
}

describe("B05 events + replay + dispute", () => {
  it("append: uuid ids + monotonic per-match sequences, carries §9 fields", () => {
    const log: MatchEventRecord[] = [];
    const a = drive(log, { type: "POINT_WON", winner: "A" });
    const b = drive(log, { type: "POINT_WON", winner: "B" });
    assert.ok(UUID.test(a.id) && UUID.test(b.id) && a.id !== b.id, "ids unique uuids");
    assert.deepEqual([a.sequence, b.sequence], [1, 2]);
    for (const k of ["id", "courtId", "matchId", "sequence", "timestamp", "source", "proposedIntent", "previousState", "decision", "resultingState"])
      assert.ok(k in a, `missing §9 field ${k}`);
  });

  it("dispute→resolve→replay reconstructs corrected match; rollback never deletes", () => {
    const log: MatchEventRecord[] = [];
    drive(log, { type: "POINT_WON", winner: "A" }); // 30-15 -> 40-15
    drive(log, { type: "POINT_WON", winner: "B" }); // -> 40-30 (contested)
    drive(log, { type: "DISPUTE_START", reason: "players contest last call" });
    assert.equal(log.at(-1)!.resultingState.phase, "DISPUTE");
    // Frozen: scoring rejected, recorded, state unchanged, history grows.
    const lenBefore = log.length;
    const frozen = drive(log, { type: "POINT_WON", winner: "A" }, "VOICE");
    assert.equal(frozen.decision, "REJECTED");
    assert.equal(frozen.rejectionReason, "DISPUTE_FROZEN");
    assert.deepStrictEqual(frozen.resultingState, frozen.previousState);
    assert.equal(log.length, lenBefore + 1);
    // Organizer sees recent history, picks prior 40-15.
    const recent = recentHistory(log, "m1", 3);
    assert.deepEqual(recent.map((e) => e.sequence), [2, 3, 4]);
    const idsBefore = new Set(log.map((e) => e.id));
    const fix = resolveDispute(log, { matchId: "m1", to: { serverPoints: 3, receiverPoints: 1 }, transition: stubTransition, rules: RULES, timestamp: (ts += 1000) });
    assert.equal(fix.decision, "ACCEPTED");
    assert.equal(fix.sequence, 5);
    assert.deepStrictEqual(log.filter((e) => !idsBefore.has(e.id)).map((e) => e.sequence), [5], "only appended");
    assert.equal(log.length, idsBefore.size + 1, "history never shrinks");
    // Replay (pure fold AND black-box verified) reconstructs corrected match.
    const pure = replay(log);
    const verified = replay(log, stubTransition, RULES);
    assert.deepStrictEqual(pure, verified);
    assert.equal(pure.phase, "PLAYING");
    assert.deepEqual([pure.serverPoints, pure.receiverPoints], [3, 1]);
  });

  it("replay deterministic + order-independent, rejects tampering", () => {
    const log: MatchEventRecord[] = [];
    drive(log, { type: "POINT_WON", winner: "A" });
    drive(log, { type: "POINT_WON", winner: "B" });
    assert.deepStrictEqual(replay(log), replay(log), "deterministic");
    assert.deepStrictEqual(replay([...log].reverse()), replay(log), "order-independent");
    const tampered = structuredClone(log);
    tampered[0].resultingState = { ...tampered[0].resultingState, serverPoints: 99 };
    assert.throws(() => replay(tampered), /chain broken|diverged/);
  });

  it("verified replay catches records that chain but diverge from transition", () => {
    const log: MatchEventRecord[] = [];
    drive(log, { type: "POINT_WON", winner: "A" });
    const bad = structuredClone(log);
    bad[0].resultingState = { ...bad[0].resultingState, serverPoints: bad[0].resultingState.serverPoints + 5 };
    bad[0].previousState = { ...bad[0].previousState }; // chain of one still holds
    assert.doesNotThrow(() => replay(bad), "pure fold is blind by design");
    assert.throws(() => replay(bad, stubTransition, RULES), /diverged/);
  });

  it("guards: empty replay, resolve-when-not-frozen, reasonless rejection, chain break", () => {
    assert.throws(() => replay([]), /empty/);
    const log: MatchEventRecord[] = [];
    drive(log, { type: "POINT_WON", winner: "A" });
    assert.throws(() => resolveDispute(log, { matchId: "m1", to: { serverPoints: 0, receiverPoints: 0 }, transition: stubTransition, rules: RULES }), /not frozen/);
    const s = log.at(-1)!.resultingState;
    assert.throws(() => appendEvent(log, { courtId: "c1", matchId: "m1", source: "TOUCH", proposedIntent: { type: "FAULT" }, previousState: s, decision: "REJECTED", resultingState: s }), /rejectionReason/);
    assert.throws(() => appendEvent(log, { courtId: "c1", matchId: "m1", source: "TOUCH", proposedIntent: { type: "FAULT" }, previousState: mkState(), decision: "ACCEPTED", resultingState: mkState() }), /chain/);
    assert.deepEqual(recentHistory(log, "m1", 0), []);
  });
});
