"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Film,
  ImagePlus,
  Images,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  ClipboardCopy,
  X,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import { getPlayer } from "@/lib/player";
import { sceneStarts } from "@/lib/engine";
import { blobToRef, buildCharacterSheetPrompt, buildScenePrompt, generateImage, type ImageRef } from "@/lib/gemini";
import { fileKind } from "@/lib/media";
import { getBlob } from "@/lib/storage";
import { stripStyleLock, withStyleLock } from "@/lib/validate";
import { CAMERA_EFFECTS, SFX_TYPES, SHOT_TYPES } from "@/lib/types";
import type { CameraEffect, Scene, ShotType, SfxType } from "@/lib/types";
import { EFFECT_LABELS, SCENE_COLORS, SFX_LABELS, SHOT_LABELS, STYLE_LOCK } from "@/lib/constants";
import { Button, DropZone, NumberField, Panel, ProgressBar, Select, Textarea, cx, useObjectUrl } from "../ui";

async function copyToClipboard(text: string, okMsg: string) {
  const toast = useStudio.getState().toast;
  try {
    await navigator.clipboard.writeText(text);
    toast("success", okMsg);
  } catch {
    toast("error", "Trình duyệt chặn clipboard – hãy thử lại.");
  }
}

/** Full prompt to paste into Gemini / ChatGPT image chat (attach the character reference images there yourself). */
function manualScenePrompt(scene: Scene): string {
  const p = useStudio.getState().project;
  return `${buildScenePrompt(withStyleLock(scene.imagePrompt), p.script.characters, p.characterRefs.length > 0)}\nAspect ratio: 9:16 vertical (1080x1920).`;
}

type GenState = Record<number, { status: "queued" | "running" | "retrying" | "done" | "error"; msg?: string }>;

async function collectRefs(): Promise<ImageRef[]> {
  const refs = useStudio.getState().project.characterRefs;
  const out: ImageRef[] = [];
  for (const r of refs) {
    const b = await getBlob(r.key);
    if (b) out.push(await blobToRef(b));
  }
  return out;
}

