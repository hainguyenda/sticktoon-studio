"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ListRestart, ExternalLink } from "lucide-react";
import { useStudio } from "@/store/studio";
import { IMAGE_MODELS, TEXT_MODELS, DEFAULT_SETTINGS } from "@/lib/constants";
import { listModels } from "@/lib/gemini";
import type { Settings } from "@/lib/types";
import { Button, Input, Label, Modal } from "./ui";

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useStudio((s) => s.settings);
  const update = useStudio((s) => s.updateSettings);
  const toast = useStudio((s) => s.toast);
  const [draft, setDraft] = useState<Settings>(settings);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const fetchModels = async () => {
    if (!draft.geminiApiKey) return toast("error", "Nhập API key trước.");
    setLoadingModels(true);
    try {
      const list = await listModels(draft.geminiApiKey.trim());
      setModels(list.map((m) => m.name));
      toast("success", `Key hợp lệ – tìm thấy ${list.length} model hỗ trợ generateContent.`);
    } catch (e) {
      toast("error", `Không lấy được danh sách model: ${(e as Error).message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const textOptions = Array.from(new Set([...TEXT_MODELS, ...models.filter((m) => !/image|embedding|tts|aqa|imagen|veo/i.test(m))]));
  const imageOptions = Array.from(new Set([...IMAGE_MODELS, ...models.filter((m) => /image/i.test(m))]));

  const save = () => {
    update({ ...draft, geminiApiKey: draft.geminiApiKey.trim(), ttsBridgeUrl: draft.ttsBridgeUrl.trim() });
    toast("success", "Đã lưu cài đặt vào trình duyệt (localStorage).");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Cài đặt" wide>
      <div className="space-y-5">
        <div>
          <Label hint={<a className="inline-flex items-center gap-1 text-accent hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Lấy key tại Google AI Studio <ExternalLink className="h-3 w-3" /></a>}>
            Gemini API Key
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                type={show ? "text" : "password"}
                value={draft.geminiApiKey}
                onChange={(e) => set("geminiApiKey", e.target.value)}
                placeholder="AIza…"
                className="pl-8 font-mono"
                autoComplete="off"
              />
            </div>
            <Button variant="ghost" onClick={() => setShow((s) => !s)} icon={show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} />
            <Button onClick={fetchModels} loading={loadingModels} icon={<ListRestart className="h-4 w-4" />}>
              Kiểm tra & tải model
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Key chỉ lưu trong localStorage của trình duyệt này và được gửi thẳng tới generativelanguage.googleapis.com.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Model kịch bản (text)</Label>
            <Input list="text-models" value={draft.textModel} onChange={(e) => set("textModel", e.target.value)} />
            <datalist id="text-models">
              {textOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Model sinh ảnh</Label>
            <Input list="image-models" value={draft.imageModel} onChange={(e) => set("imageModel", e.target.value)} />
            <datalist id="image-models">
              {imageOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <Label hint="tránh lỗi 429">Giãn cách tạo hàng loạt (ms)</Label>
            <Input type="number" min={0} step={250} value={draft.batchDelayMs} onChange={(e) => set("batchDelayMs", Math.max(0, Number(e.target.value)))} />
          </div>
          <div>
            <Label hint="429/5xx">Số lần retry tối đa</Label>
            <Input type="number" min={0} max={10} value={draft.maxRetries} onChange={(e) => set("maxRetries", Math.max(0, Math.min(10, Number(e.target.value))))} />
          </div>
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-900 p-4">
          <h4 className="mb-1 text-sm font-semibold">TTS API Bridge (tùy chọn)</h4>
          <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
            Endpoint nhận <code className="text-gray-300">POST {"{ text, language }"}</code> (JSON) và trả về file audio trực tiếp (audio/*) hoặc JSON
            <code className="text-gray-300"> {"{ audioUrl }"}</code> / <code className="text-gray-300">{"{ audioBase64, mimeType }"}</code>. Khi có URL, Tab 3 sẽ hiện nút “Tạo giọng qua Bridge”.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Bridge URL</Label>
              <Input value={draft.ttsBridgeUrl} onChange={(e) => set("ttsBridgeUrl", e.target.value)} placeholder="https://your-tts-bridge.example.com/api/tts" />
            </div>
            <div>
              <Label>Bearer token (nếu cần)</Label>
              <Input type="password" value={draft.ttsBridgeToken} onChange={(e) => set("ttsBridgeToken", e.target.value)} autoComplete="off" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setDraft({ ...DEFAULT_SETTINGS, geminiApiKey: draft.geminiApiKey })}>
            Khôi phục mặc định
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button variant="primary" onClick={save}>
              Lưu cài đặt
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
