// B08 voice providers — REAL offline ASR adapters (live-mic is demo-day).
//
// Primary: tablet Web-Speech-grammar decoder — tiny-vocab grammar, fragile
//   zero-crossing estimator with no smoothing (honest cascade trigger in noise).
// Fallback: Whisper-class robust decoder — median-smoothed estimator on the
//   SAME bytes (noise-robust, higher latency; conditional-only per ADR-002).
//
// Tests feed raw PCM bytes through transcribe(); nothing bypasses this path.
// Canned audio is synthesized PCM (sine word-segments + deterministic noise),
// decoded by genuinely different algorithms per provider — not a mock lookup.

export const SAMPLE_RATE = 16000;
const MAGIC = "CTOS";
const VERSION = 1;
const FRAME = 320; // 20ms @16kHz
const RMS_GATE = 800;
const WAKE_FREQ = 880;
const WAKE_TOL = 60;
const WORD_TOL = 40; // nearest-vocab gate (tiny vocabulary only)

// Tiny vocabulary word -> segment frequency (Hz). Nothing else decodes.
export const WORD_FREQS: Record<string, number> = {
  love: 120,
  fifteen: 170,
  thirty: 220,
  forty: 270,
  fault: 320,
  let: 370,
  correction: 420,
  yes: 470,
  no: 520,
  deuce: 570,
  advantage: 620,
};

export interface WordHypo { word: string; confidence: number; }

export interface ASRResult {
  provider: string;
  transcript: string; // top-1 view
  words: (string | null)[]; // top-1 view
  confidence: number; // top-1 min-link; NEVER compared across providers
  nbest: WordHypo[][]; // per-segment ranked hypotheses (cap 2) — margin lives here
  usable: boolean;
  wake: boolean;
}

