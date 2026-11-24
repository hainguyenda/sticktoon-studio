import { STYLE_LOCK } from "./constants";
import type { Character, Language, ScriptData, Settings } from "./types";
import { cleanVoiceover, normaliseDurations, validateScript } from "./validate";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}
interface TextPart {
  text: string;
}
type Part = InlinePart | TextPart;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: (Partial<TextPart> & Partial<InlinePart> & { inline_data?: InlinePart["inlineData"] })[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

function parseRetryDelay(body: unknown, headers: Headers): number | null {
  const ra = headers.get("retry-after");
  if (ra && !isNaN(Number(ra))) return Number(ra) * 1000;
  const details = (body as { error?: { details?: { "@type"?: string; retryDelay?: string }[] } })?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d.retryDelay) {
        const m = /([\d.]+)s/.exec(d.retryDelay);
        if (m) return Math.ceil(parseFloat(m[1]) * 1000);
      }
    }
  }
  return null;
}

async function callGenerate(
  apiKey: string,
  model: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  if (!apiKey) throw new GeminiError("Chưa nhập Gemini API Key trong Cài đặt.", 401);
  const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } })?.error?.message ?? (text.slice(0, 300) || `HTTP ${res.status}`);
    throw new GeminiError(msg, res.status, parseRetryDelay(json, res.headers));
  }
  return json as GeminiResponse;
}

/** Retry wrapper with exponential backoff that honours server-provided retry delays (429 / 5xx). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; signal?: AbortSignal; onRetry?: (attempt: number, waitMs: number, err: Error) => void },
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      const status = err instanceof GeminiError ? err.status : 0;
      const retryable = status === 429 || status >= 500 || status === 0;
      attempt++;
      if (!retryable || attempt > opts.maxRetries) throw err;
      const base = err instanceof GeminiError && err.retryAfterMs ? err.retryAfterMs : 2000 * 2 ** (attempt - 1);
      const wait = Math.min(60000, base + Math.random() * 700);
      opts.onRetry?.(attempt, wait, err as Error);
      await sleep(wait, opts.signal);
    }
  }
}

export async function listModels(apiKey: string): Promise<{ name: string; methods: string[] }[]> {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey } });
  const json = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
    error?: { message: string };
  };
  if (!res.ok) throw new GeminiError(json.error?.message ?? `HTTP ${res.status}`, res.status);
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ name: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods ?? [] }));
}

/* ------------------------------ Script director ------------------------------ */

const SCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    voiceoverScript: { type: "STRING" },
    characters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, description: { type: "STRING" } },
        required: ["name", "description"],
      },
    },
    scenes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "INTEGER" },
          duration: { type: "NUMBER" },
          narration: { type: "STRING" },
          shotType: { type: "STRING", enum: ["wide", "medium", "close_up", "extreme_close_up"] },
          cameraEffect: {
            type: "STRING",
            enum: ["static", "punch_zoom_in", "slow_zoom", "dramatic_shake", "freeze_grayscale", "flash_cut"],
          },
          sfx: {
            type: "STRING",
            enum: ["none", "vine_boom", "record_scratch", "whoosh", "pop", "ding", "cricket"],
          },
          imagePrompt: { type: "STRING" },
        },
        required: ["id", "duration", "narration", "shotType", "cameraEffect", "sfx", "imagePrompt"],
        propertyOrdering: ["id", "duration", "narration", "shotType", "cameraEffect", "sfx", "imagePrompt"],
      },
    },
  },
  required: ["title", "voiceoverScript", "characters", "scenes"],
  propertyOrdering: ["title", "voiceoverScript", "characters", "scenes"],
};