export default function VisualTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const scenes = useStudio((s) => s.project.script.scenes);
  const sceneAssets = useStudio((s) => s.project.sceneAssets);
  const settings = useStudio((s) => s.settings);
  const toast = useStudio((s) => s.toast);
  const addScene = useStudio((s) => s.addScene);
  const [gen, setGen] = useState<GenState>({});
  const [batch, setBatch] = useState<{ done: number; total: number; current: string } | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const requireKey = () => {
    if (!settings.geminiApiKey) {
      toast("error", "Cần Gemini API Key để sinh ảnh.");
      onOpenSettings();
      return false;
    }
    return true;
  };

  const generateOne = async (scene: Scene, refs: ImageRef[], signal: AbortSignal) => {
    const st = useStudio.getState();
    setGen((g) => ({ ...g, [scene.id]: { status: "running" } }));
    const prompt = buildScenePrompt(withStyleLock(scene.imagePrompt), st.project.script.characters, refs.length > 0);
    const blob = await generateImage(st.settings, prompt, refs, "9:16", {
      signal,
      onRetry: (attempt, wait) =>
        setGen((g) => ({ ...g, [scene.id]: { status: "retrying", msg: `Rate-limit/lỗi server – thử lại lần ${attempt} sau ${(wait / 1000).toFixed(0)}s` } })),
    });
    const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
    await useStudio.getState().setSceneAsset(scene.id, blob, "image", `scene-${scene.id}.${ext}`);
    setGen((g) => ({ ...g, [scene.id]: { status: "done" } }));
  };

  const runSingle = async (scene: Scene) => {
    if (!requireKey()) return;
    const ac = new AbortController();
    try {
      const refs = await collectRefs();
      await generateOne(scene, refs, ac.signal);
      toast("success", `Đã tạo ảnh cảnh ${scenes.findIndex((s) => s.id === scene.id) + 1}.`);
    } catch (e) {
      setGen((g) => ({ ...g, [scene.id]: { status: "error", msg: (e as Error).message } }));
      toast("error", `Cảnh ${scene.id}: ${(e as Error).message}`);
    }
  };

  const runBatch = async () => {
    if (!requireKey()) return;
    const targets = scenes.filter((s) => !onlyMissing || !sceneAssets[String(s.id)]);
    if (!targets.length) return toast("info", "Tất cả cảnh đã có hình. Bỏ chọn “Chỉ cảnh thiếu hình” để tạo lại.");
    const ac = new AbortController();
    abortRef.current = ac;
    setGen((g) => ({ ...g, ...Object.fromEntries(targets.map((s) => [s.id, { status: "queued" as const }])) }));
    setBatch({ done: 0, total: targets.length, current: "" });
    let ok = 0;
    try {
      const refs = await collectRefs();
      for (let i = 0; i < targets.length; i++) {
        if (ac.signal.aborted) break;
        const s = targets[i];
        setBatch({ done: i, total: targets.length, current: `Cảnh ${scenes.findIndex((x) => x.id === s.id) + 1}` });
        try {
          await generateOne(s, refs, ac.signal);
          ok++;
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
          setGen((g) => ({ ...g, [s.id]: { status: "error", msg: (e as Error).message } }));
        }
        if (i < targets.length - 1 && settings.batchDelayMs > 0) {
          await new Promise((r) => setTimeout(r, settings.batchDelayMs));
        }
      }
    } finally {
      setBatch(null);
      abortRef.current = null;
      setGen((g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.status === "queued" ? { status: "error" as const, msg: "Đã hủy" } : v])));
      toast(ok === targets.length ? "success" : "info", `Tạo hàng loạt xong: ${ok}/${targets.length} cảnh.`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CharacterLock requireKey={requireKey} />
      <Panel
        title={`Asset theo cảnh (${Object.keys(sceneAssets).length}/${scenes.length} có hình)`}
        icon={<Images className="h-4 w-4 text-accent" />}
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Chỉ cảnh thiếu hình
            </label>
            {batch ? (
              <Button size="sm" variant="danger" icon={<Square className="h-3.5 w-3.5" />} onClick={() => abortRef.current?.abort()}>
                Dừng
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ClipboardCopy className="h-3.5 w-3.5" />}
                  disabled={!scenes.length}
                  onClick={() =>
                    void copyToClipboard(
                      scenes.map((sc, i) => `=== Cảnh ${String(i + 1).padStart(2, "0")} ===\n${manualScenePrompt(sc)}`).join("\n\n"),
                      `Đã copy prompt ${scenes.length} cảnh.`,
                    )
                  }
                >
                  Copy tất cả prompt
                </Button>
                <Button size="sm" icon={<Layers className="h-3.5 w-3.5" />} onClick={runBatch} disabled={!scenes.length}>
                  Tạo hàng loạt (API)
                </Button>
              </>
            )}
          </>
        }
      >
        {batch && (
          <div className="mb-4">
            <ProgressBar
              value={batch.done / batch.total}
              label={
                <>
                  <span>Đang tạo {batch.current}…</span>
                  <span>
                    {batch.done}/{batch.total}
                  </span>
                </>
              }
            />
          </div>
        )}
        <p className="mb-3 text-[11px] text-gray-500">
          Cách thủ công: bấm <b className="text-gray-300">Copy prompt ảnh</b> → dán vào Gemini (đính kèm ảnh nhân vật mẫu) → tải ảnh về → <b className="text-gray-300">kéo-thả vào thẻ cảnh</b>. Nhận .png/.jpg/.webp hoặc clip .mp4/.webm. Nút “API” cần Gemini API key (model {settings.imageModel}).
        </p>
        {scenes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Chưa có cảnh. Tạo kịch bản ở Tab 1 hoặc thêm cảnh thủ công.</p>
        ) : (
          <div className="grid gap-3 2xl:grid-cols-2">
            {scenes.map((s, i) => (
              <SceneCard key={s.id} scene={s} index={i} total={scenes.length} state={gen[s.id]} onGenerate={() => runSingle(s)} busy={!!batch} />
            ))}
          </div>
        )}
        <div className="mt-3">
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addScene()}>
            Thêm cảnh
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function CharacterLock({ requireKey }: { requireKey: () => boolean }) {
  const refs = useStudio((s) => s.project.characterRefs);
  const characters = useStudio((s) => s.project.script.characters);
  const addRef = useStudio((s) => s.addCharacterRef);
  const removeRef = useStudio((s) => s.removeCharacterRef);
  const toast = useStudio((s) => s.toast);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: File[]) => {
    for (const f of files) {
      if (fileKind(f) !== "image") {
        toast("error", `${f.name} không phải ảnh.`);
        continue;
      }
      if (useStudio.getState().project.characterRefs.length >= 4) break;
      await addRef(f, f.name);
    }
  };

  const generateSheet = async () => {
    if (!requireKey()) return;
    if (!characters.length) return toast("error", "Chưa có nhân vật trong kịch bản (Tab 1).");
    if (refs.length >= 4) return toast("error", "Đã đủ 4 ảnh tham chiếu – xóa bớt trước.");
    setBusy(true);
    try {
      const blob = await generateImage(useStudio.getState().settings, buildCharacterSheetPrompt(characters), [], "16:9");
      await addRef(blob, "ai-character-sheet.png");
      toast("success", "Đã tạo Character Sheet bằng AI.");
    } catch (e) {
      toast("error", `Tạo Character Sheet lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Character Sheet Lock"
      icon={<Lock className="h-4 w-4 text-accent" />}
      actions={
        <>
          <Button
            size="sm"
            variant="primary"
            icon={<ClipboardCopy className="h-3.5 w-3.5" />}
            disabled={!characters.length}
            onClick={() => void copyToClipboard(`${buildCharacterSheetPrompt(characters)}\nAspect ratio: 16:9.`, "Đã copy prompt Character Sheet – dán vào Gemini để tạo ảnh.")}
          >
            Copy prompt Character Sheet
          </Button>
          <Button size="sm" loading={busy} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={generateSheet}>
            Tạo bằng API
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-gray-400">
        1–4 ảnh mẫu nhân vật được gửi kèm làm <b>reference images</b> mỗi lần sinh ảnh cảnh, giúp nhân vật giống nhau xuyên suốt clip.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {refs.map((r) => (
          <RefThumb key={r.key} k={r.key} name={r.name} onRemove={() => void removeRef(r.key)} />
        ))}
        {refs.length < 4 && (
          <DropZone accept="image/png,image/jpeg,image/webp" multiple onFiles={onFiles} className="flex aspect-square items-center justify-center">
            <div className="flex flex-col items-center gap-1 p-2 text-center text-[11px] text-gray-400">
              <ImagePlus className="h-5 w-5" /> Upload ảnh mẫu
              <span className="text-gray-600">({refs.length}/4)</span>
            </div>
          </DropZone>
        )}
      </div>
      {characters.length > 0 && (
        <div className="mt-3 space-y-1 text-[11px] text-gray-500">
          {characters.map((c, i) => (
            <p key={i}>
              <b className="text-gray-300">{c.name}:</b> {c.description}
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RefThumb({ k, name, onRemove }: { k: string; name: string; onRemove: () => void }) {
  const url = useObjectUrl(k);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-ink-600 bg-ink-900">
      {url && <img src={url} alt={name} className="h-full w-full object-contain" />}
      <button onClick={onRemove} className="absolute top-1 right-1 rounded bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100" aria-label="Xóa">
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-300">{name}</span>
    </div>
  );
}

function SceneCard({
  scene,
  index,
  total,
  state,
  onGenerate,
  busy,
}: {
  scene: Scene;
  index: number;
  total: number;
  state?: GenState[number];
  onGenerate: () => void;
  busy: boolean;
}) {
  const asset = useStudio((s) => s.project.sceneAssets[String(scene.id)]);
  const selected = useStudio((s) => s.selectedSceneId === scene.id);
  const selectScene = useStudio((s) => s.selectScene);
  const updateScene = useStudio((s) => s.updateScene);
  const setSceneAsset = useStudio((s) => s.setSceneAsset);
  const removeSceneAsset = useStudio((s) => s.removeSceneAsset);
  const removeScene = useStudio((s) => s.removeScene);
  const moveScene = useStudio((s) => s.moveScene);
  const toast = useStudio((s) => s.toast);
  const url = useObjectUrl(asset?.key);
  const col = SCENE_COLORS[index % SCENE_COLORS.length];
  const running = state?.status === "running" || state?.status === "retrying";
  const promptCore = stripStyleLock(scene.imagePrompt);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    const kind = fileKind(f);
    if (kind !== "image" && kind !== "video") return toast("error", "Chỉ nhận .png/.jpg/.webp hoặc .mp4/.webm");
    await setSceneAsset(scene.id, f, kind, f.name);
    toast("success", `Đã gán ${f.name} cho cảnh ${index + 1}.`);
  };

  const preview = () => {
    const st = useStudio.getState().project.script.scenes;
    const start = sceneStarts(st)[index];
    void getPlayer().play(start);
  };

  return (
    <div
      onClick={() => selectScene(scene.id)}
      className={cx("flex gap-3 rounded-xl border bg-ink-900 p-3 transition-colors", selected ? "border-accent/60" : "border-ink-700")}
    >
      <DropZone accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onFiles={onFiles} className="relative w-28 shrink-0 overflow-hidden sm:w-32" disabled={running}>
        <div className="relative aspect-[9/16] w-full bg-ink-850">
          {url ? (
            asset?.kind === "video" ? (
              <video src={url} muted loop playsInline autoPlay className="h-full w-full object-cover" />
            ) : (
              <img src={url} alt={`Cảnh ${index + 1}`} className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-gray-500">
              <ImagePlus className="h-5 w-5" />
              Kéo-thả ảnh / clip
            </div>
          )}
          {asset?.kind === "video" && (
            <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1 text-[9px] text-white">
              <Film className="h-2.5 w-2.5" /> clip
            </span>
          )}
          {running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-2 text-center text-[10px] text-white">
              <RefreshCw className="h-5 w-5 animate-spin text-accent" />
              {state?.status === "retrying" ? state.msg : "Đang vẽ…"}
            </div>
          )}
          {state?.status === "queued" && <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[10px] text-gray-300">Trong hàng đợi</div>}
        </div>
      </DropZone>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 text-xs font-bold text-ink-950" style={{ background: col }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <NumberField
            min={0.3}
            max={60}
            value={scene.duration}
            onCommit={(v) => updateScene(scene.id, { duration: v })}
            className="h-7 w-16 py-0.5 text-xs"
            title="Thời lượng (giây) – ↑/↓ để chỉnh 0.1s"
          />
          <span className="text-[11px] text-gray-500">giây</span>
          <div className="ml-auto flex items-center">
            <IconMini onClick={preview} title="Xem cảnh này">
              <Play className="h-3.5 w-3.5" />
            </IconMini>
            <IconMini onClick={() => moveScene(scene.id, -1)} disabled={index === 0} title="Lên">
              <ArrowUp className="h-3.5 w-3.5" />
            </IconMini>
            <IconMini onClick={() => moveScene(scene.id, 1)} disabled={index === total - 1} title="Xuống">
              <ArrowDown className="h-3.5 w-3.5" />
            </IconMini>
            <IconMini
              onClick={() => {
                if (window.confirm(`Xóa cảnh ${index + 1}?`)) removeScene(scene.id);
              }}
              title="Xóa cảnh"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconMini>
          </div>
        </div>
        <Textarea
          rows={2}
          value={scene.narration}
          onChange={(e) => updateScene(scene.id, { narration: e.target.value })}
          placeholder="Lời thoại / narration"
          className="text-xs"
        />
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <Select<ShotType> value={scene.shotType} onChange={(v) => updateScene(scene.id, { shotType: v })} options={SHOT_TYPES.map((v) => ({ value: v, label: SHOT_LABELS[v] }))} className="py-1 text-xs" />
          <Select<CameraEffect>
            value={scene.cameraEffect}
            onChange={(v) => updateScene(scene.id, { cameraEffect: v })}
            options={CAMERA_EFFECTS.map((v) => ({ value: v, label: EFFECT_LABELS[v] }))}
            className="py-1 text-xs"
          />
          <Select<SfxType> value={scene.sfx} onChange={(v) => updateScene(scene.id, { sfx: v })} options={SFX_TYPES.map((v) => ({ value: v, label: `♪ ${SFX_LABELS[v]}` }))} className="py-1 text-xs" />
        </div>
        <div>
          <Textarea
            rows={3}
            value={promptCore}
            onChange={(e) => updateScene(scene.id, { imagePrompt: `${e.target.value}, ${STYLE_LOCK}` })}
            placeholder="imagePrompt (English)"
            className="font-mono text-[11px] leading-4"
          />
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-600" title={STYLE_LOCK}>
            <Lock className="h-2.5 w-2.5" /> + chuỗi khóa phong cách được nối tự động
          </p>
        </div>
        {state?.status === "error" && <p className="text-[11px] text-red-400">⚠ {state.msg}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="primary"
            icon={<ClipboardCopy className="h-3.5 w-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              void copyToClipboard(manualScenePrompt(scene), `Đã copy prompt ảnh cảnh ${index + 1}.`);
            }}
          >
            Copy prompt ảnh
          </Button>
          <Button size="sm" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={(e) => { e.stopPropagation(); onGenerate(); }} loading={running} disabled={busy && !running}>
            {asset ? "Tạo lại (API)" : "Tạo bằng API"}
          </Button>
          {asset && (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => void removeSceneAsset(scene.id)}>
              Gỡ hình
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function IconMini({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        e.stopPropagation();
        rest.onClick?.(e);
      }}
      className="rounded p-1 text-gray-400 hover:bg-ink-700 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
