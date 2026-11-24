"use client";

import { useRef, useState } from "react";
import { AudioLines, Play, Square, Wand2, Loader2 } from "lucide-react";
import { useStudio } from "@/store/studio";
import { getPlayer } from "@/lib/player";
import { LOCAL_VOICES, VOICE_SAMPLES, concatFloat, floatToWav, normalizePeak, synthesize, type TtsOptions } from "@/lib/localTts";
import { MIN_SCENE_DURATION } from "@/lib/constants";
import type { Language, Scene } from "@/lib/types";
import { Button, Panel, ProgressBar, Select, cx } from "./ui";

const LEAD = 0.15;

/** Silence left after a scene's line – longer on beats that need to breathe (twist / awkward silence). */
function tailFor(s: Scene): number {
  if (s.cameraEffect === "freeze_grayscale" || s.sfx === "cricket") return 0.9;
  if (s.sfx === "vine_boom" || s.sfx === "record_scratch") return 0.6;
  return 0.35;
}

export default function VoiceStudio() {
  const settings = useStudio((s) => s.settings);
  const update = useStudio((s) => s.updateSettings);
  const script = useStudio((s) => s.project.script);
  const patchScript = useStudio((s) => s.patchScript);
  const toast = useStudio((s) => s.toast);
  const lang: Language = script.language;
  const voiceId = lang === "vi" ? settings.localVoiceVi : settings.localVoiceEn;
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "scenes">(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const opts = (signal?: AbortSignal, voice = voiceId): TtsOptions => ({
    lang,
    voice,
    speed: settings.localTtsSpeed,
    pause: settings.localTtsPause,
    steps: settings.localTtsSteps,
    onStatus: setStatus,
    signal,
  });

  const selectVoice = (id: string) => update(lang === "vi" ? { localVoiceVi: id } : { localVoiceEn: id });

  const preview = async (id: string) => {
    if (busy) return;
    setBusy("preview");
    setPreviewId(id);
    try {
      const a = await synthesize(VOICE_SAMPLES[lang], opts(undefined, id));
      const url = URL.createObjectURL(floatToWav(a.audio, a.sr));
      audioRef.current?.pause();
      const el = new Audio(url);
      audioRef.current = el;
      el.onended = () => URL.revokeObjectURL(url);
      await el.play();
      setStatus("");
    } catch (e) {
      setStatus(`Lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setPreviewId(null);
    }
  };

  const generateByScene = async () => {
    const scenes = useStudio.getState().project.script.scenes;
    if (!scenes.length) return toast("error", "Chưa có cảnh nào.");
    if (!scenes.some((s) => s.narration.trim())) return toast("error", "Các cảnh chưa có narration.");
    getPlayer().pause();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy("scenes");
    setProgress({ done: 0, total: scenes.length });
    try {
      const lines: ({ audio: Float32Array; sr: number } | null)[] = [];
      for (let i = 0; i < scenes.length; i++) {
        if (ac.signal.aborted) throw new DOMException("Đã hủy", "AbortError");
        setProgress({ done: i, total: scenes.length });
        const text = scenes[i].narration.trim();
        lines.push(text ? await synthesize(text, opts(ac.signal)) : null);
      }
      const sr = lines.find((l) => l)?.sr ?? 24000;
      const durations: number[] = [];
      const parts: Float32Array[] = [];
      scenes.forEach((s, i) => {
        const l = lines[i];
        const len = l ? l.audio.length / sr : 0;
        const dur = l ? Math.max(MIN_SCENE_DURATION, Math.ceil((LEAD + len + tailFor(s)) * 10) / 10) : s.duration;
        durations.push(dur);
        const total = Math.round(dur * sr);
        const lead = l ? Math.round(LEAD * sr) : 0;
        const seg = new Float32Array(total);
        if (l) seg.set(l.audio.subarray(0, Math.max(0, total - lead)), lead);
        parts.push(seg);
      });
      const all = concatFloat(parts);
      // one gain for the whole track keeps every scene at the same loudness, without clipping
      normalizePeak([all]);
      const st = useStudio.getState();
      st.setDurations(durations);
      const voiceName = LOCAL_VOICES[lang].find((v) => v.id === voiceId)?.name ?? voiceId;
      await st.setVoiceover(floatToWav(all, sr), `giong-${voiceId}.wav`);
      patchScript({ voiceoverScript: scenes.map((s) => s.narration.trim()).filter(Boolean).join(" ") });
      setProgress({ done: scenes.length, total: scenes.length });
      setStatus("");
      toast("success", `Đã đọc ${scenes.length} cảnh bằng giọng ${voiceName} – timeline khớp tự động (${(all.length / sr).toFixed(1)}s).`);
      getPlayer().seek(0);
    } catch (e) {
      if ((e as Error).name === "AbortError") toast("info", "Đã hủy tạo giọng đọc.");
      else toast("error", `Tạo giọng đọc lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <Panel
      title="Giọng đọc AI tích hợp (từ giong-doc)"
      icon={<AudioLines className="h-4 w-4 text-accent" />}
      actions={
        busy === "scenes" ? (
          <Button size="sm" variant="danger" icon={<Square className="h-3.5 w-3.5" />} onClick={() => abortRef.current?.abort()}>
            Dừng
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={generateByScene} disabled={!!busy || !script.scenes.length}>
            Đọc từng cảnh & khớp timeline
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-gray-400">
        Chạy ngay trên máy bạn, miễn phí, không cần API key. Mỗi cảnh được đọc riêng rồi ghép lại, độ dài cảnh tự đặt bằng đúng độ dài câu thoại (cảnh twist được giữ thêm nhịp lặng).
        Ngôn ngữ theo kịch bản: <b className="text-gray-200">{lang === "vi" ? "Tiếng Việt" : "Tiếng Anh"}</b>.{" "}
        {lang === "vi" ? "Lần đầu phải tải bộ giọng Việt khoảng 400 MB (lưu lại trên máy)." : "Lần đầu phải tải giọng Anh khoảng 90 MB (lưu lại trên máy)."} Nên dùng Chrome/Edge bản mới.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {LOCAL_VOICES[lang].map((v) => (
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            onClick={() => selectVoice(v.id)}
            onKeyDown={(e) => e.key === "Enter" && selectVoice(v.id)}
            className={cx(
              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2",
              voiceId === v.id ? "border-accent bg-accent/10" : "border-ink-700 bg-ink-900 hover:border-ink-500",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {v.name}
                {v.star && <span className="ml-1 rounded bg-accent px-1 text-[10px] text-ink-950">★ trầm</span>}
              </div>
              <div className="text-[11px] text-gray-500">{v.desc}</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void preview(v.id);
              }}
              disabled={!!busy}
              className="flex h-7 items-center gap-1 rounded-md border border-ink-600 px-2 text-[11px] text-gray-300 hover:bg-ink-700 disabled:opacity-40"
            >
              {previewId === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Nghe
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>Tốc độ</span>
            <span className="font-mono">{settings.localTtsSpeed.toFixed(2)}×</span>
          </div>
          <input type="range" min={0.7} max={1.3} step={0.05} value={settings.localTtsSpeed} onChange={(e) => update({ localTtsSpeed: Number(e.target.value) })} className="w-full" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>Nghỉ giữa câu</span>
            <span className="font-mono">{settings.localTtsPause.toFixed(2)}s</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={settings.localTtsPause} onChange={(e) => update({ localTtsPause: Number(e.target.value) })} className="w-full" />
        </div>
        {lang === "vi" && (
          <div>
            <div className="mb-1 text-xs text-gray-400">Chất lượng giọng Việt</div>
            <Select
              value={String(settings.localTtsSteps)}
              onChange={(v) => update({ localTtsSteps: Number(v) })}
              options={[
                { value: "8", label: "Nhanh" },
                { value: "16", label: "Cân bằng" },
                { value: "32", label: "Tốt nhất (chậm)" },
              ]}
            />
          </div>
        )}
      </div>
      {progress && (
        <div className="mt-4">
          <ProgressBar
            value={progress.done / progress.total}
            label={
              <>
                <span>Đang đọc cảnh {Math.min(progress.done + 1, progress.total)}/{progress.total}…</span>
                <span>{Math.round((progress.done / progress.total) * 100)}%</span>
              </>
            }
          />
        </div>
      )}
      {status && <p className="mt-2 text-[11px] text-gray-400">{status}</p>}
    </Panel>
  );
}
