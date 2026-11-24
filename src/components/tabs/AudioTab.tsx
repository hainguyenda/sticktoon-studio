"use client";

import { useState } from "react";
import { ExternalLink, FileAudio, Mic, Music2, Play, RadioTower, RotateCcw, SlidersHorizontal, Trash2, Upload, Wand2 } from "lucide-react";
import { useStudio } from "@/store/studio";
import { getPlayer } from "@/lib/player";
import { sceneStarts, totalDuration } from "@/lib/engine";
import { fileKind } from "@/lib/media";
import { synthesizeViaBridge } from "@/lib/tts";
import { countWords } from "@/lib/validate";
import { SFX_LABELS, SCENE_COLORS, VOICE_TOOL_URL } from "@/lib/constants";
import { SFX_TYPES } from "@/lib/types";
import type { RealSfx } from "@/lib/types";
import { Button, DropZone, NumberField, Panel, cx, fmtTime } from "../ui";
import { runAutoSync, useVoiceBuffer } from "../Timeline";
import VoiceStudio from "../VoiceStudio";

const REAL_SFX = SFX_TYPES.filter((s): s is RealSfx => s !== "none");

const SFX_DESC: Record<RealSfx, string> = {
  vine_boom: "Boom trầm méo tiếng – khoảnh khắc twist",
  record_scratch: "Đĩa than bị khựng – “khoan đã…”",
  whoosh: "Gió lướt – chuyển cảnh nhanh",
  pop: "Pop nhỏ – gag, xuất hiện đồ vật",
  ding: "Chuông ý tưởng / đúng rồi",
  cricket: "Dế kêu – im lặng ngượng ngùng",
};

