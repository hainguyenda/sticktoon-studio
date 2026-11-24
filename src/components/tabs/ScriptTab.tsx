"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Braces,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileJson,
  Mic,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wand,
  XCircle,
  AlertTriangle,
  Square,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import { generateScript } from "@/lib/gemini";
import { cleanVoiceover, countWords, validateScript } from "@/lib/validate";
import { VOICE_TOOL_URL } from "@/lib/constants";
import { downloadBlob, slugify } from "@/lib/zip";
import type { Language } from "@/lib/types";
import { Button, Input, Label, Panel, Select, Textarea } from "../ui";

export default function ScriptTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const script = useStudio((s) => s.project.script);
  const settings = useStudio((s) => s.settings);
  const setScript = useStudio((s) => s.setScript);
  const patchScript = useStudio((s) => s.patchScript);
  const toast = useStudio((s) => s.toast);

  const [topic, setTopic] = useState(script.topic);
  const [duration, setDuration] = useState(Math.min(60, Math.max(30, script.targetDuration || 45)));
  const [language, setLanguage] = useState<Language>(script.language);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTopic(script.topic);
    setLanguage(script.language);
    setDuration(Math.min(60, Math.max(30, script.targetDuration || 45)));
  }, [script.topic, script.language, script.targetDuration]);

  const generate = async () => {
    if (!settings.geminiApiKey) {
      toast("error", "Cần Gemini API Key – mở Cài đặt để nhập.");
      onOpenSettings();
      return;
    }
    if (!topic.trim()) return toast("error", "Nhập chủ đề / tình huống hài trước.");
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    try {
      const data = await generateScript(settings, { topic: topic.trim(), duration, language }, ac.signal);
      setScript(data, { keepAssets: false });
      toast("success", `Đã tạo kịch bản “${data.title}” – ${data.scenes.length} cảnh.`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("error", `Tạo kịch bản lỗi: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const voWords = countWords(script.voiceoverScript);
  const wps = script.language === "vi" ? 3.2 : 2.6;

  const copyVo = async () => {
    try {
      await navigator.clipboard.writeText(script.voiceoverScript);
      toast("success", "Đã copy voiceover script.");
    } catch {
      toast("error", "Trình duyệt chặn clipboard – hãy bôi đen và Ctrl+C.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel title="AI Director – Tạo kịch bản bằng Gemini" icon={<Bot className="h-4 w-4 text-accent" />}>
        <div className="space-y-3">
          <div>
            <Label hint={`${topic.length}/500`}>Chủ đề / tình huống hài</Label>
            <Textarea
              rows={3}
              maxLength={500}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: Nhân viên văn phòng giả vờ bận rộn khi sếp đi ngang, cuối cùng phát hiện sếp cũng đang giả vờ…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div>
              <Label hint={<span className="font-mono text-accent">{duration}s</span>}>Thời lượng</Label>
              <input type="range" min={30} max={60} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>30s</span>
                <span>45s</span>
                <span>60s</span>
              </div>
            </div>
            <div>
              <Label>Ngôn ngữ</Label>
              <Select<Language>
                value={language}
                onChange={setLanguage}
                options={[
                  { value: "vi", label: "Tiếng Việt" },
                  { value: "en", label: "Tiếng Anh" },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={generate} loading={generating} icon={<Sparkles className="h-4 w-4" />}>
              Tạo kịch bản bằng Gemini API
            </Button>
            {generating && (
              <Button variant="danger" onClick={() => abortRef.current?.abort()} icon={<Square className="h-3.5 w-3.5" />}>
                Hủy
              </Button>
            )}
            <span className="text-xs text-gray-500">
              Model: <code className="text-gray-300">{settings.textModel}</code>
              {!settings.geminiApiKey && (
                <button onClick={onOpenSettings} className="ml-2 text-accent hover:underline">
                  (chưa có API key)
                </button>
              )}
            </span>
          </div>
          {script.scenes.length > 0 && (
            <p className="text-[11px] text-gray-500">⚠ Tạo kịch bản mới sẽ thay thế kịch bản và gỡ toàn bộ ảnh cảnh hiện tại (ảnh nhân vật tham chiếu & giọng đọc được giữ).</p>
          )}
        </div>
      </Panel>

      <Panel
        title="Voiceover Script (sạch – chỉ lời đọc)"
        icon={<Mic className="h-4 w-4 text-accent" />}
        actions={
          <>
            <Button size="sm" onClick={copyVo} icon={<ClipboardCopy className="h-3.5 w-3.5" />} disabled={!script.voiceoverScript}>
              Copy nhanh
            </Button>
            <Button size="sm" variant="primary" onClick={() => window.open(VOICE_TOOL_URL, "_blank", "noopener")} icon={<ExternalLink className="h-3.5 w-3.5" />}>
              Mở giong-doc.vercel.app
            </Button>
          </>
        }
      >
        <Textarea
          rows={5}
          value={script.voiceoverScript}
          onChange={(e) => patchScript({ voiceoverScript: e.target.value })}
          placeholder="Lời đọc sẽ xuất hiện ở đây sau khi tạo kịch bản."
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span>
            {voWords} từ · ước tính ~{(voWords / wps).toFixed(0)}s đọc
          </span>
          <button
            className="inline-flex items-center gap-1 text-accent hover:underline"
            onClick={() => patchScript({ voiceoverScript: cleanVoiceover(script.scenes.map((s) => s.narration.trim()).join(" ")) })}
          >
            <RotateCcw className="h-3 w-3" /> Ghép lại từ narration các cảnh
          </button>
          <button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => patchScript({ voiceoverScript: cleanVoiceover(script.voiceoverScript) })}>
            <Wand className="h-3 w-3" /> Làm sạch ngoặc/ghi chú
          </button>
        </div>
      </Panel>

      <CharactersPanel />
      <JsonEditor />
    </div>
  );
}

function CharactersPanel() {
  const characters = useStudio((s) => s.project.script.characters);
  const patchScript = useStudio((s) => s.patchScript);
  const update = (i: number, k: "name" | "description", v: string) =>
    patchScript({ characters: characters.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  return (
    <Panel
      title={`Nhân vật cố định (${characters.length})`}
      icon={<Users className="h-4 w-4 text-accent" />}
      actions={
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => patchScript({ characters: [...characters, { name: "Nhân vật mới", description: "" }] })}>
          Thêm
        </Button>
      }
    >
      {characters.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có nhân vật. Mô tả ngoại hình được khóa cứng & gửi kèm mọi lần sinh ảnh để đồng bộ.</p>
      ) : (
        <div className="space-y-3">
          {characters.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3 sm:grid-cols-[180px_1fr_auto]">
              <Input value={c.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Tên" />
              <Textarea rows={2} value={c.description} onChange={(e) => update(i, "description", e.target.value)} placeholder="Locked visual description (English)" />
              <Button variant="ghost" size="sm" onClick={() => patchScript({ characters: characters.filter((_, j) => j !== i) })} icon={<Trash2 className="h-3.5 w-3.5" />} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function JsonEditor() {
  const script = useStudio((s) => s.project.script);
  const setScript = useStudio((s) => s.setScript);
  const toast = useStudio((s) => s.toast);
  const serialised = useMemo(() => JSON.stringify(script, null, 2), [script]);
  const [text, setText] = useState(serialised);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) setText(serialised);
  }, [serialised, dirty]);

  const result = useMemo(() => {
    try {
      const parsed = JSON.parse(text);
      return { parseError: null as string | null, v: validateScript(parsed) };
    } catch (e) {
      return { parseError: (e as Error).message, v: null };
    }
  }, [text]);

  const apply = () => {
    if (!result.v?.ok || !result.v.data) return;
    setScript(result.v.data);
    setDirty(false);
    toast("success", "Đã áp dụng JSON vào project.");
  };

  const onImport = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()) as Record<string, unknown>;
      const candidate = raw && typeof raw === "object" && "script" in raw ? raw.script : raw;
      const v = validateScript(candidate);
      setText(JSON.stringify(candidate, null, 2));
      setDirty(true);
      if (v.ok && v.data) {
        setScript(v.data);
        setDirty(false);
        toast("success", `Đã import ${f.name}.`);
      } else toast("error", `File JSON có ${v.errors.length} lỗi – xem chi tiết bên dưới.`);
    } catch (e) {
      toast("error", `Không đọc được JSON: ${(e as Error).message}`);
    }
  };

  return (
    <Panel
      title="JSON Director – chỉnh sửa trực tiếp"
      icon={<Braces className="h-4 w-4 text-accent" />}
      actions={
        <>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }} />
          <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
            Import .json
          </Button>
          <Button
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => downloadBlob(new Blob([serialised], { type: "application/json" }), `${slugify(script.title)}.json`)}
          >
            Export .json
          </Button>
        </>
      }
    >
      <Textarea
        rows={18}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        className="font-mono text-xs leading-5"
      />
      <div className="mt-2 space-y-1 text-xs">
        {result.parseError ? (
          <p className="flex items-center gap-1.5 text-red-400">
            <XCircle className="h-3.5 w-3.5" /> Lỗi cú pháp JSON: {result.parseError}
          </p>
        ) : result.v && !result.v.ok ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <XCircle className="h-3.5 w-3.5" /> {result.v.errors.length} lỗi cấu trúc
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {result.v.errors.slice(0, 12).map((er, i) => (
                <li key={i}>{er}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> JSON hợp lệ {dirty ? "– chưa áp dụng" : "– đang đồng bộ với project"}
          </p>
        )}
        {result.v && result.v.warnings.length > 0 && (
          <ul className="space-y-0.5 text-amber-300/90">
            {result.v.warnings.slice(0, 6).map((w, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={<FileJson className="h-3.5 w-3.5" />} disabled={!dirty || !result.v?.ok} onClick={apply}>
          Áp dụng JSON
        </Button>
        <Button
          size="sm"
          disabled={!!result.parseError}
          onClick={() => {
            try {
              setText(JSON.stringify(JSON.parse(text), null, 2));
            } catch {
              /* parse error is already displayed */
            }
          }}
        >
          Format
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={() => {
            setText(serialised);
            setDirty(false);
          }}
        >
          Hoàn tác thay đổi
        </Button>
      </div>
    </Panel>
  );
}
