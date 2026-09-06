// B08 proof: all four voice paths through the cascade RANKING/FUSION logic,
// driven by ASRResult literals through the injected provider seam (no canned
// bytes, no estimators — explicitly not real providers). Our logic under test
// is ranking, gating, and fusion; live-mic proof against the real browser ASR
// is demo-day.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_RATE, createBrowserSpeechPrimary, createWhisperFallback, type ASRProvider, type ASRResult } from "./providers.ts";
import { interpretScoreCall, tactileIntent, type LegalFn } from "./cascade.ts";

// mid-game 30-15 (mirrors shared/fixtures/mid-game-30-15.json).
const state30_15: any = {
  matchId: "m1", courtId: "c1", rulesetId: "standard-singles", rulesetVersion: 1,
  phase: "PLAYING", serverPoints: 2, receiverPoints: 1, games: [2, 1], sets: [],
  inTiebreak: false,
  service: { servingTeam: "A", server: "p1", receivingTeam: "B", deuceReceiver: "p2", adReceiver: "p2", serviceOrder: ["p1", "p2"] },
};
// Faithful stand-in for B02 legalNextStates(30-15): only 40-15 / 30-all (+fault/let).
const legalNextStates: LegalFn = () => [
  { intent: { type: "SCORE_CALL", score: { serverPoints: 3, receiverPoints: 1 } } },
  { intent: { type: "SCORE_CALL", score: { serverPoints: 2, receiverPoints: 2 } } },
  { intent: { type: "FAULT" } },
  { intent: { type: "LET" } },
];

// Minimal raw-PCM bytes (mono PCM16LE @16kHz) for the presence gate only:
// square-wave energy passes, all-zero fails as NO_SPEECH. Duration in seconds.
function pcm(seconds: number, amp: number): Uint8Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const out = new Uint8Array(n * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < n; i++) dv.setInt16(i * 2, i % 2 === 0 ? amp : -amp, true);
  return out;
}
const voiced = (): Uint8Array => pcm(2.5, 8000);

function asr(over: Partial<ASRResult> = {}): ASRResult {
  return {
    provider: "stub", transcript: "", words: [], confidence: 0,
    nbest: [], usable: false, wake: true, ...over,
  };
}
const heard = (words: (string | null)[], conf: number, nbest: ASRResult["nbest"], transcript: string): ASRResult =>
  asr({ provider: "stub-primary", transcript, words, confidence: conf, nbest, usable: true, wake: true });
const stub = (r: ASRResult): ASRProvider => ({ name: r.provider, transcribe: async () => r });
const dead = (): ASRProvider => ({ name: "stub-fallback", transcribe: async () => asr({ provider: "stub-fallback" }) });

const run = (audio: Uint8Array, primary: ASRProvider, fallback: ASRProvider, extra: any = {}) =>
  interpretScoreCall({ audio, matchState: state30_15, legalNextStates, primary, fallback, ...extra });