function buildDirectorPrompt(topic: string, duration: number, language: Language): string {
  const lang = language === "vi" ? "Vietnamese (tiếng Việt tự nhiên, đời thường, hài hước)" : "English (casual, punchy)";
  return `You are the head writer and director of a viral 9:16 short-form comedy cartoon channel.
Style: 2D flat cartoon / stickman-hybrid, thick black outlines, round white heads with huge expressive eyes, over-the-top reactions, flat muted backgrounds, hard snappy cuts, and ALWAYS a strong twist/punchline at the end.

TASK: Write a complete ${duration}-second comedy short about: "${topic}".

RULES:
1. Narration & voiceover language: ${lang}. imagePrompt must ALWAYS be in English.
2. "voiceoverScript": the exact clean text a voice actor reads, the concatenation of every scene's narration in order. NO parentheses, NO brackets, NO stage directions, NO scene labels, NO emojis, NO speaker tags. Pure spoken words only.
3. "characters": 1–4 fixed characters. "description" is a LOCKED English visual description (head shape, eyes, hair, clothing colors, body proportions, signature accessory) that must never change across scenes.
4. "scenes": between 8 and 15 scenes. Sum of all "duration" values ≈ ${duration} seconds (each 1.5–7s, 0.1s precision). "id" starts at 1 and increments.
5. Narration per scene must fit its duration at ~2.6 words/second (Vietnamese ~3.2 words/second).
6. Pacing: hook in scene 1 (≤3s), escalate, then the final 1–3 scenes deliver a twist. Use "freeze_grayscale" or "punch_zoom_in" with "vine_boom"/"record_scratch" on the twist beat. Use "cricket" for awkward silence, "whoosh" for transitions, "pop"/"ding" for small gags, "dramatic_shake" for panic, "flash_cut" for sudden reveals. Use "static" or "slow_zoom" for calm setup scenes. Don't put SFX on every scene.
7. "imagePrompt": detailed English prompt: setting, camera angle consistent with shotType, character names AND their locked descriptions, poses, exaggerated facial expressions, props, lighting mood, vertical 9:16 composition. It MUST end with exactly: "${STYLE_LOCK}".
8. Never include written words, signs with text, or speech bubbles in the image prompts.

Return ONLY JSON that matches the schema.`;
}

export async function generateScript(
  settings: Settings,
  params: { topic: string; duration: number; language: Language },
  signal?: AbortSignal,
): Promise<ScriptData> {
  const body = {
    contents: [{ role: "user", parts: [{ text: buildDirectorPrompt(params.topic, params.duration, params.language) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCRIPT_SCHEMA,
      temperature: 1,
    },
  };
  const res = await withRetry(() => callGenerate(settings.geminiApiKey, settings.textModel, body, signal), {
    maxRetries: settings.maxRetries,
    signal,
  });
  if (res.promptFeedback?.blockReason) throw new GeminiError(`Prompt bị chặn: ${res.promptFeedback.blockReason}`, 400);
  const text = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new GeminiError("Gemini không trả về nội dung.", 500);
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    throw new GeminiError("Gemini trả về JSON không hợp lệ. Hãy thử lại.", 500);
  }
  return finalizeScript(raw, params);
}

/** Pull the JSON object out of an AI chat answer (handles ```json fences and text around it). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^\uFEFF/, "");
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fence ? fence[1] : t;
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Không tìm thấy khối JSON { ... } trong nội dung đã dán.");
  const slice = body
    .slice(first, last + 1)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(slice);
}

/** Validate + normalise a raw director JSON (from Gemini API or pasted from any AI chat). */
export function finalizeScript(raw: unknown, params: { topic: string; duration: number; language: Language }): ScriptData {
  const obj = { ...(raw as Record<string, unknown>), topic: params.topic, language: params.language, targetDuration: params.duration };
  const v = validateScript(obj);
  if (!v.ok || !v.data) throw new GeminiError(`JSON sai cấu trúc: ${v.errors.slice(0, 4).join("; ")}`, 500);
  const data = v.data;
  const durations = normaliseDurations(
    data.scenes.map((s) => s.duration),
    params.duration,
  );
  data.scenes = data.scenes.map((s, i) => ({ ...s, id: i + 1, duration: durations[i], narration: cleanVoiceover(s.narration).replace(/\s*\n\s*/g, " ") }));
  const joined = data.scenes.map((s) => s.narration.trim()).join(" ");
  data.voiceoverScript = cleanVoiceover(data.voiceoverScript || joined);
  return data;
}

/** Prompt to paste into Claude / Gemini / ChatGPT chat when working without an API key. */
export function buildManualDirectorPrompt(topic: string, duration: number, language: Language): string {
  const example = {
    title: "string",
    voiceoverScript: "string – toàn bộ lời đọc sạch, nối các narration theo thứ tự",
    characters: [{ name: "string", description: "locked English visual description" }],
    scenes: [
      {
        id: 1,
        duration: 3.5,
        narration: "string",
        shotType: "wide | medium | close_up | extreme_close_up",
        cameraEffect: "static | punch_zoom_in | slow_zoom | dramatic_shake | freeze_grayscale | flash_cut",
        sfx: "none | vine_boom | record_scratch | whoosh | pop | ding | cricket",
        imagePrompt: `English prompt ..., ${STYLE_LOCK}`,
      },
    ],
  };
  return `${buildDirectorPrompt(topic, duration, language).replace("Return ONLY JSON that matches the schema.", "")}
OUTPUT FORMAT – return ONE JSON object only, inside a single \`\`\`json code block, no explanation before or after. Exact structure (pick exactly one value for each enum field):
${JSON.stringify(example, null, 2)}`;
}

/* ------------------------------ Image generation ------------------------------ */

export interface ImageRef {
  mimeType: string;
  base64: string;
}

function extractImage(res: GeminiResponse): Blob {
  if (res.promptFeedback?.blockReason) throw new GeminiError(`Prompt bị chặn: ${res.promptFeedback.blockReason}`, 400);
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) {
      const bin = atob(inline.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: inline.mimeType || "image/png" });
    }
  }
  const reason = res.candidates?.[0]?.finishReason;
  const txt = parts.map((p) => p.text ?? "").join(" ").slice(0, 200);
  throw new GeminiError(`Model không trả về ảnh${reason ? ` (${reason})` : ""}${txt ? `: ${txt}` : ""}`, 500);
}

