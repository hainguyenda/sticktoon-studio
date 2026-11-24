import { FPS, SCENE_COLORS, VIDEO_H, VIDEO_W, SHOT_LABELS, EFFECT_LABELS } from "./constants";
import { getVisual, type LoadedVisual } from "./media";
import type { AssetRef, CaptionSettings, Scene } from "./types";

/* ----------------------------- timeline helpers ----------------------------- */

export function sceneStarts(scenes: Scene[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    out.push(acc);
    acc += s.duration;
  }
  return out;
}

export function totalDuration(scenes: Scene[]): number {
  return Math.round(scenes.reduce((a, s) => a + s.duration, 0) * 1000) / 1000;
}

export function sceneIndexAt(scenes: Scene[], t: number): number {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    acc += scenes[i].duration;
    if (t < acc - 1e-6) return i;
  }
  return Math.max(0, scenes.length - 1);
}

/* ----------------------------- effect math ----------------------------- */

export interface FrameFx {
  scale: number;
  ox: number;
  oy: number;
  rot: number;
  fx: number;
  fy: number;
  grayscale: boolean;
  flash: number;
  vignette: number;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Deterministic pseudo-random in [-1, 1] per integer seed. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function computeFx(scene: Scene, localTime: number): FrameFx {
  const d = Math.max(0.1, scene.duration);
  const lf = Math.floor(localTime * FPS + 1e-6);
  const p = clamp01(localTime / d);
  const fx: FrameFx = { scale: 1, ox: 0, oy: 0, rot: 0, fx: 0.5, fy: 0.45, grayscale: false, flash: 0, vignette: 0 };
  switch (scene.cameraEffect) {
    case "static":
      break;
    case "punch_zoom_in": {
      // jump 1.0 → 1.28 within 3 frames (0, 1, 2), then a tiny creep for life
      const k = clamp01(lf / 2);
      fx.scale = 1 + 0.28 * easeOutCubic(k) + 0.025 * p;
      fx.fy = 0.42;
      if (lf >= 2 && lf <= 7) {
        const a = 16 * Math.exp(-(lf - 2) * 0.7);
        fx.ox = rnd(lf) * a;
        fx.oy = rnd(lf + 99) * a;
      }
      break;
    }
    case "slow_zoom": {
      const e = easeInOut(p);
      fx.scale = 1 + 0.12 * e;
      fx.ox = Math.sin(localTime * 0.6) * 18 * e;
      fx.oy = -12 * e;
      break;
    }
    case "dramatic_shake": {
      const amp = 75 * Math.exp(-2.4 * localTime) + 5;
      fx.scale = 1.12 + amp / 900;
      fx.ox = rnd(lf * 3 + 1) * amp;
      fx.oy = rnd(lf * 7 + 5) * amp;
      fx.rot = rnd(lf * 11 + 3) * amp * 0.0011;
      break;
    }
    case "freeze_grayscale": {
      fx.grayscale = true;
      fx.scale = 1.04 + 0.34 * easeOutCubic(p);
      fx.fy = 0.38;
      fx.vignette = 0.55;
      fx.flash = lf === 0 ? 0.65 : lf === 1 ? 0.3 : 0;
      break;
    }
    case "flash_cut": {
      fx.flash = lf <= 1 ? 1 : lf === 2 ? 0.55 : lf === 3 ? 0.2 : 0;
      fx.scale = 1.02;
      break;
    }
  }
  return fx;
}

/* ----------------------------- drawing ----------------------------- */

export interface RenderInput {
  scenes: Scene[];
  assets: Record<string, AssetRef>;
  captions: CaptionSettings;
}

export interface RenderInfo {
  sceneIndex: number;
  localTime: number;
  visual: LoadedVisual | null;
}

let canvasFilterSupported: boolean | null = null;
function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  if (canvasFilterSupported === null) {
    canvasFilterSupported = typeof ctx.filter === "string";
    if (canvasFilterSupported) {
      const prev = ctx.filter;
      ctx.filter = "grayscale(1)";
      canvasFilterSupported = ctx.filter === "grayscale(1)";
      ctx.filter = prev;
    }
  }
  return canvasFilterSupported;
}

