import { getBlob } from "./storage";
import type { AssetRef } from "./types";

/**
 * Runtime cache of decoded media for the render engine. Keyed by asset key (IndexedDB blob key).
 */

export type LoadedVisual =
  | { kind: "image"; el: HTMLImageElement; w: number; h: number }
  | { kind: "video"; el: HTMLVideoElement; w: number; h: number };

const urlCache = new Map<string, string>();
const urlPending = new Map<string, Promise<string | null>>();
const visualCache = new Map<string, LoadedVisual>();
const visualPending = new Map<string, Promise<LoadedVisual | null>>();
const audioCache = new Map<string, AudioBuffer>();
const audioPending = new Map<string, Promise<AudioBuffer | null>>();
const listeners = new Set<() => void>();

export function onMediaLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const emit = () => listeners.forEach((l) => l());

export function getObjectUrl(key: string): Promise<string | null> {
  const hit = urlCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pend = urlPending.get(key);
  if (pend) return pend;
  const p = getBlob(key).then((b) => {
    urlPending.delete(key);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    urlCache.set(key, u);
    return u;
  });
  urlPending.set(key, p);
  return p;
}

export function getCachedUrl(key: string): string | undefined {
  return urlCache.get(key);
}

/** Register a freshly created blob so it renders without waiting for an IndexedDB roundtrip. */
export function primeBlob(key: string, blob: Blob): string {
  const old = urlCache.get(key);
  if (old) URL.revokeObjectURL(old);
  const u = URL.createObjectURL(blob);
  urlCache.set(key, u);
  return u;
}

export function getVisual(ref: AssetRef | undefined | null): LoadedVisual | null {
  if (!ref) return null;
  const hit = visualCache.get(ref.key);
  if (hit) return hit;
  if (!visualPending.has(ref.key)) loadVisual(ref);
  return null;
}

export function loadVisual(ref: AssetRef): Promise<LoadedVisual | null> {
  const hit = visualCache.get(ref.key);
  if (hit) return Promise.resolve(hit);
  const pend = visualPending.get(ref.key);
  if (pend) return pend;
  const p = (async (): Promise<LoadedVisual | null> => {
    const url = await getObjectUrl(ref.key);
    if (!url) return null;
    if (ref.kind === "video") {
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.loop = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.src = url;
      await new Promise<void>((resolve, reject) => {
        el.onloadeddata = () => resolve();
        el.onerror = () => reject(new Error(`Không đọc được video ${ref.name}`));
      });
      return { kind: "video", el, w: el.videoWidth, h: el.videoHeight };
    }
    const el = new Image();
    el.decoding = "async";
    el.src = url;
    await el.decode();
    return { kind: "image", el, w: el.naturalWidth, h: el.naturalHeight };
  })()
    .then((v) => {
      visualPending.delete(ref.key);
      if (v) {
        visualCache.set(ref.key, v);
        emit();
      }
      return v;
    })
    .catch((e) => {
      visualPending.delete(ref.key);
      console.error(e);
      return null;
    });
  visualPending.set(ref.key, p);
  return p;
}

export async function loadAudioBuffer(key: string, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const hit = audioCache.get(key);
  if (hit) return hit;
  const pend = audioPending.get(key);
  if (pend) return pend;
  const p = (async () => {
    const blob = await getBlob(key);
    if (!blob) return null;
    const ab = await blob.arrayBuffer();
    return await ctx.decodeAudioData(ab);
  })()
    .then((b) => {
      audioPending.delete(key);
      if (b) {
        audioCache.set(key, b);
        emit();
      }
      return b;
    })
    .catch((e) => {
      audioPending.delete(key);
      console.error(e);
      return null;
    });
  audioPending.set(key, p);
  return p;
}

export function getCachedAudio(key: string): AudioBuffer | undefined {
  return audioCache.get(key);
}

export function evictMedia(key: string): void {
  const u = urlCache.get(key);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(key);
  const v = visualCache.get(key);
  if (v?.kind === "video") {
    v.el.pause();
    v.el.removeAttribute("src");
    v.el.load();
  }
  visualCache.delete(key);
  audioCache.delete(key);
}

export function allLoadedVideos(): HTMLVideoElement[] {
  const out: HTMLVideoElement[] = [];
  visualCache.forEach((v) => v.kind === "video" && out.push(v.el));
  return out;
}

export function fileKind(file: { type: string; name: string }): "image" | "video" | "audio" | null {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(n)) return "image";
  if (t.startsWith("video/") || /\.(mp4|webm|mov)$/.test(n)) return "video";
  if (t.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/.test(n)) return "audio";
  return null;
}