export async function generateImage(
  settings: Settings,
  prompt: string,
  refs: ImageRef[],
  aspectRatio: "9:16" | "16:9" | "1:1",
  opts: { signal?: AbortSignal; onRetry?: (attempt: number, waitMs: number, err: Error) => void } = {},
): Promise<Blob> {
  const model = settings.imageModel;
  const parts: Part[] = [{ text: prompt }, ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.base64 } }))];
  const supportsImageConfig = !/2\.0-flash/.test(model);
  const imageConfig: Record<string, string> = { aspectRatio };
  if (/3-pro-image/.test(model)) imageConfig.imageSize = "2K";
  const mkBody = (withConfig: boolean) => ({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(withConfig ? { imageConfig } : {}),
    },
  });
  let useConfig = supportsImageConfig;
  return withRetry(
    async () => {
      try {
        return extractImage(await callGenerate(settings.geminiApiKey, model, mkBody(useConfig), opts.signal));
      } catch (e) {
        // Some model versions reject imageConfig – retry once without it.
        if (useConfig && e instanceof GeminiError && e.status === 400 && /imageConfig|image_config|aspect/i.test(e.message)) {
          useConfig = false;
          return extractImage(await callGenerate(settings.geminiApiKey, model, mkBody(false), opts.signal));
        }
        throw e;
      }
    },
    { maxRetries: settings.maxRetries, signal: opts.signal, onRetry: opts.onRetry },
  );
}

export function buildScenePrompt(imagePrompt: string, characters: Character[], hasRefs: boolean): string {
  const charBlock = characters.length
    ? `LOCKED CHARACTER DESIGNS (must match exactly in every scene):\n${characters
        .map((c) => `- ${c.name}: ${c.description}`)
        .join("\n")}\n`
    : "";
  const refLine = hasRefs
    ? "The attached reference images are the official character model sheets. Keep the exact same head shape, eyes, hair, outfit colors and proportions. Do not copy the layout of the reference sheet; draw a new single full-frame scene.\n"
    : "";
  return `${refLine}${charBlock}Generate ONE vertical 9:16 full-bleed cartoon frame for a comedy short.\nSCENE: ${imagePrompt}`;
}

export function buildCharacterSheetPrompt(characters: Character[]): string {
  return `Character model reference sheet for a 2D comedy cartoon. Plain light warm-grey background. Show each character standing full body in front view and 3/4 view, plus three exaggerated facial expressions (happy, shocked, deadpan) as head close-ups next to each one. Characters are evenly spaced and clearly separated.
CHARACTERS:
${characters.map((c) => `- ${c.name}: ${c.description}`).join("\n")}
${STYLE_LOCK}`;
}

/** Convert a blob into a reduced-size base64 reference (max side 1024px) to keep request payloads small. */
export async function blobToRef(blob: Blob, maxSide = 1024): Promise<ImageRef> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D không khả dụng");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  return { mimeType: "image/jpeg", base64: dataUrl.split(",")[1] };
}
