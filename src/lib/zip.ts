import JSZip from "jszip";
import { DEFAULT_CAPTIONS } from "./constants";
import { getBlob, uid } from "./storage";
import type { AssetRef, Project, RealSfx } from "./types";
import { validateScript } from "./validate";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

function extFor(ref: AssetRef): string {
  const fromMime = EXT[ref.mime.split(";")[0].toLowerCase()];
  if (fromMime) return fromMime;
  const m = /\.([a-z0-9]+)$/i.exec(ref.name);
  return m ? m[1].toLowerCase() : ref.kind === "audio" ? "wav" : ref.kind === "video" ? "mp4" : "png";
}

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT).map(([mime, ext]) => [ext, mime]),
);

interface ManifestAssets {
  scenes: Record<string, string>;
  characterRefs: string[];
  voiceover: string | null;
  customSfx: Partial<Record<RealSfx, string>>;
}

export interface ProjectManifest {
  app: "StickToon Studio";
  version: 1;
  name: string;
  exportedAt: string;
  script: Project["script"];
  captions: Project["captions"];
  assets: ManifestAssets;
}

export async function exportProjectZip(
  project: Project,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const assets: ManifestAssets = { scenes: {}, characterRefs: [], voiceover: null, customSfx: {} };
  const missing: string[] = [];

  const scenes = project.script.scenes;
  for (let i = 0; i < scenes.length; i++) {
    const ref = project.sceneAssets[String(scenes[i].id)];
    if (!ref) continue;
    const blob = await getBlob(ref.key);
    if (!blob) {
      missing.push(ref.name);
      continue;
    }
    const file = `${String(i + 1).padStart(2, "0")}.${extFor(ref)}`;
    zip.file(file, blob);
    assets.scenes[String(scenes[i].id)] = file;
  }
  for (let i = 0; i < project.characterRefs.length; i++) {
    const ref = project.characterRefs[i];
    const blob = await getBlob(ref.key);
    if (!blob) continue;
    const file = `characters/ref-${i + 1}.${extFor(ref)}`;
    zip.file(file, blob);
    assets.characterRefs.push(file);
  }
  if (project.voiceover) {
    const blob = await getBlob(project.voiceover.key);
    if (blob) {
      const file = `audio/voiceover.${extFor(project.voiceover)}`;
      zip.file(file, blob);
      assets.voiceover = file;
    }
  }
  for (const [type, ref] of Object.entries(project.customSfx) as [RealSfx, AssetRef | undefined][]) {
    if (!ref) continue;
    const blob = await getBlob(ref.key);
    if (!blob) continue;
    const file = `sfx/${type}.${extFor(ref)}`;
    zip.file(file, blob);
    assets.customSfx[type] = file;
  }
  const manifest: ProjectManifest = {
    app: "StickToon Studio",
    version: 1,
    name: project.name,
    exportedAt: new Date().toISOString(),
    script: project.script,
    captions: project.captions,
    assets,
  };
  zip.file("project.json", JSON.stringify(manifest, null, 2));
  zip.file("voiceover.txt", project.script.voiceoverScript);
  if (missing.length) zip.file("MISSING_ASSETS.txt", missing.join("\n"));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (meta) =>
    onProgress?.(meta.percent / 100),
  );
}

export async function importProjectZip(file: Blob): Promise<{ project: Project; blobs: Record<string, Blob> }> {
  const zip = await JSZip.loadAsync(file);
  const pj = zip.file("project.json");
  if (!pj) throw new Error("ZIP không có project.json");
  const manifest = JSON.parse(await pj.async("string")) as Partial<ProjectManifest>;
  const v = validateScript(manifest.script);
  if (!v.ok || !v.data) throw new Error(`project.json lỗi: ${v.errors.slice(0, 3).join("; ")}`);
  const blobs: Record<string, Blob> = {};

  const readAsset = async (path: string, kind: AssetRef["kind"]): Promise<AssetRef | null> => {
    const f = zip.file(path);
    if (!f) return null;
    const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? (kind === "audio" ? "audio/wav" : kind === "video" ? "video/mp4" : "image/png");
    const blob = new Blob([await f.async("arraybuffer")], { type: mime });
    const key = uid("a_");
    blobs[key] = blob;
    return { key, kind, mime, name: path.split("/").pop() ?? path };
  };

  const a = manifest.assets ?? { scenes: {}, characterRefs: [], voiceover: null, customSfx: {} };
  const sceneAssets: Record<string, AssetRef> = {};
  for (const [id, path] of Object.entries(a.scenes ?? {})) {
    const kind = /\.(mp4|webm|mov)$/i.test(path) ? "video" : "image";
    const ref = await readAsset(path, kind);
    if (ref) sceneAssets[id] = ref;
  }
  const characterRefs: AssetRef[] = [];
  for (const path of a.characterRefs ?? []) {
    const ref = await readAsset(path, "image");
    if (ref) characterRefs.push(ref);
  }
  const voiceover = a.voiceover ? await readAsset(a.voiceover, "audio") : null;
  const customSfx: Partial<Record<RealSfx, AssetRef>> = {};
  for (const [type, path] of Object.entries(a.customSfx ?? {}) as [RealSfx, string][]) {
    const ref = await readAsset(path, "audio");
    if (ref) customSfx[type] = ref;
  }
  const now = Date.now();
  return {
    project: {
      id: uid("p_"),
      name: manifest.name || v.data.title,
      createdAt: now,
      updatedAt: now,
      script: v.data,
      sceneAssets,
      characterRefs: characterRefs.slice(0, 4),
      voiceover,
      customSfx,
      captions: { ...DEFAULT_CAPTIONS, ...(manifest.captions ?? {}) },
    },
    blobs,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "sticktoon"
  );
}
