"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Clapperboard, Download, FileArchive, Film, Square, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStudio } from "@/store/studio";
import { usePlayback } from "@/store/playback";
import { getPlayer, pickRecorderMime } from "@/lib/player";
import { ensureFont, totalDuration } from "@/lib/engine";
import { exportProjectZip, downloadBlob, slugify } from "@/lib/zip";
import { CAPTION_FONTS } from "@/lib/constants";
import type { CaptionPosition } from "@/lib/types";
import { Button, Label, Panel, ProgressBar, Select, Toggle, cx } from "../ui";

export default function ExportTab() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <CaptionsPanel />
      <VideoExportPanel />
      <ZipExportPanel />
    </div>
  );
}

function CaptionsPanel() {
  const cap = useStudio((s) => s.project.captions);
  const setCaptions = useStudio((s) => s.setCaptions);

  useEffect(() => {
    if (cap.enabled) void ensureFont(cap.font).then(() => getPlayer().requestRender());
  }, [cap.enabled, cap.font]);

  return (
    <Panel
      title="Phụ đề (Captions)"
      icon={<Captions className="h-4 w-4 text-accent" />}
      actions={<Toggle checked={cap.enabled} onChange={(v) => setCaptions({ enabled: v })} label={cap.enabled ? "Đang BẬT" : "Đang TẮT (video sạch)"} />}
    >
      <p className={cx("text-xs", cap.enabled ? "mb-4 text-gray-400" : "text-gray-500")}>
        Mặc định tắt để xuất video sạch không dính chữ. Khi bật, phụ đề được đốt (burn-in) trực tiếp lên canvas theo từng cụm từ của narration.
      </p>
      {cap.enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Font</Label>
            <Select value={cap.font} onChange={(v) => setCaptions({ font: v })} options={CAPTION_FONTS.map((f) => ({ value: f.id, label: f.label }))} />
          </div>
          <div>
            <Label>Vị trí</Label>
            <Select<CaptionPosition>
              value={cap.position}
              onChange={(v) => setCaptions({ position: v })}
              options={[
                { value: "top", label: "Trên" },
                { value: "middle", label: "Giữa" },
                { value: "bottom", label: "Dưới" },
              ]}
            />
          </div>
          <RangeRow label="Cỡ chữ" value={cap.fontSize} min={48} max={160} step={2} unit="px" onChange={(v) => setCaptions({ fontSize: v })} />
          <RangeRow label="Viền đen" value={cap.strokeWidth} min={0} max={30} step={1} unit="px" onChange={(v) => setCaptions({ strokeWidth: v })} />
          <RangeRow label="Số từ mỗi cụm" value={cap.wordsPerChunk} min={1} max={8} step={1} unit=" từ" onChange={(v) => setCaptions({ wordsPerChunk: v })} />
          <div className="flex items-end gap-4">
            <div>
              <Label>Màu chữ</Label>
              <input type="color" value={cap.color} onChange={(e) => setCaptions({ color: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-ink-600 bg-ink-900" />
            </div>
            <Toggle checked={cap.uppercase} onChange={(v) => setCaptions({ uppercase: v })} label="IN HOA" />
          </div>
        </div>
      )}
    </Panel>
  );
}

function RangeRow({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <Label hint={<span className="font-mono">{value}{unit}</span>}>{label}</Label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function VideoExportPanel() {
  const scenes = useStudio((s) => s.project.script.scenes);
  const sceneAssets = useStudio((s) => s.project.sceneAssets);
  const voice = useStudio((s) => s.project.voiceover);
  const title = useStudio((s) => s.project.script.title);
  const toast = useStudio((s) => s.toast);
  const exporting = usePlayback((s) => s.exporting);
  const [progress, setProgress] = useState(0);
  const [bitrate, setBitrate] = useState("10000000");
  const [monitor, setMonitor] = useState(true);
  const [result, setResult] = useState<{ url: string; size: number; mime: string; name: string } | null>(null);
  const [mime, setMime] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setMime(pickRecorderMime()), []);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const missing = scenes.filter((s) => !sceneAssets[String(s.id)]).length;
  const total = totalDuration(scenes);

  const run = async () => {
    if (!scenes.length) return toast("error", "Chưa có cảnh nào để xuất.");
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress(0);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    try {
      const { blob, mime: outMime } = await getPlayer().exportVideo({
        onProgress: setProgress,
        signal: ac.signal,
        monitorAudio: monitor,
        videoBitrate: Number(bitrate),
      });
      const ext = outMime.includes("mp4") ? "mp4" : "webm";
      const name = `${slugify(title)}-9x16.${ext}`;
      const url = URL.createObjectURL(blob);
      setResult({ url, size: blob.size, mime: outMime, name });
      downloadBlob(blob, name);
      toast("success", `Xuất video xong (${(blob.size / 1048576).toFixed(1)} MB).`);
    } catch (e) {
      if ((e as Error).name === "AbortError") toast("info", "Đã hủy xuất video.");
      else toast("error", `Xuất video lỗi: ${(e as Error).message}`);
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <Panel title="Export Video 9:16 (1080×1920 · 30fps)" icon={<Clapperboard className="h-4 w-4 text-accent" />}>
      <div className="space-y-4">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <Info label="Codec trình duyệt" value={mime ? mime.split(";")[0] : "không hỗ trợ"} ok={!!mime} detail={mime.includes("mp4") ? "Xuất MP4 trực tiếp" : mime ? "Fallback WebM" : "Dùng Chrome/Edge mới"} />
          <Info label="Thời lượng" value={`${total.toFixed(1)}s`} ok={total > 0} detail={`${scenes.length} cảnh · ${Math.ceil(total * 30)} frame`} />
          <Info label="Âm thanh" value={voice ? "Voiceover + SFX" : "Chỉ SFX"} ok={!!voice} detail={voice ? voice.name : "Chưa có giọng đọc"} />
        </div>
        {missing > 0 && (
          <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {missing} cảnh chưa có hình – sẽ render khung placeholder.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Chất lượng (bitrate video)</Label>
            <Select
              value={bitrate}
              onChange={setBitrate}
              options={[
                { value: "6000000", label: "6 Mbps – nhẹ" },
                { value: "10000000", label: "10 Mbps – chuẩn Shorts/TikTok" },
                { value: "16000000", label: "16 Mbps – cao" },
              ]}
            />
          </div>
          <div className="flex items-end">
            <Toggle checked={monitor} onChange={setMonitor} label="Nghe âm thanh trong lúc render" />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          Render thời gian thực bằng <code>canvas.captureStream(30)</code> + <code>MediaStreamAudioDestinationNode</code> + <code>MediaRecorder</code>. Giữ tab này hiển thị trong lúc render (trình duyệt sẽ giảm tốc khi tab bị ẩn).
        </p>
        {exporting && <ProgressBar value={progress} label={<><span>Đang render… {(progress * total).toFixed(1)}s / {total.toFixed(1)}s</span><span>{Math.round(progress * 100)}%</span></>} />}
        <div className="flex flex-wrap gap-2">
          {exporting ? (
            <Button variant="danger" onClick={() => abortRef.current?.abort()} icon={<Square className="h-4 w-4" />}>
              Hủy render
            </Button>
          ) : (
            <Button variant="primary" onClick={run} disabled={!mime || !scenes.length} icon={<Film className="h-4 w-4" />}>
              Export Video 9:16
            </Button>
          )}
        </div>
        {result && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row">
            <video src={result.url} controls playsInline className="aspect-[9/16] w-40 rounded-md bg-black" />
            <div className="space-y-2 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Render xong
              </p>
              <p className="text-gray-400">
                {result.name} · {(result.size / 1048576).toFixed(2)} MB · {result.mime}
              </p>
              <a href={result.url} download={result.name} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 font-semibold text-ink-950 hover:bg-accent-600">
                <Download className="h-3.5 w-3.5" /> Tải lại file
              </a>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Info({ label, value, detail, ok }: { label: string; value: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-2.5">
      <div className="text-gray-500">{label}</div>
      <div className={cx("font-semibold", ok ? "text-gray-100" : "text-amber-300")}>{value}</div>
      <div className="truncate text-[11px] text-gray-500">{detail}</div>
    </div>
  );
}

function ZipExportPanel() {
  const project = useStudio((s) => s.project);
  const toast = useStudio((s) => s.toast);
  const [progress, setProgress] = useState<number | null>(null);

  const run = async () => {
    setProgress(0);
    try {
      await useStudio.getState().saveNow();
      const blob = await exportProjectZip(useStudio.getState().project, setProgress);
      downloadBlob(blob, `${slugify(project.script.title || project.name)}-project.zip`);
      toast("success", `Đã đóng gói ZIP (${(blob.size / 1048576).toFixed(1)} MB).`);
    } catch (e) {
      toast("error", `Đóng gói ZIP lỗi: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const assetCount = Object.keys(project.sceneAssets).length;
  return (
    <Panel title="Export Project ZIP" icon={<FileArchive className="h-4 w-4 text-accent" />}>
      <p className="mb-3 text-xs text-gray-400">
        Gồm <code>project.json</code>, {assetCount} ảnh/clip đánh số theo cảnh (<code>01.png</code>, <code>02.png</code>…), ảnh nhân vật tham chiếu, file giọng đọc, SFX riêng và
        <code> voiceover.txt</code>. Có thể import lại qua nút Projects.
      </p>
      {progress !== null && <div className="mb-3"><ProgressBar value={progress} label={<><span>Đang nén…</span><span>{Math.round(progress * 100)}%</span></>} /></div>}
      <Button onClick={run} loading={progress !== null} icon={<FileArchive className="h-4 w-4" />}>
        Export Project ZIP
      </Button>
    </Panel>
  );
}
