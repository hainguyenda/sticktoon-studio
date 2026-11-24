export const SHOT_TYPES = ["wide", "medium", "close_up", "extreme_close_up"] as const;
export const CAMERA_EFFECTS = [
  "static",
  "punch_zoom_in",
  "slow_zoom",
  "dramatic_shake",
  "freeze_grayscale",
  "flash_cut",
] as const;
export const SFX_TYPES = [
  "none",
  "vine_boom",
  "record_scratch",
  "whoosh",
  "pop",
  "ding",
  "cricket",
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];
export type CameraEffect = (typeof CAMERA_EFFECTS)[number];
export type SfxType = (typeof SFX_TYPES)[number];
export type RealSfx = Exclude<SfxType, "none">;
export type Language = "vi" | "en";

export interface Character {
  name: string;
  description: string;
}

export interface Scene {
  id: number;
  duration: number;
  narration: string;
  shotType: ShotType;
  cameraEffect: CameraEffect;
  sfx: SfxType;
  imagePrompt: string;
}

/** The strict JSON contract produced by the Director (Gemini) and editable in Tab 1. */
export interface ScriptData {
  title: string;
  topic: string;
  language: Language;
  targetDuration: number;
  voiceoverScript: string;
  characters: Character[];
  scenes: Scene[];
}

export type AssetKind = "image" | "video" | "audio";

export interface AssetRef {
  key: string;
  kind: AssetKind;
  mime: string;
  name: string;
}

export type CaptionPosition = "top" | "middle" | "bottom";

export interface CaptionSettings {
  enabled: boolean;
  font: string;
  fontSize: number;
  strokeWidth: number;
  color: string;
  position: CaptionPosition;
  uppercase: boolean;
  wordsPerChunk: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  script: ScriptData;
  sceneAssets: Record<string, AssetRef>;
  characterRefs: AssetRef[];
  voiceover: AssetRef | null;
  customSfx: Partial<Record<RealSfx, AssetRef>>;
  captions: CaptionSettings;
}

export interface Settings {
  geminiApiKey: string;
  textModel: string;
  imageModel: string;
  ttsBridgeUrl: string;
  ttsBridgeToken: string;
  voiceVolume: number;
  sfxVolume: number;
  batchDelayMs: number;
  maxRetries: number;
  localVoiceVi: string;
  localVoiceEn: string;
  localTtsSpeed: number;
  localTtsPause: number;
  localTtsSteps: number;
}

export type TabId = "script" | "visual" | "audio" | "export";
