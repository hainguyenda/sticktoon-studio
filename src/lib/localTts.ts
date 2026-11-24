/**
 * In-browser text-to-speech engines, ported from giong-doc.vercel.app:
 *  - English: Kokoro-82M (kokoro-js, ONNX, WebGPU → WASM fallback)
 *  - Vietnamese: KorvaTTS (onnxruntime-web, 4-stage flow-matching pipeline, cached in CacheStorage)
 * Everything runs on the user's machine; models are downloaded once from jsDelivr / Hugging Face.
 */
import type { Language } from "./types";

export interface LocalVoice {
  id: string;
  name: string;
  desc: string;
  star?: boolean;
}

export const LOCAL_VOICES: Record<Language, LocalVoice[]> = {
  vi: [
    { id: "khanh_vy", name: "Khánh Vy", desc: "Nữ · giọng Việt" },
    { id: "bao_kim", name: "Bảo Kim", desc: "Nữ · giọng Việt" },
    { id: "ngoc_huyen", name: "Ngọc Huyền", desc: "Nữ · giọng Việt" },
    { id: "phuong_linh", name: "Phương Linh", desc: "Nữ · giọng Việt" },
    { id: "quynh_nhu", name: "Quỳnh Như", desc: "Nữ · giọng Việt" },
    { id: "gia_bao", name: "Gia Bảo", desc: "Nam · giọng Việt" },
    { id: "hoang_nam", name: "Hoàng Nam", desc: "Nam · giọng Việt" },
    { id: "huu_dat", name: "Hữu Đạt", desc: "Nam · giọng Việt" },
    { id: "quang_huy", name: "Quang Huy", desc: "Nam · giọng Việt" },
    { id: "thanh_phong", name: "Thanh Phong", desc: "Nam · giọng Việt" },
  ],
  en: [
    { id: "am_onyx", name: "Onyx", desc: "Nam Mỹ · trầm", star: true },
    { id: "bm_george", name: "George", desc: "Nam Anh · trầm, kể chuyện", star: true },
    { id: "am_michael", name: "Michael", desc: "Nam Mỹ · ấm", star: true },
    { id: "bm_lewis", name: "Lewis", desc: "Nam Anh · trầm", star: true },
    { id: "am_fenrir", name: "Fenrir", desc: "Nam Mỹ · mạnh" },
    { id: "am_adam", name: "Adam", desc: "Nam Mỹ" },
    { id: "am_eric", name: "Eric", desc: "Nam Mỹ" },
    { id: "am_echo", name: "Echo", desc: "Nam Mỹ" },
    { id: "am_liam", name: "Liam", desc: "Nam Mỹ" },
    { id: "am_puck", name: "Puck", desc: "Nam Mỹ · trẻ" },
    { id: "bm_daniel", name: "Daniel", desc: "Nam Anh" },
    { id: "bm_fable", name: "Fable", desc: "Nam Anh" },
    { id: "af_heart", name: "Heart", desc: "Nữ Mỹ" },
    { id: "af_bella", name: "Bella", desc: "Nữ Mỹ" },
    { id: "af_nicole", name: "Nicole", desc: "Nữ Mỹ · nhẹ" },
    { id: "bf_emma", name: "Emma", desc: "Nữ Anh" },
  ],
};

export const VOICE_SAMPLES: Record<Language, string> = {
  vi: "Tèo lần đầu đi máy bay, và anh ấy tự tin như một cơ trưởng thực thụ.",
  en: "Bob boarded his very first flight, feeling as confident as the captain himself.",
};

export interface Synth {
  audio: Float32Array;
  sr: number;
}

type StatusFn = (msg: string) => void;

// Load ES modules from a CDN at runtime without the bundler trying to resolve them.
const importUrl = new Function("u", "return import(u)") as <T = unknown>(url: string) => Promise<T>;

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/* ------------------------------- Kokoro (EN) ------------------------------- */

interface KokoroModel {
  generate: (text: string, opts: { voice: string; speed: number }) => Promise<{ audio: Float32Array; sampling_rate: number }>;
}
let kokoroPromise: Promise<KokoroModel> | null = null;

