"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wand2, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from "lucide-react";
import { useStudio } from "@/store/studio";
import { usePlayback } from "@/store/playback";
import { getPlayer } from "@/lib/player";
import { getCachedAudio, loadAudioBuffer, onMediaLoaded } from "@/lib/media";
import { computePeaks } from "@/lib/wav";
import { sceneStarts, totalDuration } from "@/lib/engine";
import { EFFECT_LABELS, MIN_SCENE_DURATION, SCENE_COLORS, SFX_LABELS } from "@/lib/constants";
import { autoSyncDurations, findSilences } from "@/lib/sync";
import { cx, fmtTime } from "./ui";

const RULER_H = 22;
const SCENE_H = 46;
const WAVE_H = 70;
const PAD = 12;

export function useVoiceBuffer(): AudioBuffer | null {
  const voice = useStudio((s) => s.project.voiceover);
  const [buf, setBuf] = useState<AudioBuffer | null>(() => (voice ? getCachedAudio(voice.key) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!voice) {
      setBuf(null);
      return;
    }
    const cached = getCachedAudio(voice.key);
    if (cached) {
      setBuf(cached);
      return;
    }
    setBuf(null);
    void loadAudioBuffer(voice.key, getPlayer().ensureAudio()).then((b) => alive && setBuf(b));
    const off = onMediaLoaded(() => {
      const b = getCachedAudio(voice.key);
      if (b && alive) setBuf(b);
    });
    return () => {
      alive = false;
      off();
    };
  }, [voice]);
  return buf;
}

export function runAutoSync(buf: AudioBuffer, snapToSilence: boolean): number[] {
  const st = useStudio.getState();
  const scenes = st.project.script.scenes;
  const durs = autoSyncDurations(scenes, buf.duration, snapToSilence ? findSilences(buf) : []);
  st.setDurations(durs);
  st.toast("success", `Đã Auto-Sync ${scenes.length} cảnh khớp ${buf.duration.toFixed(1)}s audio.`);
  return durs;
}

