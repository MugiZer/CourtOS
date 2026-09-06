// B08 proof: all four voice paths through the cascade RANKING/FUSION logic,
// driven by the synth TEST SEAM (canned PCM bytes in — deterministic estimator
// stand-ins, explicitly not real providers). Our logic under test is ranking,
// gating, and fusion; live-mic proof against the real browser ASR is demo-day.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeUtterance, SynthSeamFallback, SynthSeamPrimary, createBrowserSpeechPrimary, createWhisperFallback } from "./providers.ts";
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
  interpretScoreCall({
    audio,
    matchState: state30_15,
    legalNextStates,
    // Synth seam stand-ins: exercise ranking/fusion only, not real ASR.
    primary: SynthSeamPrimary,
    fallback: SynthSeamFallback,
    ...extra,
  });

describe("B08 voice cascade (synth seam: ranking/fusion logic only)", () => {
  it("golden: clear seam-primary output goes straight to CourtGuard intent, no fallback", async () => {
    const r = await run(encodeUtterance(["forty", "fifteen"]));
    assert.equal(r.outcome, "ACCEPT");
    assert.deepEqual((r.intent as any).score, { serverPoints: 3, receiverPoints: 1 });
    assert.equal(r.trace.fallbackInvoked, false);
    assert.equal(r.trace.primaryLegal, true);
    assert.equal(r.trace.recovery, false);
  });

  it("cascade-recovery: illegal seam-primary output, seam fallback recovers same audio", async () => {
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

  it("provider honesty: no browser live-mic here, no keyless server fallback", async () => {
    // Cannot even be constructed without a browser — said plainly (null).
    assert.equal(createBrowserSpeechPrimary(), null);
    // Server-side fallback needs a key; it is never faked.
    assert.throws(() => createWhisperFallback({ apiKey: "" }), /needs an API key/);
    // And the cascade refuses to run without injected providers in Node.
    await assert.rejects(
      interpretScoreCall({ audio: encodeUtterance(["forty", "fifteen"]), matchState: state30_15, legalNextStates }),
      /inject ASR providers/,
    );
  });
});