export default function AudioTab() {
  const voice = useStudio((s) => s.project.voiceover);
  const script = useStudio((s) => s.project.script);
  const settings = useStudio((s) => s.settings);
  const setVoiceover = useStudio((s) => s.setVoiceover);
  const removeVoiceover = useStudio((s) => s.removeVoiceover);
  const updateSettings = useStudio((s) => s.updateSettings);
  const toast = useStudio((s) => s.toast);
  const buf = useVoiceBuffer();
  const [snap, setSnap] = useState(true);
  const [bridgeBusy, setBridgeBusy] = useState(false);

  const onVoiceFiles = async (files: File[]) => {
    const f = files[0];
    if (fileKind(f) !== "audio") return toast("error", "Chỉ nhận file audio (.mp3 / .wav / .m4a / .ogg).");
    await setVoiceover(f, f.name);
    toast("success", `Đã nạp giọng đọc ${f.name}. Bấm Auto-Sync để khớp timeline.`);
  };

  const viaBridge = async () => {
    const text = script.voiceoverScript.trim();
    if (!text) return toast("error", "Voiceover script đang trống (Tab 1).");
    setBridgeBusy(true);
    try {
      const blob = await synthesizeViaBridge(settings, text, script.language);
      await setVoiceover(blob, `tts-bridge.${blob.type.includes("wav") ? "wav" : "mp3"}`);
      toast("success", "Đã tạo giọng đọc qua TTS Bridge.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBridgeBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <VoiceStudio />
      <Panel
        title="Giọng đọc (Voiceover)"
        icon={<Mic className="h-4 w-4 text-accent" />}
        actions={
          <>
            <Button size="sm" onClick={() => window.open(VOICE_TOOL_URL, "_blank", "noopener")} icon={<ExternalLink className="h-3.5 w-3.5" />}>
              giong-doc.vercel.app
            </Button>
            {settings.ttsBridgeUrl && (
              <Button size="sm" variant="primary" loading={bridgeBusy} onClick={viaBridge} icon={<RadioTower className="h-3.5 w-3.5" />}>
                Tạo giọng qua Bridge
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <DropZone accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,.mp3,.wav,.m4a,.ogg" onFiles={onVoiceFiles}>
            <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-center text-sm text-gray-400">
              <Upload className="h-6 w-6" />
              Kéo-thả file <b className="text-gray-200">.mp3 / .wav</b> từ giong-doc.vercel.app
              <span className="text-[11px] text-gray-600">Sóng âm thật sẽ hiện trên Timeline phía dưới</span>
            </div>
          </DropZone>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3 text-sm">
            {voice ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-5 w-5 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-medium">{voice.name}</span>
                  <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void removeVoiceover()} />
                </div>
                {buf ? (
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <Stat label="Độ dài" value={`${buf.duration.toFixed(2)}s`} />
                    <Stat label="Sample rate" value={`${(buf.sampleRate / 1000).toFixed(1)}kHz`} />
                    <Stat label="Kênh" value={buf.numberOfChannels === 1 ? "Mono" : "Stereo"} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Đang giải mã audio…</p>
                )}
                <p className="text-[11px] text-gray-500">
                  Tổng cảnh hiện tại: {totalDuration(script.scenes).toFixed(1)}s
                  {buf && Math.abs(buf.duration - totalDuration(script.scenes)) > 0.25 && <span className="text-amber-300"> – chưa khớp audio, hãy Auto-Sync.</span>}
                </p>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-gray-500">
                Chưa có giọng đọc. Copy Voiceover Script ở Tab 1 → tạo giọng ở giong-doc.vercel.app → tải file về và kéo-thả vào đây.
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Auto-Sync Timeline"
        icon={<Wand2 className="h-4 w-4 text-accent" />}
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-gray-400" title="Sau khi chia theo số từ, dịch mỗi ranh giới tới khoảng lặng gần nhất (±0.8s)">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Bắt vào khoảng lặng
            </label>
            <Button size="sm" variant="primary" disabled={!buf || !script.scenes.length} onClick={() => buf && runAutoSync(buf, snap)} icon={<Wand2 className="h-3.5 w-3.5" />}>
              Auto-Sync theo số từ
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-gray-400">
          Chia tổng độ dài audio cho các cảnh theo tỷ lệ số từ của <code>narration</code>. Tinh chỉnh tiếp bằng cách kéo vạch ranh giới trên Timeline (bước 0.1s) hoặc sửa số bên dưới.
        </p>
        <SceneTimingTable />
      </Panel>

      <Panel title="Thư viện SFX dựng sẵn (Web Audio procedural)" icon={<Music2 className="h-4 w-4 text-accent" />}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REAL_SFX.map((t) => (
            <SfxCard key={t} type={t} />
          ))}
        </div>
      </Panel>

      <Panel title="Mixer" icon={<SlidersHorizontal className="h-4 w-4 text-accent" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Slider label="Giọng đọc" value={settings.voiceVolume} onChange={(v) => updateSettings({ voiceVolume: v })} />
          <Slider label="SFX" value={settings.sfxVolume} onChange={(v) => updateSettings({ sfxVolume: v })} />
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-ink-800 px-2 py-1.5">
      <div className="text-gray-500">{label}</div>
      <div className="font-mono text-gray-200">{value}</div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-mono">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={0} max={1.5} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function SceneTimingTable() {
  const scenes = useStudio((s) => s.project.script.scenes);
  const updateScene = useStudio((s) => s.updateScene);
  const selectScene = useStudio((s) => s.selectScene);
  const starts = sceneStarts(scenes);
  if (!scenes.length) return <p className="text-sm text-gray-500">Chưa có cảnh.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-gray-500">
          <tr className="border-b border-ink-700">
            <th className="py-1.5 pr-2">#</th>
            <th className="pr-2">Bắt đầu</th>
            <th className="pr-2">Kết thúc</th>
            <th className="pr-2">Số từ</th>
            <th className="pr-2">Thời lượng (s)</th>
            <th>Narration</th>
          </tr>
        </thead>
        <tbody>
          {scenes.map((s, i) => (
            <tr key={s.id} className="border-b border-ink-800 hover:bg-ink-800/50">
              <td className="py-1 pr-2">
                <button
                  onClick={() => {
                    selectScene(s.id);
                    getPlayer().seek(starts[i] + 0.001);
                  }}
                  className="rounded px-1.5 py-0.5 font-bold text-ink-950"
                  style={{ background: SCENE_COLORS[i % SCENE_COLORS.length] }}
                >
                  {i + 1}
                </button>
              </td>
              <td className="pr-2 font-mono text-gray-400">{fmtTime(starts[i])}</td>
              <td className="pr-2 font-mono text-gray-400">{fmtTime(starts[i] + s.duration)}</td>
              <td className="pr-2 text-gray-400">{countWords(s.narration)}</td>
              <td className="pr-2">
                <NumberField value={s.duration} min={0.3} max={60} onCommit={(v) => updateScene(s.id, { duration: v })} className="h-7 w-20 py-0.5 text-xs" />
              </td>
              <td className="max-w-[340px] truncate text-gray-400" title={s.narration}>
                {s.narration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SfxCard({ type }: { type: RealSfx }) {
  const custom = useStudio((s) => s.project.customSfx[type]);
  const usedIn = useStudio((s) => s.project.script.scenes.filter((sc) => sc.sfx === type).length);
  const setCustomSfx = useStudio((s) => s.setCustomSfx);
  const removeCustomSfx = useStudio((s) => s.removeCustomSfx);
  const toast = useStudio((s) => s.toast);
  return (
    <div className={cx("rounded-lg border bg-ink-900 p-3", custom ? "border-accent/40" : "border-ink-700")}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void getPlayer().previewSfx(type)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-950 hover:bg-accent-600"
          aria-label={`Nghe ${type}`}
        >
          <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{SFX_LABELS[type]}</div>
          <div className="truncate text-[11px] text-gray-500">{custom ? `File riêng: ${custom.name}` : SFX_DESC[type]}</div>
        </div>
        <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-gray-400">{usedIn} cảnh</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        <DropZone
          accept="audio/*,.mp3,.wav,.ogg,.m4a"
          onFiles={async (files) => {
            const f = files[0];
            if (fileKind(f) !== "audio") return toast("error", "Chỉ nhận file audio.");
            await setCustomSfx(type, f, f.name);
            toast("success", `${SFX_LABELS[type]} → dùng file ${f.name}`);
          }}
          className="flex-1"
        >
          <div className="flex items-center justify-center gap-1 px-2 py-1 text-[11px] text-gray-400">
            <Upload className="h-3 w-3" /> {custom ? "Đổi file" : "Thay bằng file riêng"}
          </div>
        </DropZone>
        {custom && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => void removeCustomSfx(type)} title="Về âm procedural">
            Gốc
          </Button>
        )}
      </div>
    </div>
  );
}