export default function Timeline() {
  const scenes = useStudio((s) => s.project.script.scenes);
  const setDurations = useStudio((s) => s.setDurations);
  const selectedId = useStudio((s) => s.selectedSceneId);
  const selectScene = useStudio((s) => s.selectScene);
  const time = usePlayback((s) => s.time);
  const playing = usePlayback((s) => s.playing);
  const exporting = usePlayback((s) => s.exporting);
  const buf = useVoiceBuffer();

  const scrollRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scenesTotal = totalDuration(scenes);
  const audioDur = buf?.duration ?? 0;
  const timelineLen = Math.max(1, scenesTotal, audioDur);
  const pps = (Math.max(200, width - PAD * 2) / timelineLen) * zoom;
  const innerW = timelineLen * pps + PAD * 2;
  const starts = useMemo(() => sceneStarts(scenes), [scenes]);
  const peaks = useMemo(() => (buf ? computePeaks(buf, 200) : null), [buf]);

  // draw waveform
  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.min(30000, Math.ceil(timelineLen * pps));
    c.width = Math.max(1, Math.floor(w * dpr));
    c.height = WAVE_H * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${WAVE_H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, WAVE_H);
    const mid = WAVE_H / 2;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, mid - 0.5, w, 1);
    if (!peaks || !buf) return;
    const bps = peaks.length / 2 / buf.duration;
    const audioW = buf.duration * pps;
    for (let x = 0; x < Math.min(w, audioW); x++) {
      const b0 = Math.floor((x / pps) * bps);
      const b1 = Math.max(b0 + 1, Math.floor(((x + 1) / pps) * bps));
      let mn = 0;
      let mx = 0;
      for (let b = b0; b < b1 && b * 2 + 1 < peaks.length; b++) {
        if (peaks[b * 2] < mn) mn = peaks[b * 2];
        if (peaks[b * 2 + 1] > mx) mx = peaks[b * 2 + 1];
      }
      const beyond = x / pps > scenesTotal;
      ctx.fillStyle = beyond ? "rgba(239,68,68,0.55)" : "rgba(245,179,1,0.85)";
      const top = mid - mx * mid * 0.95;
      const bot = mid - mn * mid * 0.95;
      ctx.fillRect(x, top, 1, Math.max(1, bot - top));
    }
  }, [peaks, buf, pps, timelineLen, scenesTotal]);

  // auto-scroll during playback
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !(playing || exporting) || zoom <= 1) return;
    const x = PAD + time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, x - 80);
  }, [time, playing, exporting, pps, zoom]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return (clientX - rect.left + el.scrollLeft - PAD) / pps;
    },
    [pps],
  );

  const onSeekPointer = (e: React.PointerEvent) => {
    if (exporting) return;
    const t = Math.max(0, Math.min(scenesTotal, timeFromClientX(e.clientX)));
    getPlayer().seek(t);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => getPlayer().seek(Math.max(0, Math.min(scenesTotal, timeFromClientX(ev.clientX))));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (exporting) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const base = useStudio.getState().project.script.scenes.map((s) => s.duration);
    const st = sceneStarts(useStudio.getState().project.script.scenes);
    const isLast = index === base.length - 1;
    const move = (ev: PointerEvent) => {
      let t = Math.round(timeFromClientX(ev.clientX) * 10) / 10;
      const prevStart = st[index];
      const durs = [...base];
      if (isLast) {
        t = Math.max(prevStart + MIN_SCENE_DURATION, t);
        durs[index] = t - prevStart;
      } else {
        const nextEnd = st[index + 1] + base[index + 1];
        t = Math.min(nextEnd - MIN_SCENE_DURATION, Math.max(prevStart + MIN_SCENE_DURATION, t));
        durs[index] = t - prevStart;
        durs[index + 1] = nextEnd - t;
      }
      setDrag({ index, t });
      setDurations(durs.map((d) => Math.round(d * 10) / 10));
    };
    const up = () => {
      setDrag(null);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      getPlayer().requestRender();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // ruler ticks
  const tickStep = pps > 120 ? 0.5 : pps > 40 ? 1 : pps > 15 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= timelineLen + 1e-6; t += tickStep) ticks.push(Math.round(t * 10) / 10);

  const mismatch = buf && Math.abs(audioDur - scenesTotal) > 0.25;

  return (
    <div className="shrink-0 border-t border-ink-700 bg-ink-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-3 py-1.5 text-xs">
        <span className="font-semibold tracking-wide text-gray-300">TIMELINE</span>
        <span className="font-mono text-gray-500">
          Cảnh: {scenesTotal.toFixed(1)}s{buf ? ` · Audio: ${audioDur.toFixed(1)}s` : " · chưa có audio"}
        </span>
        {mismatch && (
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Lệch {(audioDur - scenesTotal).toFixed(1)}s
          </span>
        )}
        {drag && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-accent">
            Ranh giới cảnh {drag.index + 1}: {drag.t.toFixed(1)}s
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            disabled={!buf || !scenes.length || exporting}
            onClick={() => buf && runAutoSync(buf, true)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-accent/15 px-2 font-medium text-accent hover:bg-accent/25 disabled:opacity-40"
            title="Chia thời lượng cảnh theo số từ narration, bắt vào khoảng lặng của giọng đọc"
          >
            <Wand2 className="h-3.5 w-3.5" /> Auto-Sync
          </button>
          <button onClick={() => setZoom((z) => Math.max(1, z / 1.5))} className="rounded p-1.5 text-gray-400 hover:bg-ink-700" title="Thu nhỏ">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <input type="range" min={1} max={12} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20" />
          <button onClick={() => setZoom((z) => Math.min(12, z * 1.5))} className="rounded p-1.5 text-gray-400 hover:bg-ink-700" title="Phóng to">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom(1)} className="rounded p-1.5 text-gray-400 hover:bg-ink-700" title="Vừa khung">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="relative overflow-x-auto overflow-y-hidden select-none" style={{ height: RULER_H + SCENE_H + WAVE_H + 14 }}>
        <div className="relative" style={{ width: innerW, height: "100%" }}>
          {/* ruler */}
          <div className="absolute top-0 cursor-pointer border-b border-ink-700" style={{ left: 0, width: innerW, height: RULER_H }} onPointerDown={onSeekPointer}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full" style={{ left: PAD + t * pps }}>
                <div className={cx("w-px bg-ink-500", Number.isInteger(t / (tickStep * 2)) ? "h-2.5" : "h-1.5")} />
                {Number.isInteger(t / (tickStep * 2)) && <span className="absolute top-2 left-1 font-mono text-[10px] text-gray-500">{fmtTime(t, false)}</span>}
              </div>
            ))}
          </div>
          {/* scenes */}
          <div className="absolute" style={{ top: RULER_H + 4, left: PAD, height: SCENE_H, width: scenesTotal * pps }}>
            {scenes.map((s, i) => {
              const col = SCENE_COLORS[i % SCENE_COLORS.length];
              const w = s.duration * pps;
              return (
                <div
                  key={s.id}
                  onPointerDown={(e) => {
                    selectScene(s.id);
                    onSeekPointer(e);
                  }}
                  className={cx(
                    "absolute top-0 h-full cursor-pointer overflow-hidden rounded-md border px-1.5 py-1 text-[10px] leading-tight",
                    selectedId === s.id ? "ring-2 ring-white/70" : "",
                  )}
                  style={{ left: starts[i] * pps + 1, width: Math.max(2, w - 2), background: `${col}33`, borderColor: `${col}aa` }}
                  title={`${i + 1}. ${s.narration}`}
                >
                  <div className="flex items-center gap-1 font-bold whitespace-nowrap" style={{ color: col }}>
                    {i + 1}
                    {w > 70 && <span className="font-normal text-gray-300">{EFFECT_LABELS[s.cameraEffect]}</span>}
                  </div>
                  {w > 50 && <div className="font-mono whitespace-nowrap text-gray-400">{s.duration.toFixed(1)}s</div>}
                  {s.sfx !== "none" && (
                    <div className="absolute top-0 left-0 h-full w-0.5 bg-amber-400" title={`SFX: ${SFX_LABELS[s.sfx]}`}>
                      <span className="absolute -top-0 left-0.5 text-[9px] text-amber-300">♪</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* waveform */}
          <div className="absolute cursor-pointer" style={{ top: RULER_H + SCENE_H + 8, left: PAD, height: WAVE_H }} onPointerDown={onSeekPointer}>
            <canvas ref={waveRef} className="block" />
            {!buf && (
              <div className="absolute inset-0 flex items-center pl-3 text-[11px] whitespace-nowrap text-gray-600">
                Chưa có giọng đọc – upload ở Tab 3 để thấy sóng âm thật.
              </div>
            )}
          </div>
          {/* boundary handles */}
          {scenes.map((s, i) => {
            const x = PAD + (starts[i] + s.duration) * pps;
            const active = drag?.index === i;
            return (
              <div
                key={`h-${s.id}`}
                onPointerDown={startDrag(i)}
                className="group absolute z-10 cursor-ew-resize"
                style={{ left: x - 6, top: RULER_H, width: 12, height: SCENE_H + WAVE_H + 12 }}
                title="Kéo để chỉnh ranh giới cảnh (bước 0.1s)"
              >
                <div className={cx("mx-auto h-full w-0.5", active ? "bg-accent" : "bg-white/30 group-hover:bg-accent")} />
                <div className={cx("absolute top-1/2 left-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border", active ? "border-accent bg-accent" : "border-white/40 bg-ink-700 group-hover:border-accent")} />
              </div>
            );
          })}
          {/* playhead */}
          <div className="pointer-events-none absolute top-0 z-20 h-full w-px bg-red-500" style={{ left: PAD + time * pps }}>
            <div className="absolute -top-0 -left-1.5 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