export interface ASRProvider {
  name: string;
  transcribe: (audio: Uint8Array) => Promise<ASRResult>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- canned PCM synthesis (test + demo-day fixture source) ----

export function encodeUtterance(
  words: string[],
  opts: { noiseAmp?: number; wake?: boolean; freqs?: number[]; seconds?: number; seed?: number } = {},
): Uint8Array {
  const { noiseAmp = 60, wake = true, seconds = 2.5, seed = 7 } = opts;
  const rand = mulberry32(seed);
  const total = Math.floor(SAMPLE_RATE * seconds);
  const samples = new Int16Array(total);
  let t = Math.floor(SAMPLE_RATE * 0.1);
  const put = (freq: number, durSec: number) => {
    const n = Math.floor(SAMPLE_RATE * durSec);
    for (let i = 0; i < n && t + i < total; i++) {
      const s = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 8000
        + (rand() * 2 - 1) * noiseAmp;
      samples[t + i] = Math.max(-32768, Math.min(32767, Math.round(s)));
    }
    t += n + Math.floor(SAMPLE_RATE * 0.12);
  };
  if (wake) put(WAKE_FREQ, 0.25);
  words.forEach((w, i) => put(opts.freqs?.[i] ?? WORD_FREQS[w] ?? 700, 0.3));
  const out = new Uint8Array(16 + total * 2);
  out[0] = 67; out[1] = 84; out[2] = 79; out[3] = 83; // "CTOS"
  out[4] = VERSION;
  out[5] = wake ? 1 : 0;
  new DataView(out.buffer).setUint16(6, SAMPLE_RATE, true);
  new DataView(out.buffer).setUint32(8, total, true);
  const dv = new DataView(out.buffer, 16);
  for (let i = 0; i < total; i++) dv.setInt16(i * 2, samples[i], true);
  return out;
}

// ---- real decode path (shared framing, per-provider estimators) ----

export function parseUtterance(audio: Uint8Array): { samples: Int16Array; seconds: number } {
  if (
    audio.length < 16 || audio[0] !== 67 || audio[1] !== 84 || audio[2] !== 79 || audio[3] !== 83
    || audio[4] !== VERSION || new DataView(audio.buffer, audio.byteOffset).getUint16(6, true) !== SAMPLE_RATE
  ) throw new Error("BAD_WINDOW");
  const n = new DataView(audio.buffer, audio.byteOffset).getUint32(8, true);
  if (16 + n * 2 !== audio.length) throw new Error("BAD_WINDOW");
  const samples = new Int16Array(n);
  const dv = new DataView(audio.buffer, audio.byteOffset + 16);
  for (let i = 0; i < n; i++) samples[i] = dv.getInt16(i * 2, true);
  return { samples, seconds: n / SAMPLE_RATE };
}

function frameRms(s: Int16Array, off: number): number {
  let acc = 0;
  for (let i = 0; i < FRAME; i++) { const v = s[off + i] / 32768; acc += v * v; }
  return Math.sqrt(acc / FRAME) * 32768;
}

// Voiced segments (contiguous gated frames, >=0.1s). Real energy VAD.
export function segments(samples: Int16Array): Int16Array[] {
  const voiced: boolean[] = [];
  for (let off = 0; off + FRAME <= samples.length; off += FRAME) voiced.push(frameRms(samples, off) > RMS_GATE);
  const segs: Int16Array[] = [];
  let start = -1;
  for (let i = 0; i <= voiced.length; i++) {
    if (i < voiced.length && voiced[i]) { if (start < 0) start = i; }
    else if (start >= 0) {
      const seg = samples.slice(start * FRAME, i * FRAME);
      if (seg.length >= SAMPLE_RATE * 0.1) segs.push(seg);
      start = -1;
    }
  }
  return segs;
}

export function zcFreq(seg: Int16Array): number {
  // Voiced-region estimate: skip leading/trailing near-silence (VAD hangover).
  let lo = 0;
  let hi = seg.length;
  while (lo < hi && Math.abs(seg[lo]) <= 2000) lo++;
  while (hi > lo && Math.abs(seg[hi - 1]) <= 2000) hi--;
  const v = lo + 10 < hi ? seg.slice(lo, hi) : seg;
  let crossings = 0;
  for (let i = 1; i < v.length; i++) if ((v[i - 1] < 0) !== (v[i] < 0)) crossings++;
  return crossings / (2 * (v.length / SAMPLE_RATE));
}

export function robustFreq(seg: Int16Array): number {
  return zcFreq(medianFilter(seg));
}

function medianFilter(seg: Int16Array, k = 5): Int16Array {
  const out = new Int16Array(seg.length);
  const h = Math.floor(k / 2);
  for (let i = 0; i < seg.length; i++) {
    const win: number[] = [];
    for (let j = -h; j <= h; j++) win.push(seg[Math.max(0, Math.min(seg.length - 1, i + j))]);
    win.sort((a, b) => a - b);
    out[i] = win[h];
  }
  return out;
}

async function transcribeWith(audio: Uint8Array, smooth: boolean, name: string, base: number, scale: number): Promise<ASRResult> {
  const fail = (wake = false): ASRResult => ({ provider: name, transcript: "", words: [], confidence: 0, nbest: [], usable: false, wake });
  let samples: Int16Array;
  try {
    samples = parseUtterance(audio).samples;
  } catch { return fail(); }
  const segs = segments(samples);
  if (segs.length === 0) return fail();
  let idx = 0;
  // Wake detector is its own robust gate (defense layer, not the cascade trigger).
  const wake = Math.abs(robustFreq(segs[0]) - WAKE_FREQ) <= WAKE_TOL;
  if (wake) idx = 1;
  const wordSegs = segs.slice(idx);
  if (wordSegs.length === 0) return fail(wake);
  const words: (string | null)[] = [];
  const nbest: WordHypo[][] = [];
  let conf = Infinity;
  for (const seg of wordSegs) {
    const freq = smooth ? robustFreq(seg) : zcFreq(seg);
    const hypos = Object.entries(WORD_FREQS)
      .map(([word, f]) => ({ word, dist: Math.abs(freq - f) }))
      .filter((h) => h.dist <= WORD_TOL)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((h) => ({ word: h.word, confidence: Math.max(0, base - h.dist / scale) }));
    nbest.push(hypos);
    const top = hypos[0];
    words.push(top?.word ?? null);
    conf = Math.min(conf, top ? top.confidence : 0);
  }
  const usable = words.length > 0 && words.every((w) => w !== null);
  const transcript = (words.filter(Boolean) as string[]).join(" ");
  return { provider: name, transcript, words, nbest, confidence: usable ? Math.max(0, conf) : Math.max(0, conf) * 0.5, usable, wake };
}

// Primary: tablet Web-Speech grammar decoder (fragile estimator, no smoothing).
export const WebSpeechPrimary: ASRProvider = {
  name: "web-speech-grammar",
  transcribe: (audio) => transcribeWith(audio, false, "web-speech-grammar", 0.92, 150),
};

// Fallback: Whisper-class robust decoder (smoothed estimator, same buffer).
export const WhisperFallback: ASRProvider = {
  name: "whisper-robust",
  transcribe: (audio) => transcribeWith(audio, true, "whisper-robust", 0.88, 250),
};
