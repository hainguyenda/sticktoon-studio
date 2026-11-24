"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, ChevronFirst, ScanLine, Volume2 } from "lucide-react";
import { getPlayer } from "@/lib/player";
import { sceneIndexAt, sceneStarts, totalDuration } from "@/lib/engine";
import { EFFECT_LABELS, SFX_LABELS, SHOT_LABELS } from "@/lib/constants";
import { useStudio } from "@/store/studio";
import { usePlayback } from "@/store/playback";
import { cx, fmtTime } from "./ui";

export default function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const time = usePlayback((s) => s.time);
  const playing = usePlayback((s) => s.playing);
  const exporting = usePlayback((s) => s.exporting);
  const exportProgress = usePlayback((s) => s.exportProgress);
  const scenes = useStudio((s) => s.project.script.scenes);
  const selectScene = useStudio((s) => s.selectScene);
  const voiceVolume = useStudio((s) => s.settings.voiceVolume);
  const updateSettings = useStudio((s) => s.updateSettings);
  const [guides, setGuides] = useState(false);

  useEffect(() => {
    const p = getPlayer();
    p.attachCanvas(canvasRef.current);
    return () => {
      p.pause();
      p.attachCanvas(null);
    };
  }, []);

  const total = totalDuration(scenes);
  const idx = scenes.length ? sceneIndexAt(scenes, time) : -1;
  const scene = idx >= 0 ? scenes[idx] : null;

  useEffect(() => {
    if (playing && scene) selectScene(scene.id);
  }, [playing, scene, selectScene]);

  const jumpScene = (dir: -1 | 1) => {
    if (!scenes.length) return;
    const starts = sceneStarts(scenes);
    const target = Math.max(0, Math.min(scenes.length - 1, idx + dir));
    getPlayer().seek(starts[target] + 0.001);
    selectScene(scenes[target].id);
  };

  return (
    <div className="flex h-[72vh] flex-col lg:h-full">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 text-xs text-gray-400">
        <span className="font-semibold tracking-wide text-gray-300">PREVIEW 1080×1920 · 30fps</span>
        <button
          onClick={() => setGuides((g) => !g)}
          className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5", guides ? "bg-accent/20 text-accent" : "hover:bg-ink-700")}
          title="Hiện vùng an toàn của Shorts/TikTok/Reels"
        >
          <ScanLine className="h-3.5 w-3.5" /> Safe zone
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative h-full max-h-full" style={{ aspectRatio: "9 / 16" }}>
          <canvas
            ref={canvasRef}
            onClick={() => getPlayer().toggle()}
            className="checker h-full w-full cursor-pointer rounded-lg border border-ink-600 object-contain shadow-2xl"
          />
          {guides && (
            <div className="pointer-events-none absolute inset-0 rounded-lg">
              <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-red-400/70 bg-red-500/10" />
              <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-dashed border-red-400/70 bg-red-500/10" />
              <div className="absolute top-[30%] right-0 bottom-[22%] w-[14%] border-l border-dashed border-red-400/70 bg-red-500/10" />
            </div>
          )}
          {exporting && (
            <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/75 p-3 text-xs text-white backdrop-blur">
              <div className="mb-1.5 flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Đang render video…
                </span>
                <span>{Math.round(exportProgress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-white/20">
                <div className="h-full bg-red-500" style={{ width: `${exportProgress * 100}%` }} />
              </div>
            </div>
          )}
          {!playing && !exporting && scenes.length > 0 && (
            <button
              onClick={() => getPlayer().toggle()}
              className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-2 ring-white/30 backdrop-blur transition hover:scale-105 hover:bg-black/70"
              aria-label="Play"
            >
              <Play className="ml-1 h-7 w-7" fill="currentColor" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <IconBtn onClick={() => getPlayer().seek(0)} disabled={exporting} title="Về đầu">
            <ChevronFirst className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={() => jumpScene(-1)} disabled={exporting} title="Cảnh trước">
            <SkipBack className="h-4 w-4" />
          </IconBtn>
          <button
            onClick={() => getPlayer().toggle()}
            disabled={exporting || !scenes.length}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink-950 hover:bg-accent-600 disabled:opacity-40"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
          <IconBtn onClick={() => jumpScene(1)} disabled={exporting} title="Cảnh sau">
            <SkipForward className="h-4 w-4" />
          </IconBtn>
          <span className="ml-1 font-mono text-xs text-gray-300 tabular-nums">
            {fmtTime(time)} <span className="text-gray-600">/ {fmtTime(total)}</span>
          </span>
          <div className="ml-auto flex items-center gap-1 text-gray-400" title="Âm lượng giọng đọc">
            <Volume2 className="h-3.5 w-3.5" />
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={voiceVolume}
              onChange={(e) => updateSettings({ voiceVolume: Number(e.target.value) })}
              className="w-16"
            />
          </div>
        </div>
        {scene ? (
          <div className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-[11px]">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-ink-700 px-1.5 py-0.5 font-bold text-gray-200">
                Cảnh {idx + 1}/{scenes.length}
              </span>
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">{SHOT_LABELS[scene.shotType]}</span>
              <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-fuchsia-300">{EFFECT_LABELS[scene.cameraEffect]}</span>
              {scene.sfx !== "none" && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">♪ {SFX_LABELS[scene.sfx]}</span>
              )}
            </div>
            <p className="line-clamp-2 text-gray-400">{scene.narration || <i>(không có thoại)</i>}</p>
          </div>
        ) : (
          <p className="text-center text-xs text-gray-500">Chưa có cảnh nào – tạo kịch bản ở Tab 1 hoặc bấm “Demo”.</p>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-ink-700 hover:text-white disabled:opacity-40">
      {children}
    </button>
  );
}
