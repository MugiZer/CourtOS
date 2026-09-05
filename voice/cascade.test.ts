// B08 proof: all four voice paths through the REAL provider code path —
// canned PCM bytes in, no ASR mocks. Live-mic proof is demo-day.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeUtterance } from "./providers.ts";
import { interpretScoreCall, tactileIntent, type LegalFn } from "./cascade.ts";

// mid-game 30-15 (mirrors shared/fixtures/mid-game-30-15.json).
const state30_15: any = {
  matchId: "m1", courtId: "c1", rulesetId: "standard-singles", rulesetVersion: 1,
  phase: "PLAYING", serverPoints: 2, receiverPoints: 1, games: [2, 1], sets: [],
  inTiebreak: false,
  service: { servingTeam: "A", server: "p1", receivingTeam: "B", deuceReceiver: "p2", adReceiver: "p2", serviceOrder: ["p1", "p2"] },
  winner: null,
};
// Faithful stand-in for B02 legalNextStates(30-15): only 40-15 / 30-all (+fault/let).
const legalNextStates: LegalFn = () => [
  { intent: { type: "SCORE_CALL", score: { serverPoints: 3, receiverPoints: 1 } } },
  { intent: { type: "SCORE_CALL", score: { serverPoints: 2, receiverPoints: 2 } } },
  { intent: { type: "FAULT" } },
  { intent: { type: "LET" } },
];
const run = (audio: Uint8Array, extra: any = {}) =>
  interpretScoreCall({ audio, matchState: state30_15, legalNextStates, ...extra });

describe("B08 voice cascade", () => {
  it("golden: clear primary goes straight to CourtGuard intent, no fallback", async () => {
    const r = await run(encodeUtterance(["forty", "fifteen"]));
    assert.equal(r.outcome, "ACCEPT");
    assert.deepEqual((r.intent as any).score, { serverPoints: 3, receiverPoints: 1 });
    assert.equal(r.trace.fallbackInvoked, false);
    assert.equal(r.trace.primaryLegal, true);
    assert.equal(r.trace.recovery, false);
  });

  it("cascade-recovery: illegal primary, fallback recovers same audio", async () => {
    const r = await run(encodeUtterance(["forty", "fifteen"], { noiseAmp: 800 }));
    assert.equal(r.trace.primaryTranscript, "forty thirty"); // illegal from 30-15
    assert.equal(r.trace.primaryLegal, false);
    assert.equal(r.trace.fallbackInvoked, true);
    assert.equal(r.outcome, "ACCEPT");
    assert.deepEqual((r.intent as any).score, { serverPoints: 3, receiverPoints: 1 });
    assert.equal(r.trace.recovery, true);
  });

  it("ambiguity: two legal candidates -> confirm, Yes/No resolves", async () => {
    const r = await run(encodeUtterance(["x", "y"], { freqs: [250, 190] }));
    assert.equal(r.outcome, "CONFIRM");
    assert.equal(r.prompt, "Did you say 40–15?");
    assert.equal(r.candidates?.length, 2);
    assert.equal(r.trace.fallbackInvoked, true);
    const yes = await run(encodeUtterance(["yes"]), { pending: r.candidates![0] });
    assert.equal(yes.outcome, "ACCEPT");
    assert.deepEqual(yes.intent, r.candidates![0]);
    const no = await run(encodeUtterance(["no"]), { pending: r.candidates![0] });
    assert.equal(no.outcome, "REJECT");
    assert.equal(no.reason, "CONFIRM_DECLINED");
  });

  it("total-failure: VOICE UNCLEAR, tactile continues through same transition", async () => {
    const r = await run(encodeUtterance(["x", "y"], { freqs: [700, 950] }));
    assert.equal(r.outcome, "REJECT");
    assert.equal(r.reason, "VOICE_UNCLEAR");
    assert.equal(r.trace.fallbackInvoked, true);
    assert.deepEqual(tactileIntent("A"), { type: "POINT_WON", winner: "A" });
  });
});