describe("B08 voice cascade (literals: ranking/fusion logic only)", () => {
  it("golden: clear primary output goes straight to CourtGuard intent, no fallback", async () => {
    const primary = stub(heard(["forty", "fifteen"], 0.9,
      [[{ word: "forty", confidence: 0.9 }], [{ word: "fifteen", confidence: 0.9 }]], "forty fifteen"));
    const r = await run(voiced(), primary, {
      name: "must-not-run",
      transcribe: async () => { throw new Error("fallback must not run"); },
    });
    assert.equal(r.outcome, "ACCEPT");
    assert.deepEqual((r.intent as any).score, { serverPoints: 3, receiverPoints: 1 });
    assert.equal(r.trace.fallbackInvoked, false);
    assert.equal(r.trace.primaryLegal, true);
    assert.equal(r.trace.recovery, false);
  });

  it("cascade-recovery: illegal primary output, fallback recovers same audio", async () => {
    const primary = stub(heard(["forty", "thirty"], 0.9,
      [[{ word: "forty", confidence: 0.9 }], [{ word: "thirty", confidence: 0.9 }]], "forty thirty"));
    const fallback = stub(asr({
      provider: "stub-fallback", transcript: "forty fifteen", words: ["forty", "fifteen"],
      confidence: 0.8, nbest: [[{ word: "forty", confidence: 0.8 }], [{ word: "fifteen", confidence: 0.8 }]],
      usable: true, wake: true,
    }));
    const r = await run(voiced(), primary, fallback);
    assert.equal(r.trace.primaryTranscript, "forty thirty"); // illegal from 30-15
    assert.equal(r.trace.primaryLegal, false);
    assert.equal(r.trace.fallbackInvoked, true);
    assert.equal(r.outcome, "ACCEPT");
    assert.deepEqual((r.intent as any).score, { serverPoints: 3, receiverPoints: 1 });
    assert.equal(r.trace.recovery, true);
  });

  it("ambiguity: two legal candidates -> confirm, Yes/No resolves", async () => {
    const primary = stub(heard(["forty", "fifteen"], 0.8,
      [[{ word: "forty", confidence: 0.8 }, { word: "thirty", confidence: 0.75 }],
       [{ word: "fifteen", confidence: 0.8 }, { word: "thirty", confidence: 0.78 }]], "forty fifteen"));
    const r = await run(voiced(), primary, dead());
    assert.equal(r.outcome, "CONFIRM");
    assert.equal(r.prompt, "Did you say 40–15?");
    assert.equal(r.candidates?.length, 2);
    assert.equal(r.trace.fallbackInvoked, true);
    const yes = await run(voiced(), stub(heard(["yes"], 0.9, [[{ word: "yes", confidence: 0.9 }]], "yes")), dead(), { pending: r.candidates![0] });
    assert.equal(yes.outcome, "ACCEPT");
    assert.deepEqual(yes.intent, r.candidates![0]);
    const no = await run(voiced(), stub(heard(["no"], 0.9, [[{ word: "no", confidence: 0.9 }]], "no")), dead(), { pending: r.candidates![0] });
    assert.equal(no.outcome, "REJECT");
    assert.equal(no.reason, "CONFIRM_DECLINED");
  });

  it("total-failure: VOICE UNCLEAR, tactile continues through same transition", async () => {
    const r = await run(voiced(), stub(asr({ provider: "stub-primary" })), dead());
    assert.equal(r.outcome, "REJECT");
    assert.equal(r.reason, "VOICE_UNCLEAR");
    assert.equal(r.trace.fallbackInvoked, true);
    assert.deepEqual(tactileIntent("A"), { type: "POINT_WON", winner: "A" });
  });

  it("presence gate: silence is NO_SPEECH, out-of-window bytes are BAD_WINDOW", async () => {
    const clear = stub(heard(["forty", "fifteen"], 0.9,
      [[{ word: "forty", confidence: 0.9 }], [{ word: "fifteen", confidence: 0.9 }]], "forty fifteen"));
    const silent = await run(pcm(2.5, 0), clear, dead());
    assert.equal(silent.outcome, "REJECT");
    assert.equal(silent.reason, "NO_SPEECH");
    const short = await run(pcm(0.5, 8000), clear, dead());
    assert.equal(short.outcome, "REJECT");
    assert.equal(short.reason, "BAD_WINDOW");
  });

  it("provider honesty: no browser live-mic here, no keyless server fallback", async () => {
    // Cannot even be constructed without a browser — said plainly (null).
    assert.equal(createBrowserSpeechPrimary(), null);
    // Server-side fallback needs a key; it is never faked.
    assert.throws(() => createWhisperFallback({ apiKey: "" }), /needs an API key/);
    // And the cascade refuses to run without injected providers in Node.
    await assert.rejects(
      interpretScoreCall({ audio: voiced(), matchState: state30_15, legalNextStates }),
      /inject ASR providers/,
    );
  });
});
