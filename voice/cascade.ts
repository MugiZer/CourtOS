// B08 voice cascade — two-stage, state-constrained, deterministic fusion.
// Authority: architecture.md §5 + ADR-002/003/004. Fixed gates (no calibration
// tuning), same-buffer fallback, never average cross-provider confidences,
// never guess between two legal candidates. CourtGuard owns state; this module
// only proposes typed intents (ADR-001).
import type { CanonicalScore, MatchState, TeamId, TennisIntent } from "../shared/types.ts";
import { WhisperFallback, WebSpeechPrimary, parseUtterance, segments, type ASRProvider, type ASRResult } from "./providers.ts";

// Fixed gates — not tuned per provider (ticket constraint).
export const STRONG = 0.75; // clear primary + legal + clear margin -> CourtGuard
export const MIN_EVIDENCE = 0.5; // fallback usability floor
export const MARGIN = 0.15; // min top1-top2 legal gap inside one provider

// Black-box consumption of B02 legalNextStates(state, rules): LegalTransition[].
// Only `.intent` (or B02's `.event` alias) is read; never CourtGuard internals.
export type LegalFn = (state: MatchState, rules?: unknown) => Array<{ intent?: TennisIntent; event?: TennisIntent }>;
const optIntent = (t: { intent?: TennisIntent; event?: TennisIntent }): TennisIntent | null =>
  (t.intent ?? t.event ?? null);

export type Outcome = "ACCEPT" | "CONFIRM" | "REJECT";

export interface VoiceTrace {
  primaryTranscript: string; primaryConfidence: number; primaryLegal: boolean;
  marginClear: boolean; fallbackInvoked: boolean;
  fallbackTranscript?: string; fallbackConfidence?: number; fallbackLegal?: boolean;
  finalIntent: TennisIntent | null; outcome: Outcome; recovery: boolean;
  confirmPrompt?: string; reason?: string;
}

export interface VoiceInterpretation {
  outcome: Outcome;
  intent: TennisIntent | null; // CourtGuard input on ACCEPT
  prompt?: string; // "Did you say …?" on CONFIRM
  candidates?: TennisIntent[];
  reason?: string; // NO_WAKE | NO_SPEECH | BAD_WINDOW | VOICE_UNCLEAR | CONFIRM_DECLINED | NO_PENDING_CONFIRM
  trace: VoiceTrace;
}

const POINTS: Record<string, number> = { love: 0, fifteen: 1, thirty: 2, forty: 3 };
const PTS = ["love", "15", "30", "40"];
export const fmtScore = (s: CanonicalScore): string => `${PTS[s.serverPoints] ?? "?"}–${PTS[s.receiverPoints] ?? "?"}`;
export const describeIntent = (i: TennisIntent): string =>
  i.type === "SCORE_CALL" ? fmtScore(i.score) : i.type.toLowerCase();

// Tiny vocabulary only — anything else is unusable, never guessed.
export function normalize(words: (string | null)[]): TennisIntent | null {
  if (words.length === 0 || words.some((w) => w === null)) return null;
  const ws = words as string[];
  const t = ws.join(" ");
  if (ws.length === 2 && ws[0] in POINTS && ws[1] in POINTS)
    return { type: "SCORE_CALL", score: { serverPoints: POINTS[ws[0]], receiverPoints: POINTS[ws[1]] }, transcript: t };
  if (ws.length === 1) {
    const [w] = ws;
    if (w === "deuce") return { type: "SCORE_CALL", score: { serverPoints: 3, receiverPoints: 3 }, transcript: t };
    if (w === "fault") return { type: "FAULT" };
    if (w === "let") return { type: "LET" };
    if (w === "correction") return { type: "CORRECTION" };
    if (w === "yes") return { type: "CONFIRM_YES" };
    if (w === "no") return { type: "CONFIRM_NO" };
  }
  return null;
}

const key = (i: TennisIntent): string =>
  i.type === "SCORE_CALL" ? `S:${i.score.serverPoints},${i.score.receiverPoints}` : i.type;
const sameIntent = (a: TennisIntent, b: TennisIntent): boolean => key(a) === key(b);

// Tactile peer path (ADR-004): touch terminates at the same transition().
export const tactileIntent = (winner: TeamId): TennisIntent => ({ type: "POINT_WON", winner });

interface Ranked { intent: TennisIntent; conf: number; }

// State-constrained ranking (ADR-003): expand provider n-best, keep legal,
// best first. Illegal runners never block; legal runners inside MARGIN do.
function rankLegal(r: ASRResult, isLegal: (i: TennisIntent) => boolean): Ranked[] {
  if (!r.usable || r.nbest.length === 0 || r.nbest.length > 3) {
    const top = normalize(r.words);
    return top && isLegal(top) ? [{ intent: top, conf: r.confidence }] : [];
  }
  const out: Ranked[] = [];
  const walk = (i: number, words: string[], conf: number) => {
    if (i === r.nbest.length) {
      const intent = normalize(words);
      if (intent && isLegal(intent)) out.push({ intent, conf });
      return;
    }
    for (const h of r.nbest[i]) walk(i + 1, [...words, h.word], Math.min(conf, h.confidence));
  };
  walk(0, [], Infinity);
  return out.sort((a, b) => b.conf - a.conf);
}
const marginClear = (c: Ranked[]): boolean => c.length < 2 || c[0].conf - c[1].conf >= MARGIN;