function drawCover(ctx: CanvasRenderingContext2D, v: LoadedVisual) {
  const w = v.kind === "video" ? v.el.videoWidth || v.w : v.w;
  const h = v.kind === "video" ? v.el.videoHeight || v.h : v.h;
  if (!w || !h) return;
  const s = Math.max(VIDEO_W / w, VIDEO_H / h);
  const dw = w * s;
  const dh = h * s;
  ctx.drawImage(v.el, (VIDEO_W - dw) / 2, (VIDEO_H - dh) / 2, dw, dh);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, scene: Scene, index: number) {
  const col = SCENE_COLORS[index % SCENE_COLORS.length];
  ctx.fillStyle = "#1d2230";
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = col;
  for (let i = -4; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 160, 0);
    ctx.lineTo(i * 160 + 80, 0);
    ctx.lineTo(i * 160 + 80 + 600, VIDEO_H);
    ctx.lineTo(i * 160 + 600, VIDEO_H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // stickman silhouette
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#0b0d12";
  ctx.lineCap = "round";
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath();
  ctx.arc(540, 760, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0b0d12";
  ctx.beginPath();
  ctx.ellipse(490, 740, 34, 46, 0, 0, Math.PI * 2);
  ctx.ellipse(590, 740, 34, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(540, 910);
  ctx.lineTo(540, 1200);
  ctx.moveTo(540, 1000);
  ctx.lineTo(420, 1110);
  ctx.moveTo(540, 1000);
  ctx.lineTo(660, 1110);
  ctx.moveTo(540, 1200);
  ctx.lineTo(450, 1360);
  ctx.moveTo(540, 1200);
  ctx.lineTo(630, 1360);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = col;
  ctx.font = "900 150px system-ui, sans-serif";
  ctx.fillText(String(index + 1).padStart(2, "0"), 540, 330);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText(`${SHOT_LABELS[scene.shotType]} · ${EFFECT_LABELS[scene.cameraEffect]}`, 540, 460);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 36px system-ui, sans-serif";
  ctx.fillText("Chưa có hình – tạo AI hoặc kéo-thả ảnh/clip", 540, 1480);
  ctx.font = "400 30px system-ui, sans-serif";
  const lines = wrapLines(ctx, scene.imagePrompt.slice(0, 260), 880).slice(0, 5);
  lines.forEach((l, i) => ctx.fillText(l, 540, 1560 + i * 44));
}

function applyGrayscaleFallback(ctx: CanvasRenderingContext2D) {
  const img = ctx.getImageData(0, 0, VIDEO_W, VIDEO_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    y = (y - 128) * 1.2 + 128;
    const v = y < 0 ? 0 : y > 255 ? 255 : y;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

const fontReady = new Set<string>();
export async function ensureFont(font: string): Promise<void> {
  if (fontReady.has(font) || typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`80px "${font}"`, "AĂÂÊÔƠƯĐ ăâêôơưđ ẤẦẨẪẬ");
  } catch {
    /* system fallback font is acceptable */
  }
  fontReady.add(font);
}

export function captionChunkAt(scene: Scene, localTime: number, wordsPerChunk: number): { text: string; chunkStart: number } {
  const words = scene.narration.split(/\s+/).filter(Boolean);
  if (!words.length) return { text: "", chunkStart: 0 };
  const n = Math.max(1, wordsPerChunk);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += n) chunks.push(words.slice(i, i + n).join(" "));
  // weight chunk timing by character count for natural pacing
  const weights = chunks.map((c) => c.length + 4);
  const tot = weights.reduce((a, b) => a + b, 0);
  const p = clamp01(localTime / scene.duration) * tot;
  let acc = 0;
  for (let i = 0; i < chunks.length; i++) {
    const next = acc + weights[i];
    if (p < next || i === chunks.length - 1) return { text: chunks[i], chunkStart: (acc / tot) * scene.duration };
    acc = next;
  }
  return { text: chunks[chunks.length - 1], chunkStart: 0 };
}

function drawCaption(ctx: CanvasRenderingContext2D, scene: Scene, localTime: number, cap: CaptionSettings) {
  const { text, chunkStart } = captionChunkAt(scene, localTime, cap.wordsPerChunk);
  if (!text) return;
  const t = cap.uppercase ? text.toLocaleUpperCase() : text;
  const since = localTime - chunkStart;
  const pop = since < 0.1 ? 0.85 + (since / 0.1) * 0.15 : 1;
  ctx.save();
  ctx.font = `${cap.fontSize}px "${cap.font}", "Arial Black", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const lines = wrapLines(ctx, t, 900);
  const lh = cap.fontSize * 1.12;
  const baseY = cap.position === "top" ? 380 : cap.position === "middle" ? VIDEO_H / 2 : 1480;
  const y0 = baseY - ((lines.length - 1) * lh) / 2;
  ctx.translate(VIDEO_W / 2, baseY);
  ctx.scale(pop, pop);
  ctx.translate(-VIDEO_W / 2, -baseY);
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    if (cap.strokeWidth > 0) {
      ctx.lineWidth = cap.strokeWidth * 2;
      ctx.strokeStyle = "#000";
      ctx.strokeText(l, VIDEO_W / 2, y);
    }
    ctx.fillStyle = cap.color;
    ctx.fillText(l, VIDEO_W / 2, y);
  });
  ctx.restore();
}

/** Render one frame of the composition at time `t` (seconds). */
export function renderFrame(ctx: CanvasRenderingContext2D, input: RenderInput, t: number): RenderInfo {
  const { scenes } = input;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  if (!scenes.length) return { sceneIndex: -1, localTime: 0, visual: null };

  const idx = sceneIndexAt(scenes, t);
  const scene = scenes[idx];
  const start = sceneStarts(scenes)[idx];
  const lt = Math.max(0, Math.min(scene.duration, t - start));
  const fx = computeFx(scene, lt);
  const ref = input.assets[String(scene.id)];
  const visual = getVisual(ref);

  const useFilter = fx.grayscale && supportsFilter(ctx);
  ctx.save();
  if (useFilter) ctx.filter = "grayscale(1) contrast(1.2)";
  const px = fx.fx * VIDEO_W;
  const py = fx.fy * VIDEO_H;
  ctx.translate(px + fx.ox, py + fx.oy);
  ctx.rotate(fx.rot);
  ctx.scale(fx.scale, fx.scale);
  ctx.translate(-px, -py);
  if (visual) drawCover(ctx, visual);
  else drawPlaceholder(ctx, scene, idx);
  ctx.restore();
  ctx.filter = "none";
  if (fx.grayscale && !useFilter) applyGrayscaleFallback(ctx);

  if (fx.vignette > 0) {
    const g = ctx.createRadialGradient(VIDEO_W / 2, VIDEO_H * 0.42, VIDEO_W * 0.35, VIDEO_W / 2, VIDEO_H / 2, VIDEO_H * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${fx.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  }
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${fx.flash})`;
    ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  }
  if (input.captions.enabled) drawCaption(ctx, scene, lt, input.captions);
  return { sceneIndex: idx, localTime: lt, visual };
}