function loadKokoro(onStatus: StatusFn): Promise<KokoroModel> {
  if (kokoroPromise) return kokoroPromise;
  kokoroPromise = (async () => {
    const mod = await importUrl<{ KokoroTTS: { from_pretrained: (id: string, o: unknown) => Promise<KokoroModel> } }>(
      "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm",
    );
    const gpu = await hasWebGpu();
    onStatus("Đang tải giọng Anh (Kokoro, ~90 MB, chỉ tải 1 lần)…");
    const model = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: gpu ? "fp32" : "q8",
      device: gpu ? "webgpu" : "wasm",
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === "progress" && p.total) onStatus(`Đang tải giọng Anh… ${Math.round((100 * (p.loaded ?? 0)) / p.total)}%`);
      },
    });
    onStatus(`Giọng Anh sẵn sàng${gpu ? " (WebGPU)" : " (WASM – chậm hơn)"}.`);
    return model;
  })().catch((e) => {
    kokoroPromise = null;
    throw e;
  });
  return kokoroPromise;
}

/* ------------------------------- KorvaTTS (VI) ------------------------------- */

const KORVA = "https://huggingface.co/dogenthq/KorvaTTS/resolve/main/";
const ORT_VER = "1.22.0";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ort = any;
type Session = any;
type Tensor = any;

interface Korva {
  ort: Ort;
  bytes: Record<"dp" | "te" | "ve" | "voc", Uint8Array>;
  sess: Record<"dp" | "te" | "ve" | "voc", Session>;
  ep: "webgpu" | "wasm";
  cfg: { ae: { sample_rate: number; base_chunk_size: number }; ttl: { chunk_compress_factor: number; latent_dim: number } };
  indexer: number[] | Record<string, number>;
}
let korva: Korva | null = null;
let korvaPromise: Promise<Korva> | null = null;
const styleCache: Record<string, { ttl: Tensor; dp: Tensor }> = {};

