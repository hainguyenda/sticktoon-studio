"use client";

import { FPS, VIDEO_H, VIDEO_W } from "./constants";
import { ensureFont, renderFrame, sceneIndexAt, sceneStarts, totalDuration, type RenderInput } from "./engine";
import { allLoadedVideos, getVisual, loadAudioBuffer, loadVisual, onMediaLoaded } from "./media";
import { renderSfx } from "./sfx";
import type { RealSfx } from "./types";
import { useStudio } from "@/store/studio";
import { usePlayback } from "@/store/playback";

/**
 * Real-time composition player: draws frames on a 1080x1920 canvas, keeps
 * video layers in sync and mixes voiceover + SFX with sample-accurate
 * scheduling on an AudioContext. The same pipeline drives the video export.
 */
class StudioPlayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private audioCtx: AudioContext | null = null;
  private master: GainNode | null = null;
  private monitor: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private playing = false;
  private startCtxTime = 0;
  private startOffset = 0;
  private time = 0;
  private raf = 0;
  private renderQueued = false;
  private onEnded: (() => void) | null = null;
  private playToken = 0;
  private lastStoreUpdate = 0;

  constructor() {
    if (typeof window !== "undefined") {
      onMediaLoaded(() => this.requestRender());
      useStudio.subscribe((s, prev) => {
        if (s.project !== prev.project) this.requestRender();
        if (s.settings !== prev.settings) this.applyVolumes();
      });
    }
  }

  attachCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.ctx2d = c ? c.getContext("2d", { alpha: false }) : null;
    if (c) {
      c.width = VIDEO_W;
      c.height = VIDEO_H;
      this.requestRender();
    }
  }

  getCanvas() {
    return this.canvas;
  }

  private input(): RenderInput {
    const p = useStudio.getState().project;
    return { scenes: p.script.scenes, assets: p.sceneAssets, captions: p.captions };
  }

  duration(): number {
    return totalDuration(useStudio.getState().project.script.scenes);
  }

  isPlaying() {
    return this.playing;
  }

  currentTime() {
    return this.time;
  }

  /* -------------------------------- audio -------------------------------- */

  ensureAudio(): AudioContext {
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: "interactive" });
      this.audioCtx = ctx;
      this.master = ctx.createGain();
      this.monitor = ctx.createGain();
      this.voiceGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      // master bus limiter keeps voice + SFX peaks from clipping in preview and export
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 4;
      limiter.ratio.value = 14;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;
      this.voiceGain.connect(limiter);
      this.sfxGain.connect(limiter);
      limiter.connect(this.master);
      this.master.connect(this.monitor).connect(ctx.destination);
      this.applyVolumes();
    }
    return this.audioCtx;
  }

  private applyVolumes() {
    const s = useStudio.getState().settings;
    if (this.voiceGain) this.voiceGain.gain.value = s.voiceVolume;
    if (this.sfxGain) this.sfxGain.gain.value = s.sfxVolume;
  }

  async getSfxBuffer(type: RealSfx): Promise<AudioBuffer> {
    const ctx = this.ensureAudio();
    const custom = useStudio.getState().project.customSfx[type];
    if (custom) {
      const b = await loadAudioBuffer(custom.key, ctx);
      if (b) return b;
    }
    return renderSfx(type, ctx.sampleRate);
  }

  /** Audition a single SFX immediately. */
  async previewSfx(type: RealSfx) {
    const ctx = this.ensureAudio();
    await ctx.resume();
    const buf = await this.getSfxBuffer(type);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain!);
    src.start();
  }

  private stopSources() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.sources = [];
  }

  private async scheduleAudio(from: number, total: number): Promise<number> {
    const ctx = this.ensureAudio();
    const project = useStudio.getState().project;
    const voice = project.voiceover ? await loadAudioBuffer(project.voiceover.key, ctx) : null;
    const scenes = project.script.scenes;
    const starts = sceneStarts(scenes);
    const sfxBufs = new Map<RealSfx, AudioBuffer>();
    for (const s of scenes) {
      if (s.sfx !== "none" && !sfxBufs.has(s.sfx)) sfxBufs.set(s.sfx, await this.getSfxBuffer(s.sfx));
    }
    const when = ctx.currentTime + 0.08;
    const endAt = when + (total - from);
    if (voice && from < voice.duration) {
      const src = ctx.createBufferSource();
      src.buffer = voice;
      src.connect(this.voiceGain!);
      src.start(when, from);
      src.stop(endAt);
      this.sources.push(src);
    }
    scenes.forEach((s, i) => {
      if (s.sfx === "none") return;
      const buf = sfxBufs.get(s.sfx);
      if (!buf) return;
      const at = starts[i];
      const offset = from - at;
      if (offset >= buf.duration || at >= total) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain!);
      if (offset > 0) src.start(when, offset);
      else src.start(when - offset);
      src.stop(endAt);
      this.sources.push(src);
    });
    return when;
  }

  /* -------------------------------- transport -------------------------------- */

  async play(from?: number, opts: { onEnded?: () => void } = {}) {
    const total = this.duration();
    if (total <= 0) return;
    const ctx = this.ensureAudio();
    await ctx.resume();
    this.stopSources();
    let start = from ?? this.time;
    if (start >= total - 0.05) start = 0;
    const token = ++this.playToken;
    const when = await this.scheduleAudio(start, total);
    if (token !== this.playToken) return; // superseded by pause/seek
    this.startCtxTime = when;
    this.startOffset = start;
    this.time = start;
    this.playing = true;
    this.onEnded = opts.onEnded ?? null;
    usePlayback.getState().set({ playing: true });
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.playToken++;
    if (!this.playing) return;
    this.time = this.clockTime();
    this.playing = false;
    this.stopSources();
    cancelAnimationFrame(this.raf);
    allLoadedVideos().forEach((v) => v.pause());
    usePlayback.getState().set({ playing: false, time: this.time });
    this.requestRender();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(t: number) {
    const total = this.duration();
    const clamped = Math.max(0, Math.min(total, t));
    if (this.playing) {
      void this.play(clamped, { onEnded: this.onEnded ?? undefined });
      return;
    }
    this.time = clamped;
    usePlayback.getState().set({ time: clamped });
    this.requestRender();
  }

  private clockTime(): number {
    if (!this.audioCtx || !this.playing) return this.time;
    return this.startOffset + Math.max(0, this.audioCtx.currentTime - this.startCtxTime);
  }

  private tick = () => {
    if (!this.playing) return;
    const total = this.duration();
    const t = this.clockTime();
    if (t >= total) {
      this.time = total;
      this.drawAt(total - 1 / FPS / 2);
      this.playing = false;
      this.stopSources();
      allLoadedVideos().forEach((v) => v.pause());
      usePlayback.getState().set({ playing: false, time: total });
      const cb = this.onEnded;
      this.onEnded = null;
      cb?.();
      return;
    }
    this.time = t;
    this.drawAt(t);
    const now = performance.now();
    if (now - this.lastStoreUpdate > 33) {
      this.lastStoreUpdate = now;
      usePlayback.getState().set({ time: t });
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  requestRender() {
    if (this.playing || this.renderQueued || typeof window === "undefined") return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.playing) this.drawAt(this.time);
    });
  }

  /** Keep the active scene's video layer in sync with the timeline. */
  private syncVideo(t: number) {
    const input = this.input();
    const scenes = input.scenes;
    if (!scenes.length) return;
    const idx = sceneIndexAt(scenes, t);
    const scene = scenes[idx];
    const ref = input.assets[String(scene.id)];
    const visual = getVisual(ref);
    const active = visual?.kind === "video" ? visual.el : null;
    allLoadedVideos().forEach((v) => {
      if (v !== active && !v.paused) v.pause();
    });
    if (!active) return;
    const lt = t - sceneStarts(scenes)[idx];
    const vd = active.duration && isFinite(active.duration) ? active.duration : scene.duration;
    const freeze = scene.cameraEffect === "freeze_grayscale";
    const desired = freeze ? 0 : lt % Math.max(0.05, vd);
    if (this.playing && !freeze) {
      if (Math.abs(active.currentTime - desired) > 0.25) active.currentTime = desired;
      if (active.paused) void active.play().catch(() => undefined);
    } else {
      if (!active.paused) active.pause();
      if (Math.abs(active.currentTime - desired) > 0.04) {
        active.currentTime = desired;
        active.addEventListener("seeked", () => this.requestRender(), { once: true });
      }
    }
  }

  private drawAt(t: number) {
    if (!this.ctx2d) return;
    this.syncVideo(t);
    renderFrame(this.ctx2d, this.input(), Math.max(0, t));
  }

  /* -------------------------------- export -------------------------------- */

  static pickMimeType(): string {
    const candidates = [
      "video/mp4;codecs=avc1.640028,mp4a.40.2",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1,mp4a",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    if (typeof MediaRecorder === "undefined") return "";
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  }

  async exportVideo(opts: {
    onProgress: (p: number) => void;
    signal: AbortSignal;
    monitorAudio: boolean;
    videoBitrate: number;
  }): Promise<{ blob: Blob; mime: string }> {
    const canvas = this.canvas;
    if (!canvas) throw new Error("Canvas preview chưa sẵn sàng.");
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function")
      throw new Error("Trình duyệt không hỗ trợ MediaRecorder/captureStream. Hãy dùng Chrome, Edge hoặc Firefox mới.");
    const total = this.duration();
    if (total <= 0) throw new Error("Project chưa có cảnh nào.");

    this.pause();
    const ctx = this.ensureAudio();
    await ctx.resume();

    // preload every visual & font so no placeholder frames leak into the render
    const project = useStudio.getState().project;
    await Promise.all(Object.values(project.sceneAssets).map((r) => loadVisual(r)));
    if (project.captions.enabled) await ensureFont(project.captions.font);
    if (project.voiceover) await loadAudioBuffer(project.voiceover.key, ctx);

    if (!this.recordDest) {
      this.recordDest = ctx.createMediaStreamDestination();
      this.master!.connect(this.recordDest);
    }
    this.monitor!.gain.value = opts.monitorAudio ? 1 : 0;

    const mime = StudioPlayer.pickMimeType();
    const vStream = canvas.captureStream(FPS);
    const stream = new MediaStream([...vStream.getVideoTracks(), ...this.recordDest.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: opts.videoBitrate,
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    usePlayback.getState().set({ exporting: true, exportProgress: 0 });
    // draw first frame before recording starts so the file doesn't begin black
    this.time = 0;
    this.drawAt(0);

    const cleanup = () => {
      clearInterval(progressTimer);
      vStream.getTracks().forEach((t) => t.stop());
      this.monitor!.gain.value = 1;
      usePlayback.getState().set({ exporting: false });
    };
    let progressTimer: ReturnType<typeof setInterval> | undefined = undefined;

    try {
      const done = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: (mime || recorder.mimeType || "video/webm").split(";")[0] }));
        recorder.onerror = (ev) => reject(new Error(`MediaRecorder lỗi: ${String((ev as unknown as { error?: Error }).error ?? "")}`));
        opts.signal.addEventListener(
          "abort",
          () => {
            this.pause();
            if (recorder.state !== "inactive") recorder.stop();
            reject(new DOMException("Đã hủy xuất video", "AbortError"));
          },
          { once: true },
        );
      });

      recorder.start(250);
      await new Promise((r) => setTimeout(r, 120));
      await this.play(0, {
        onEnded: () => {
          // give the encoder a couple of frames to flush the last image
          setTimeout(() => {
            if (recorder.state !== "inactive") recorder.stop();
          }, 200);
        },
      });
      progressTimer = setInterval(() => {
        const p = Math.min(1, this.clockTime() / total);
        opts.onProgress(p);
        usePlayback.getState().set({ exportProgress: p });
      }, 100);
      const blob = await done;
      opts.onProgress(1);
      return { blob, mime: blob.type };
    } finally {
      cleanup();
    }
  }
}

let instance: StudioPlayer | null = null;
export function getPlayer(): StudioPlayer {
  if (!instance) instance = new StudioPlayer();
  return instance;
}
export function pickRecorderMime(): string {
  return typeof window === "undefined" ? "" : StudioPlayer.pickMimeType();
}
