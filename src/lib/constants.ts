import type { CameraEffect, CaptionSettings, Settings, ShotType, SfxType } from "./types";

export const STYLE_LOCK =
  "2D flat cartoon animation style, thick bold black ink outlines, minimalist stickman-hybrid characters with large expressive cartoon eyes, muted flat color background, clean framing, 2K resolution, no text, no speech bubbles, no captions, no watermark";

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
export const FPS = 30;

export const VOICE_TOOL_URL = "https://giong-doc.vercel.app/";

export const TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3-pro-preview",
  "gemini-flash-latest",
];

export const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: "",
  textModel: "gemini-2.5-flash",
  imageModel: "gemini-2.5-flash-image",
  ttsBridgeUrl: "",
  ttsBridgeToken: "",
  voiceVolume: 1,
  sfxVolume: 0.8,
  batchDelayMs: 2500,
  maxRetries: 5,
  localVoiceVi: "hoang_nam",
  localVoiceEn: "am_onyx",
  localTtsSpeed: 1,
  localTtsPause: 0.3,
  localTtsSteps: 16,
};

export const DEFAULT_CAPTIONS: CaptionSettings = {
  enabled: false,
  font: "Bangers",
  fontSize: 92,
  strokeWidth: 14,
  color: "#ffffff",
  position: "bottom",
  uppercase: true,
  wordsPerChunk: 3,
};

export const CAPTION_FONTS = [
  { id: "Bangers", label: "Bangers (comic)" },
  { id: "Anton", label: "Anton (bold)" },
  { id: "Baloo 2", label: "Baloo 2 (tròn)" },
  { id: "Be Vietnam Pro", label: "Be Vietnam Pro" },
  { id: "Arial Black", label: "Arial Black (hệ thống)" },
];

export const SHOT_LABELS: Record<ShotType, string> = {
  wide: "Wide",
  medium: "Medium",
  close_up: "Close-up",
  extreme_close_up: "Extreme CU",
};

export const EFFECT_LABELS: Record<CameraEffect, string> = {
  static: "Static",
  punch_zoom_in: "Punch Zoom",
  slow_zoom: "Slow Zoom",
  dramatic_shake: "Dramatic Shake",
  freeze_grayscale: "Freeze B&W",
  flash_cut: "Flash Cut",
};

export const SFX_LABELS: Record<SfxType, string> = {
  none: "Không",
  vine_boom: "Vine Boom",
  record_scratch: "Record Scratch",
  whoosh: "Whoosh",
  pop: "Pop",
  ding: "Ding",
  cricket: "Cricket",
};

export const SCENE_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#84cc16",
  "#ec4899",
];

export const MIN_SCENE_DURATION = 0.3;