export async function interpretScoreCall(args: {
  audio: Uint8Array;
  matchState: MatchState;
  rules?: unknown;
  legalNextStates: LegalFn;
  pending?: TennisIntent;
  primary?: ASRProvider;
  fallback?: ASRProvider;
}): Promise<VoiceInterpretation> {
  const { matchState, rules, legalNextStates, pending } = args;
  const primary = args.primary ?? WebSpeechPrimary;
  const fallback = args.fallback ?? WhisperFallback;
  const blank: VoiceTrace = { primaryTranscript: "", primaryConfidence: 0, primaryLegal: false, marginClear: true, fallbackInvoked: false, finalIntent: null, outcome: "REJECT", recovery: false };
  const reject = (reason: string, trace: Partial<VoiceTrace> = {}): VoiceInterpretation =>
    ({ outcome: "REJECT", intent: null, reason, trace: { ...blank, ...trace, outcome: "REJECT", reason } });

  // Capture/VAD/wake/buffer gates (adjacent-court defense layers 1-3).
  try {
    const parsed = parseUtterance(args.audio);
    if (parsed.seconds < 2 || parsed.seconds > 4) return reject("BAD_WINDOW", { reason: "BAD_WINDOW" });
    if (segments(parsed.samples).length === 0) return reject("NO_SPEECH", { reason: "NO_SPEECH" });
  } catch { return reject("BAD_WINDOW", { reason: "BAD_WINDOW" }); }

  const p = await primary.transcribe(args.audio); // SAME buffered audio throughout
  if (!p.wake) return reject("NO_WAKE", { primaryTranscript: p.transcript, reason: "NO_WAKE" });

  const legal = legalNextStates(matchState, rules).map(optIntent).filter((i): i is TennisIntent => i !== null);
  const isLegal = (i: TennisIntent | null): boolean => i !== null && legal.some((l) => sameIntent(l, i));

  // Voice Yes/No confirmation shortcut.
  const confirmStep = (i: TennisIntent | null, extra: Partial<VoiceTrace> = {}): VoiceInterpretation | null => {
    if (i?.type !== "CONFIRM_YES" && i?.type !== "CONFIRM_NO") return null;
    const base = { primaryTranscript: p.transcript, primaryConfidence: p.confidence, primaryLegal: false, ...extra };
    if (!pending) return reject("NO_PENDING_CONFIRM", { ...base, finalIntent: i, reason: "NO_PENDING_CONFIRM" });
    if (i.type === "CONFIRM_YES")
      return { outcome: "ACCEPT", intent: pending, trace: { ...blank, ...base, primaryLegal: true, finalIntent: pending, outcome: "ACCEPT" } };
    return reject("CONFIRM_DECLINED", { ...base, finalIntent: i, reason: "CONFIRM_DECLINED" });
  };
  const yn = confirmStep(normalize(p.words));
  if (yn) return yn;

  const rankedP = rankLegal(p, isLegal);
  const topP = rankedP[0] ?? null;
  const clearP = marginClear(rankedP);
  const base = { primaryTranscript: p.transcript, primaryConfidence: p.confidence, primaryLegal: topP !== null, marginClear: clearP };

  // Clear + legal + strong margin -> CourtGuard, no fallback cost.
  if (topP && topP.conf >= STRONG && clearP)
    return { outcome: "ACCEPT", intent: topP.intent, trace: { ...blank, ...base, finalIntent: topP.intent, outcome: "ACCEPT" } };

  // Conditional fallback on the SAME audio (ADR-002).
  const f = await fallback.transcribe(args.audio);
  const ynF = confirmStep(normalize(f.words), { fallbackInvoked: true, fallbackTranscript: f.transcript, fallbackConfidence: f.confidence });
  if (ynF) return ynF;
  const rankedF = rankLegal(f, isLegal);
  const topF = rankedF[0] ?? null;
  const clearF = marginClear(rankedF);
  const trace: VoiceTrace = { ...blank, ...base, fallbackInvoked: true, fallbackTranscript: f.transcript, fallbackConfidence: f.confidence, fallbackLegal: topF !== null };

  // Deterministic fusion (architecture §5 — no score averaging).
  if (topP && topF && sameIntent(topP.intent, topF.intent) && clearP && clearF
    && topF.conf >= MIN_EVIDENCE) {
    trace.finalIntent = topP.intent; trace.outcome = "ACCEPT"; trace.recovery = true;
    return { outcome: "ACCEPT", intent: topP.intent, trace };
  }
  const solo = topP && !topF && topP.conf >= MIN_EVIDENCE && clearP ? topP
    : !topP && topF && topF.conf >= MIN_EVIDENCE ? topF : null;
  if (solo) {
    trace.finalIntent = solo.intent; trace.outcome = "ACCEPT"; trace.recovery = true;
    return { outcome: "ACCEPT", intent: solo.intent, trace };
  }
  if ((rankedP.length >= 2 || rankedF.length >= 2 || (topP && topF && !sameIntent(topP.intent, topF.intent)))
    && (topP ?? topF)) {
    // Never guess between two legal candidates; ask the player.
    const top = topP ?? topF!;
    const runner = (topP && topF && !sameIntent(topP.intent, topF.intent) ? topF : rankedP[1] ?? rankedF[1])?.intent;
    trace.finalIntent = null; trace.outcome = "CONFIRM";
    trace.confirmPrompt = `Did you say ${describeIntent(top.intent)}?`;
    return { outcome: "CONFIRM", intent: null, prompt: trace.confirmPrompt, candidates: runner ? [top.intent, runner] : [top.intent], trace };
  }
  trace.reason = "VOICE_UNCLEAR";
  return { outcome: "REJECT", intent: null, reason: "VOICE_UNCLEAR", trace };
}
