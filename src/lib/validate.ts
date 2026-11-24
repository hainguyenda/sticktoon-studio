import { CAMERA_EFFECTS, SFX_TYPES, SHOT_TYPES } from "./types";
import type { Character, Language, Scene, ScriptData } from "./types";
import { STYLE_LOCK } from "./constants";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data: ScriptData | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Remove stage directions, parentheses, brackets and markdown from a voiceover text. */
export function cleanVoiceover(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_#`~]/g, "")
    .replace(/^\s*(scene|cảnh|canh)\s*\d+\s*[:.-]/gim, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Guarantee the mandatory style lock string is appended exactly once. */
export function withStyleLock(prompt: string): string {
  const p = prompt.trim().replace(/[.,;\s]+$/, "");
  if (p.toLowerCase().includes(STYLE_LOCK.toLowerCase())) return p;
  return p.length ? `${p}, ${STYLE_LOCK}` : STYLE_LOCK;
}

export function stripStyleLock(prompt: string): string {
  const suffix = `, ${STYLE_LOCK}`;
  if (prompt.endsWith(suffix)) return prompt.slice(0, -suffix.length);
  const idx = prompt.toLowerCase().indexOf(STYLE_LOCK.toLowerCase());
  if (idx < 0) return prompt;
  return prompt.slice(0, idx).replace(/[,\s]+$/, "");
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate an arbitrary value against the ScriptData contract.
 * Returns precise path-based error messages and a normalised copy when valid.
 */
export function validateScript(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["Gốc JSON phải là một object { ... }"], warnings, data: null };

  const str = (key: string, required: boolean): string => {
    const v = input[key];
    if (typeof v === "string") return v;
    if (v === undefined && !required) return "";
    errors.push(`"${key}" phải là chuỗi (string)`);
    return "";
  };

  const title = str("title", false);
  const topic = str("topic", false);
  const voiceoverScript = str("voiceoverScript", true);

  let language: Language = "vi";
  if (input.language !== undefined) {
    if (input.language === "vi" || input.language === "en") language = input.language;
    else errors.push(`"language" chỉ nhận "vi" hoặc "en"`);
  }

  let targetDuration = 45;
  if (input.targetDuration !== undefined) {
    if (typeof input.targetDuration === "number" && isFinite(input.targetDuration)) targetDuration = input.targetDuration;
    else errors.push(`"targetDuration" phải là số`);
  }

  const characters: Character[] = [];
  if (!Array.isArray(input.characters)) errors.push(`"characters" phải là mảng`);
  else
    input.characters.forEach((c, i) => {
      if (!isObj(c)) return errors.push(`characters[${i}] phải là object`);
      if (typeof c.name !== "string" || !c.name.trim()) errors.push(`characters[${i}].name phải là chuỗi không rỗng`);
      if (typeof c.description !== "string" || !c.description.trim())
        errors.push(`characters[${i}].description phải là chuỗi không rỗng`);
      characters.push({ name: String(c.name ?? ""), description: String(c.description ?? "") });
    });

  const scenes: Scene[] = [];
  if (!Array.isArray(input.scenes)) errors.push(`"scenes" phải là mảng`);
  else {
    if (input.scenes.length === 0) errors.push(`"scenes" phải có ít nhất 1 cảnh`);
    const seen = new Set<number>();
    input.scenes.forEach((s, i) => {
      const p = `scenes[${i}]`;
      if (!isObj(s)) return errors.push(`${p} phải là object`);
      let id = s.id;
      if (typeof id === "string" && /^\d+$/.test(id)) id = Number(id);
      if (typeof id !== "number" || !Number.isInteger(id)) {
        errors.push(`${p}.id phải là số nguyên`);
        id = i + 1;
      }
      if (seen.has(id as number)) errors.push(`${p}.id = ${id} bị trùng`);
      seen.add(id as number);
      if (typeof s.duration !== "number" || !(s.duration > 0)) errors.push(`${p}.duration phải là số > 0 (giây)`);
      if (typeof s.narration !== "string") errors.push(`${p}.narration phải là chuỗi`);
      if (!SHOT_TYPES.includes(s.shotType as never))
        errors.push(`${p}.shotType "${String(s.shotType)}" không hợp lệ (${SHOT_TYPES.join(" | ")})`);
      if (!CAMERA_EFFECTS.includes(s.cameraEffect as never))
        errors.push(`${p}.cameraEffect "${String(s.cameraEffect)}" không hợp lệ (${CAMERA_EFFECTS.join(" | ")})`);
      if (!SFX_TYPES.includes(s.sfx as never))
        errors.push(`${p}.sfx "${String(s.sfx)}" không hợp lệ (${SFX_TYPES.join(" | ")})`);
      if (typeof s.imagePrompt !== "string" || !s.imagePrompt.trim()) errors.push(`${p}.imagePrompt phải là chuỗi không rỗng`);
      else if (!s.imagePrompt.toLowerCase().includes(STYLE_LOCK.toLowerCase()))
        warnings.push(`${p}.imagePrompt thiếu chuỗi khóa phong cách → sẽ tự nối khi áp dụng`);
      scenes.push({
        id: id as number,
        duration: Math.round(Number(s.duration) * 10) / 10,
        narration: String(s.narration ?? ""),
        shotType: s.shotType as Scene["shotType"],
        cameraEffect: s.cameraEffect as Scene["cameraEffect"],
        sfx: s.sfx as Scene["sfx"],
        imagePrompt: withStyleLock(String(s.imagePrompt ?? "")),
      });
    });
    if (input.scenes.length > 0 && (input.scenes.length < 8 || input.scenes.length > 15))
      warnings.push(`Khuyến nghị 8–15 cảnh (hiện có ${input.scenes.length})`);
  }

  if (/[()[\]]/.test(voiceoverScript)) warnings.push(`voiceoverScript chứa ngoặc → sẽ tự làm sạch khi áp dụng`);

  if (errors.length) return { ok: false, errors, warnings, data: null };
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  if (total < 25 || total > 65) warnings.push(`Tổng thời lượng ${total.toFixed(1)}s nằm ngoài khoảng 30–60s`);

  return {
    ok: true,
    errors,
    warnings,
    data: {
      title: title || "Untitled",
      topic,
      language,
      targetDuration,
      voiceoverScript: cleanVoiceover(voiceoverScript),
      characters,
      scenes,
    },
  };
}

/** Scale scene durations so they sum to `total`, keeping 0.1s precision. */
export function normaliseDurations(durations: number[], total: number, min = 0.3): number[] {
  const sum = durations.reduce((a, b) => a + b, 0) || 1;
  const scaled = durations.map((d) => Math.max(min, Math.round(((d / sum) * total) * 10) / 10));
  const diff = Math.round((total - scaled.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (scaled.length) {
    let idx = scaled.length - 1;
    // put rounding remainder into the longest scene to avoid violating the min.
    let maxD = -1;
    scaled.forEach((d, i) => {
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    });
    scaled[idx] = Math.max(min, Math.round((scaled[idx] + diff) * 10) / 10);
  }
  return scaled;
}