async function cachedFetch(url: string, onProgress?: (got: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open("korva-v1");
    const hit = await cache.match(url);
    if (hit) {
      const b = new Uint8Array(await hit.arrayBuffer());
      onProgress?.(b.length, b.length);
      return b;
    }
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Không tải được ${url.split("/").pop()} (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(got, total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  if (cache) {
    try {
      await cache.put(url, new Response(buf));
    } catch {
      /* quota exceeded – model still works this session */
    }
  }
  return buf;
}

const parseJSON = <T,>(b: Uint8Array): T => JSON.parse(new TextDecoder().decode(b)) as T;

async function makeSessions(ort: Ort, bytes: Korva["bytes"], ep: string): Promise<Korva["sess"]> {
  const opt = { executionProviders: [ep] };
  const s = {} as Korva["sess"];
  for (const k of ["dp", "te", "ve", "voc"] as const) s[k] = await ort.InferenceSession.create(bytes[k], opt);
  return s;
}

function loadKorva(onStatus: StatusFn): Promise<Korva> {
  if (korva) return Promise.resolve(korva);
  if (korvaPromise) return korvaPromise;
  korvaPromise = (async () => {
    onStatus("Đang chuẩn bị bộ giọng Việt…");
    const ort = await importUrl<Ort>(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/ort.webgpu.min.mjs`);
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
    const prog: Record<string, { got: number; total: number }> = {};
    const rep = (k: string) => (got: number, total: number) => {
      prog[k] = { got, total };
      const g = Object.values(prog).reduce((a, b) => a + b.got, 0);
      const t = Object.values(prog).reduce((a, b) => a + b.total, 0);
      onStatus(
        t && Object.keys(prog).length === 4 && g <= t
          ? `Đang tải giọng Việt (~400 MB, chỉ tải 1 lần)… ${Math.round((100 * g) / t)}%`
          : `Đang tải giọng Việt… ${Math.round(g / 1e6)} MB`,
      );
    };
    const [dp, te, ve, voc, cfgB, idxB] = await Promise.all([
      cachedFetch(KORVA + "onnx/duration_predictor.onnx", rep("dp")),
      cachedFetch(KORVA + "onnx/text_encoder.onnx", rep("te")),
      cachedFetch(KORVA + "onnx/vector_estimator.onnx", rep("ve")),
      cachedFetch(KORVA + "onnx/vocoder.onnx", rep("voc")),
      cachedFetch(KORVA + "onnx/tts.json"),
      cachedFetch(KORVA + "onnx/unicode_indexer.json"),
    ]);
    const bytes = { dp, te, ve, voc };
    onStatus("Đang khởi động giọng Việt…");
    let ep: "webgpu" | "wasm" = (await hasWebGpu()) ? "webgpu" : "wasm";
    let sess: Korva["sess"];
    try {
      sess = await makeSessions(ort, bytes, ep);
    } catch (e) {
      if (ep === "wasm") throw e;
      ep = "wasm";
      sess = await makeSessions(ort, bytes, ep);
    }
    korva = { ort, bytes, sess, ep, cfg: parseJSON(cfgB), indexer: parseJSON(idxB) };
    onStatus(`Giọng Việt sẵn sàng${ep === "webgpu" ? " (WebGPU)" : " (WASM – chậm hơn)"}.`);
    return korva;
  })().catch((e) => {
    korvaPromise = null;
    throw e;
  });
  return korvaPromise;
}

async function getStyle(ort: Ort, id: string) {
  if (styleCache[id]) return styleCache[id];
  const j = parseJSON<{ style_ttl: { data: unknown[]; dims: number[] }; style_dp: { data: unknown[]; dims: number[] } }>(
    await cachedFetch(KORVA + "voice_styles/" + id + ".json"),
  );
  const mk = (o: { data: unknown[]; dims: number[] }) =>
    new ort.Tensor("float32", Float32Array.from((o.data as unknown[]).flat(Infinity) as number[]), o.dims);
  return (styleCache[id] = { ttl: mk(j.style_ttl), dp: mk(j.style_dp) });
}

function korvaPrep(text: string): string {
  let t = text.normalize("NFKD");
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+/gu, "");
  const rep: Record<string, string> = {
    "–": "-",
    "‑": "-",
    "—": "-",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
    "´": "'",
    "`": "'",
    "[": " ",
    "]": " ",
    "|": " ",
    "/": " ",
    "#": " ",
    "→": " ",
    "←": " ",
  };
  t = t.replace(/[–‑—“”‘’´`[\]|/#→←]/g, (c) => rep[c] ?? c);
  t = t.replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'")]$/.test(t)) t += ".";
  return `<vi>${t}</vi>`;
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function run(session: Session, feeds: Record<string, Tensor>) {
  const names: string[] = session.inputNames;
  const miss = names.filter((n) => !(n in feeds));
  if (miss.length) throw new Error(`Bộ giọng cần thêm đầu vào: ${miss.join(", ")}`);
  const f: Record<string, Tensor> = {};
  for (const n of names) f[n] = feeds[n];
  return session.run(f);
}

async function korvaOnce(k: Korva, text: string, id: string, speed: number, steps: number): Promise<Synth> {
  const { ort, sess, cfg, indexer } = k;
  const style = await getStyle(ort, id);
  const ids: bigint[] = [];
  for (const ch of korvaPrep(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    const v = Array.isArray(indexer) ? indexer[cp] : indexer[String(cp)];
    if (v !== undefined && v !== null && v >= 0) ids.push(BigInt(v));
  }
  if (!ids.length) throw new Error("Không có chữ hợp lệ để đọc.");
  const L = ids.length;
  const textIds = new ort.Tensor("int64", BigInt64Array.from(ids), [1, L]);
  const textMask = new ort.Tensor("float32", new Float32Array(L).fill(1), [1, 1, L]);
  const d = await run(sess.dp, { text_ids: textIds, style_dp: style.dp, text_mask: textMask });
  const dur = (d[sess.dp.outputNames[0]].data[0] as number) / speed;
  const e = await run(sess.te, { text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
  const textEmb = e[sess.te.outputNames[0]];
  const sr = cfg.ae.sample_rate;
  const chunk = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor;
  const D = cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor;
  const wavLen = Math.max(1, Math.floor(dur * sr));
  const T = Math.max(1, Math.ceil(wavLen / chunk));
  const init = new Float32Array(D * T);
  for (let i = 0; i < init.length; i++) init[i] = randn();
  const latentMask = new ort.Tensor("float32", new Float32Array(T).fill(1), [1, 1, T]);
  let cur = new ort.Tensor("float32", init, [1, D, T]);
  const totalT = new ort.Tensor("float32", Float32Array.of(steps), [1]);
  for (let s = 0; s < steps; s++) {
    const o = await run(sess.ve, {
      noisy_latent: cur,
      text_emb: textEmb,
      style_ttl: style.ttl,
      text_mask: textMask,
      latent_mask: latentMask,
      current_step: new ort.Tensor("float32", Float32Array.of(s), [1]),
      total_step: totalT,
    });
    cur = o[sess.ve.outputNames[0]];
  }
  const w = await run(sess.voc, { latent: cur });
  const data: Float32Array = await w[sess.voc.outputNames[0]].getData();
  return { audio: Float32Array.from(data.subarray(0, Math.min(data.length, wavLen))), sr };
}

async function korvaSynth(text: string, id: string, speed: number, steps: number, onStatus: StatusFn): Promise<Synth> {
  const k = await loadKorva(onStatus);
  try {
    return await korvaOnce(k, text, id, speed, steps);
  } catch (e) {
    if (k.ep !== "webgpu") throw e;
    onStatus("Card đồ hoạ gặp lỗi, chuyển sang chế độ thường (chậm hơn)…");
    k.sess = await makeSessions(k.ort, k.bytes, "wasm");
    k.ep = "wasm";
    Object.keys(styleCache).forEach((key) => delete styleCache[key]);
    return korvaOnce(k, text, id, speed, steps);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------- public API ------------------------------- */

export interface TtsOptions {
  lang: Language;
  voice: string;
  speed: number;
  /** pause inserted between sentences, seconds */
  pause: number;
  /** Korva diffusion steps (8 fast · 16 balanced · 32 best) */
  steps: number;
  onStatus?: StatusFn;
  signal?: AbortSignal;
}

/** Split text into sentence chunks ≤ ~220 chars (same rules as giong-doc). */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const sents = flat.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g) ?? [flat];
  const out: string[] = [];
  let cur = "";
  for (let s of sents) {
    s = s.trim();
    if (!s) continue;
    if ((cur + " " + s).length > 220 && cur) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
    if (/[.!?…]["'”’)]*$/.test(s)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function synthChunk(text: string, o: TtsOptions): Promise<Synth> {
  const status = o.onStatus ?? (() => undefined);
  if (o.lang === "vi") return korvaSynth(text, o.voice, o.speed, o.steps, status);
  const model = await loadKokoro(status);
  const a = await model.generate(text, { voice: o.voice, speed: o.speed });
  return { audio: a.audio, sr: a.sampling_rate };
}

/** Synthesize a passage (any length) into one mono buffer, with pauses between sentences. */
export async function synthesize(text: string, o: TtsOptions): Promise<Synth> {
  const chunks = splitSentences(text);
  const parts: Float32Array[] = [];
  let sr = 24000;
  for (let i = 0; i < chunks.length; i++) {
    if (o.signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
    const a = await synthChunk(chunks[i], o);
    sr = a.sr;
    parts.push(applyFades(Float32Array.from(a.audio), sr));
    if (i < chunks.length - 1) parts.push(new Float32Array(Math.round(sr * o.pause)));
  }
  const audio = concatFloat(parts);
  normalizePeak([audio]);
  return { audio, sr };
}

/** Short linear fade in/out so chunk edges never click. */
export function applyFades(buf: Float32Array, sr: number, ms = 8): Float32Array {
  const n = Math.min(Math.floor((sr * ms) / 1000), Math.floor(buf.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    buf[i] *= g;
    buf[buf.length - 1 - i] *= g;
  }
  return buf;
}

export function peakOf(bufs: Float32Array[]): number {
  let peak = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) {
    const v = Math.abs(b[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * Scale buffers in place so the loudest sample sits at `target` (≈ -1 dBFS).
 * The TTS models can output samples above 1.0, which would hard-clip (crackle) when written to WAV.
 */
export function normalizePeak(bufs: Float32Array[], target = 0.89): void {
  const peak = peakOf(bufs);
  if (peak <= 0) return;
  const g = target / peak;
  for (const b of bufs) for (let i = 0; i < b.length; i++) b[i] *= g;
}

export function concatFloat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const all = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return all;
}

export function floatToWav(samples: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
