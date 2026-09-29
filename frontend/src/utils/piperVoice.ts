// Free, open-source speech for languages the phone or browser has no voice for.
// Piper voices (MIT, rhasspy/piper-voices) run in the browser through onnxruntime-web
// (MIT); text becomes phonemes through the espeak-ng based piper_phonemize WASM
// (GPL-3). Nothing runs on the Worker and no key is involved. Every file is fetched
// the first time a user asks for that language, then served from the browser cache.

const ORT_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/ort.wasm.min.js';
const ORT_WASM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PHONEMIZE_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const CACHE_NAME = 'madhuca-piper-v1';

/** Piper model per alert language. English is left to the device's own voice. */
export const PIPER_VOICES: Record<string, string> = {
  hi: 'hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx',
  te: 'te/te_IN/maya/medium/te_IN-maya-medium.onnx',
  // Piper has no Kannada voice. The Kannada alert is transliterated to Telugu script
  // (kannadaToTelugu) and read by the Telugu voice: close phonetics, Telugu accent.
  kn: 'te/te_IN/maya/medium/te_IN-maya-medium.onnx',
};

/** Download progress of the voice model, in bytes. `total` is 0 when unknown. */
export type VoiceProgress = (loaded: number, total: number) => void;

/**
 * Kannada and Telugu share Unicode layout at a fixed 0x80 offset, so the mapping is
 * arithmetic. The one Kannada-only letter (archaic LLLA, U+0CDE) has no Telugu slot
 * and is read as the nearest sound, LA.
 */
export function kannadaToTelugu(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0cde) out += 'ల';
    else if (c >= 0x0c80 && c <= 0x0cff) out += String.fromCharCode(c - 0x80);
    else out += text[i];
  }
  return out;
}

/** 16-bit mono PCM WAV, so the result plays through a plain <audio> element. */
export function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const ascii = (at: number, s: string) => [...s].forEach((ch, k) => view.setUint8(at + k, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return view.buffer;
}

// Minimal shapes of the two CDN globals, so no type package is needed.
interface OrtTensorCtor {
  new (type: 'int64', data: BigInt64Array, dims: number[]): unknown;
  new (type: 'float32', data: Float32Array, dims: number[]): unknown;
}
interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
}
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: OrtTensorCtor;
  InferenceSession: { create(model: ArrayBuffer, options: object): Promise<OrtSession> };
}
interface PhonemizeModule {
  callMain(args: string[]): void;
}
type CreatePhonemize = (module: {
  print: (line: string) => void;
  printErr: (line: string) => void;
  getPreloadedPackage: () => ArrayBuffer;
  wasmBinary: ArrayBuffer;
  locateFile: (url: string) => string;
}) => Promise<PhonemizeModule>;

interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  speaker_id_map?: Record<string, number>;
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(el);
    });
    p.catch(() => scripts.delete(src));
    scripts.set(src, p);
  }
  return p;
}

/** Fetch through the Cache API, reporting progress on the first (network) read. */
async function cachedBytes(url: string, onProgress?: VoiceProgress): Promise<ArrayBuffer> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) return hit.arrayBuffer();

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`voice download responded ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  await cache?.put(url, new Response(bytes)).catch(() => undefined);
  return bytes.buffer;
}

const sessions = new Map<string, Promise<{ session: OrtSession; config: PiperConfig }>>();
function loadVoice(path: string, onProgress?: VoiceProgress) {
  let s = sessions.get(path);
  if (!s) {
    s = (async () => {
      await loadScript(ORT_SCRIPT);
      const ort = (window as unknown as { ort: Ort }).ort;
      ort.env.wasm.wasmPaths = ORT_WASM_BASE;
      // Threads need cross-origin isolation, which this site does not set.
      ort.env.wasm.numThreads = 1;
      const config = JSON.parse(new TextDecoder().decode(await cachedBytes(`${VOICES_BASE}${path}.json`))) as PiperConfig;
      const model = await cachedBytes(`${VOICES_BASE}${path}`, onProgress);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      return { session, config };
    })();
    s.catch(() => sessions.delete(path));
    sessions.set(path, s);
  }
  return s;
}

// The phonemizer's 18 MB espeak-ng data is not reliably HTTP-cached, and letting the
// Emscripten loader fetch it cost ~7 s on every alert. Held once, preloaded: ~13 ms.
let phonemizeFiles: Promise<{ data: ArrayBuffer; wasm: ArrayBuffer }> | null = null;
function loadPhonemizeFiles() {
  if (!phonemizeFiles) {
    phonemizeFiles = Promise.all([
      cachedBytes(`${PHONEMIZE_BASE}.data`),
      cachedBytes(`${PHONEMIZE_BASE}.wasm`),
      loadScript(`${PHONEMIZE_BASE}.js`),
    ]).then(([data, wasm]) => ({ data, wasm }));
    phonemizeFiles.catch(() => (phonemizeFiles = null));
  }
  return phonemizeFiles;
}

async function phonemeIds(text: string, espeakVoice: string): Promise<number[]> {
  const { data, wasm } = await loadPhonemizeFiles();
  const create = (window as unknown as { createPiperPhonemize: CreatePhonemize }).createPiperPhonemize;
  return new Promise<number[]>((resolve, reject) => {
    create({
      print: (line) => resolve((JSON.parse(line) as { phoneme_ids: number[] }).phoneme_ids),
      printErr: (line) => reject(new Error(line)),
      getPreloadedPackage: () => data,
      wasmBinary: wasm,
      locateFile: (url) => url,
    })
      .then((m) =>
        m.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']),
      )
      .catch(reject);
  });
}

/**
 * Speak `text` in `langCode` with a Piper voice. Resolves to WAV bytes.
 * Throws when there is no Piper voice for the language, or a download fails.
 */
export async function synthesizeWithPiper(text: string, langCode: string, onProgress?: VoiceProgress): Promise<ArrayBuffer> {
  const path = PIPER_VOICES[langCode];
  if (!path) throw new Error(`no open-source voice for '${langCode}'`);
  const spoken = langCode === 'kn' ? kannadaToTelugu(text) : text;

  const { session, config } = await loadVoice(path, onProgress);
  const ids = await phonemeIds(spoken.trim(), config.espeak.voice);
  const ort = (window as unknown as { ort: Ort }).ort;
  const feeds: Record<string, unknown> = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor(
      'float32',
      Float32Array.from([config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w]),
      [3],
    ),
  };
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  }
  const out = await session.run(feeds);
  const pcm = out.output?.data;
  if (!pcm?.length) throw new Error('voice model returned no audio');
  return pcmToWav(pcm, config.audio.sample_rate);
}
