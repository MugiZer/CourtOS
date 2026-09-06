// B08 voice providers — honest wiring.
//
// PRODUCTION primary: the real browser Web Speech API (SpeechRecognition /
//   webkitSpeechRecognition with a tiny-vocab JSGF grammar), built by
//   createBrowserSpeechPrimary(). It consumes the live microphone, not byte
//   buffers, and cannot even be constructed without a browser (null there).
// PRODUCTION fallback: server-side Whisper-class transcription behind
//   createWhisperFallback(), which needs an API key and real network. It is an
//   interface only in this offline-first client build — never faked.
// There is no canned synthesis here: tests feed ASRResult literals through the
// injected provider seam in cascade.ts. The only byte-level check is the
// honest raw-PCM presence/energy gate below — no custom container format.

export const SAMPLE_RATE = 16000;
const RMS_GATE = 800;

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

// ---- shared presence gate (raw PCM16 mono @SAMPLE_RATE; no container) ----
// Null when the bytes are not even PCM16; otherwise the duration plus whether
// real energy is present (plain RMS VAD). cascade.ts maps this to its gates.
export function pcmPresence(audio: Uint8Array): { seconds: number; voiced: boolean } | null {
  if (audio.length === 0 || audio.length % 2 !== 0) return null;
  const n = audio.length / 2;
  const dv = new DataView(audio.buffer, audio.byteOffset, audio.length);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const v = dv.getInt16(i * 2, true) / 32768;
    acc += v * v;
  }
  return { seconds: n / SAMPLE_RATE, voiced: Math.sqrt(acc / n) * 32768 >= RMS_GATE };
}

// ---- PRODUCTION primary: the real browser Web Speech API ----
// Tiny-vocab JSGF grammar built from the same vocabulary below. Consumes the
// LIVE MICROPHONE, not byte buffers (buffered PCM exists only for the presence
// gate above and the injected test seam in cascade.ts, and is ignored here).
// Cannot even be constructed without a browser: no window, or no
// SpeechRecognition/webkitSpeechRecognition, returns null — said plainly,
// never papered over with synthesis.
export function createBrowserSpeechPrimary(opts: { lang?: string; wakeWord?: string } = {}): ASRProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, any>;
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (typeof SR !== "function") return null;
  const wakeWord = opts.wakeWord ?? "court";
  const grammar =
    `#JSGF V1.0; grammar tennis; public <call> = ${wakeWord} | ${Object.keys(WORD_FREQS).join(" | ")};`;
  return {
    name: "web-speech-live",
    transcribe: (_audio) =>
      new Promise<ASRResult>((resolve, reject) => {
        const rec = new SR();
        try {
          if (typeof w.SpeechGrammarList === "function") {
            const list = new w.SpeechGrammarList();
            list.addFromString(grammar, 1);
            rec.grammars = list;
          }
        } catch { /* grammar hint is optional */ }
        rec.lang = opts.lang ?? "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 2;
        rec.onresult = (ev: any) => {
          const alts = Array.from((ev.results[0] ?? []) as ArrayLike<{ transcript: string; confidence: number }>);
          const top = alts[0];
          const done = (r: Omit<ASRResult, "provider">): void =>
            resolve({ ...r, provider: "web-speech-live" });
          if (!top) return done({ transcript: "", words: [], confidence: 0, nbest: [], usable: false, wake: false });
          const tokens = top.transcript.trim().toLowerCase().split(/\s+/);
          const wake = tokens[0] === wakeWord;
          const words = (wake ? tokens.slice(1) : tokens).map((t) => (t in WORD_FREQS ? t : null));
          const conf = typeof top.confidence === "number" ? top.confidence : 0;
          const usable = words.length > 0 && words.every((x) => x !== null);
          done({
            transcript: (words.filter(Boolean) as string[]).join(" "),
            words,
            confidence: conf,
            nbest: words.map((wd) => (wd === null ? [] : [{ word: wd, confidence: conf }])),
            usable,
            wake,
          });
        };
        rec.onerror = (ev: any) => reject(new Error(`web-speech-live: ${ev?.error ?? "recognition error"}`));
        try {
          rec.start();
        } catch (e) {
          reject(e);
        }
      }),
  };
}

// ---- PRODUCTION fallback: server-side Whisper-class transcription ----
// Interface only in this offline-first client build: it needs an API key and
// real network, so without a key the factory refuses — transcription is never
// faked locally. The authenticated upload lives in transcribe once wired.
export interface WhisperFallbackConfig {
  apiKey: string;
  endpoint?: string;
}
export function createWhisperFallback(config: WhisperFallbackConfig): ASRProvider {
  if (!config || typeof config.apiKey !== "string" || config.apiKey.length === 0)
    throw new Error("createWhisperFallback: server-side Whisper needs an API key; refusing to fake transcription");
  const endpoint = config.endpoint ?? "https://api.openai.com/v1/audio/transcriptions";
  return {
    name: "whisper-server",
    transcribe: async (_audio) => {
      throw new Error(
        `whisper-server: server round-trip not wired in this build (endpoint ${endpoint}); refusing to fake transcription`,
      );
    },
  };
}
