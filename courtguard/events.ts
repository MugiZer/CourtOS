// B05 — append-only match event log + deterministic replay + dumb dispute.
// Authority: architecture.md §§9,10 + shared/types.ts (frozen, read-only).
// Scoring math lives in B02's transition(); this module never computes scores —
// it records §9 records, replays them, and routes dispute resolution through
// transition as an injected black box (works before/after B02 lands).
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type {
  CanonicalScore,
  CompiledRuleset,
  EventDecision,
  EventSource,
  MatchEventRecord,
  MatchId,
  MatchState,
  TennisIntent,
} from "../shared/types.ts";

// Frozen B02 signature per architecture.md §6 + shared/types.ts spec comment:
// transition(state, intent, rules) -> accepted (+ new state) or rejected (+ reason).
export type TransitionFn = (
  state: MatchState,
  intent: TennisIntent,
  rules?: CompiledRuleset,
) => { accepted: boolean; state: MatchState; reason?: string };

export interface AppendInit {
  courtId: string;
  matchId: MatchId;
  source: EventSource;
  proposedIntent: TennisIntent;
  previousState: MatchState;
  decision: EventDecision;
  resultingState: MatchState;
  transcript?: string;
  candidates?: unknown[];
  rejectionReason?: string;
  timestamp?: number;
}

// Append-only: push only, no removal API — history never shrinks.
export function appendEvent(log: MatchEventRecord[], init: AppendInit): MatchEventRecord {
  if (init.decision === "REJECTED" && !init.rejectionReason)
    throw new Error("REJECTED events require rejectionReason");
  const same = log.filter((e) => e.matchId === init.matchId);
  const last = same.length ? same.reduce((a, b) => (b.sequence > a.sequence ? b : a)) : null;
  if (last) assert.deepStrictEqual(init.previousState, last.resultingState, "event must chain previous resultingState");
  const record: MatchEventRecord = {
    id: randomUUID(),
    courtId: init.courtId,
    matchId: init.matchId,
    sequence: last ? last.sequence + 1 : 1,
    timestamp: init.timestamp ?? Date.now(),
    source: init.source,
    ...(init.transcript !== undefined ? { transcript: init.transcript } : {}),
    ...(init.candidates !== undefined ? { candidates: init.candidates } : {}),
    proposedIntent: init.proposedIntent,
    previousState: init.previousState,
    decision: init.decision,
    ...(init.rejectionReason !== undefined ? { rejectionReason: init.rejectionReason } : {}),
    resultingState: init.resultingState,
  };
  log.push(record);
  return record;
}

// Deterministic rebuild: chain-checked fold; optionally re-runs each step
// through transition (black box) and fails on any divergence from the record.
export function replay(
  events: MatchEventRecord[],
  transition?: TransitionFn,
  rules?: CompiledRuleset,
): MatchState {
  if (events.length === 0) throw new Error("replay: empty history");
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < ordered.length; i++)
    assert.deepStrictEqual(ordered[i].previousState, ordered[i - 1].resultingState, `replay: chain broken at sequence ${ordered[i].sequence}`);
  if (transition) {
    for (const e of ordered) {
      const r = transition(e.previousState, e.proposedIntent as TennisIntent, rules);
      assert.equal(r.accepted ? "ACCEPTED" : "REJECTED", e.decision, `replay: decision diverged at sequence ${e.sequence}`);
      assert.deepStrictEqual(r.state, e.resultingState, `replay: state diverged at sequence ${e.sequence}`);
    }
  }
  return ordered[ordered.length - 1].resultingState;
}

// Organizer sees recent history during a freeze (§10: "what score do we return to?").
export function recentHistory(log: MatchEventRecord[], matchId: MatchId, limit = 5): MatchEventRecord[] {
  if (limit <= 0) return [];
  return log.filter((e) => e.matchId === matchId).sort((a, b) => a.sequence - b.sequence).slice(-limit);
}

// Dumb dispute resolution: rollback appended as a NEW event, nothing deleted.
// resultingState comes from transition (black box) — never computed here.
export function resolveDispute(
  log: MatchEventRecord[],
  args: {
    matchId: MatchId;
    to: CanonicalScore;
    transition: TransitionFn;
    rules?: CompiledRuleset;
    source?: EventSource;
    timestamp?: number;
  },
): MatchEventRecord {
  const same = log.filter((e) => e.matchId === args.matchId);
  if (!same.length) throw new Error("resolveDispute: no history");
  const frozen = same.reduce((a, b) => (b.sequence > a.sequence ? b : a)).resultingState;
  if (frozen.phase !== "DISPUTE") throw new Error("resolveDispute: match is not frozen");
  // The organizer answers "what score do we return to?" (§10) — the target
  // must be a score already on record, never an unchecked free input.
  const seen = same.some(
    (e) =>
      e.resultingState.serverPoints === args.to.serverPoints &&
      e.resultingState.receiverPoints === args.to.receiverPoints,
  );
  if (!seen) throw new Error("resolveDispute: target score not in match history");
  const intent: TennisIntent = { type: "SCORE_ROLLBACK", to: args.to };
  const r = args.transition(frozen, intent, args.rules);
  return appendEvent(log, {
    courtId: frozen.courtId,
    matchId: args.matchId,
    source: args.source ?? "ORGANIZER",
    proposedIntent: intent,
    previousState: frozen,
    decision: r.accepted ? "ACCEPTED" : "REJECTED",
    ...(r.reason !== undefined ? { rejectionReason: r.reason } : {}),
    resultingState: r.state,
    ...(args.timestamp !== undefined ? { timestamp: args.timestamp } : {}),
  });
}
