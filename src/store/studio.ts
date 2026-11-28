"use client";

import { create } from "zustand";
import { DEFAULT_CAPTIONS, MIN_SCENE_DURATION, STYLE_LOCK } from "@/lib/constants";
import { evictMedia, primeBlob } from "@/lib/media";
import {
  deleteBlob,
  deleteProjectDeep,
  getLastProjectId,
  getProject,
  listProjects,
  loadSettings,
  putBlob,
  putProject,
  saveSettings,
  setLastProjectId,
  uid,
} from "@/lib/storage";
import type {
  AssetKind,
  AssetRef,
  CaptionSettings,
  Project,
  RealSfx,
  Scene,
  ScriptData,
  Settings,
  TabId,
} from "@/lib/types";

export interface Toast {
  id: number;
  type: "info" | "success" | "error";
  text: string;
}

export function emptyScript(): ScriptData {
  return {
    title: "Project mới",
    topic: "",
    language: "vi",
    targetDuration: 45,
    voiceoverScript: "",
    characters: [],
    scenes: [],
  };
}

export function emptyProject(): Project {
  const now = Date.now();
  return {
    id: uid("p_"),
    name: "Project mới",
    createdAt: now,
    updatedAt: now,
    script: emptyScript(),
    sceneAssets: {},
    characterRefs: [],
    voiceover: null,
    customSfx: {},
    captions: { ...DEFAULT_CAPTIONS },
  };
}

interface StudioState {
  hydrated: boolean;
  project: Project;
  settings: Settings;
  activeTab: TabId;
  selectedSceneId: number | null;
  saveStatus: "saved" | "saving" | "error";
  busy: string | null;
  toasts: Toast[];

  init: () => Promise<void>;
  setTab: (t: TabId) => void;
  selectScene: (id: number | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toast: (type: Toast["type"], text: string) => void;
  dismissToast: (id: number) => void;
  setBusy: (msg: string | null) => void;

  renameProject: (name: string) => void;
  setScript: (script: ScriptData, opts?: { keepAssets?: boolean }) => void;
  patchScript: (patch: Partial<ScriptData>) => void;
  updateScene: (id: number, patch: Partial<Scene>) => void;
  addScene: (afterId?: number) => void;
  removeScene: (id: number) => void;
  moveScene: (id: number, dir: -1 | 1) => void;
  setDurations: (durations: number[]) => void;
  setCaptions: (patch: Partial<CaptionSettings>) => void;

  storeAsset: (blob: Blob, kind: AssetKind, name: string) => Promise<AssetRef>;
  setSceneAsset: (sceneId: number, blob: Blob, kind: "image" | "video", name: string) => Promise<void>;
  removeSceneAsset: (sceneId: number) => Promise<void>;
  addCharacterRef: (blob: Blob, name: string) => Promise<void>;
  removeCharacterRef: (key: string) => Promise<void>;
  setVoiceover: (blob: Blob, name: string) => Promise<void>;
  removeVoiceover: () => Promise<void>;
  setCustomSfx: (type: RealSfx, blob: Blob, name: string) => Promise<void>;
  removeCustomSfx: (type: RealSfx) => Promise<void>;

  newProject: () => Promise<void>;
  loadDemo: (which?: "plane" | "parachute") => Promise<void>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  importProject: (project: Project, blobs: Record<string, Blob>) => Promise<void>;
  listProjects: () => Promise<Project[]>;
  saveNow: () => Promise<void>;
}

let toastSeq = 1;
/** True once a real project (loaded or created) is active – prevents persisting the placeholder. */
let projectActivated = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const useStudio = create<StudioState>((set, get) => {
  const mutateProject = (fn: (p: Project) => Project) => {
    const next = fn(get().project);
    set({ project: { ...next, updatedAt: Date.now() } });
  };

  const mutateScenes = (fn: (scenes: Scene[]) => Scene[]) =>
    mutateProject((p) => ({ ...p, script: { ...p.script, scenes: fn(p.script.scenes) } }));

  const dropKey = async (ref: AssetRef | null | undefined) => {
    if (!ref) return;
    evictMedia(ref.key);
    try {
      await deleteBlob(ref.key);
    } catch (e) {
      console.error(e);
    }
  };

  const activate = (project: Project) => {
    projectActivated = true;
    setLastProjectId(project.id);
    set({
      project: { ...project, captions: { ...DEFAULT_CAPTIONS, ...project.captions } },
      selectedSceneId: project.script.scenes[0]?.id ?? null,
    });
  };

  return {
    hydrated: false,
    project: emptyProject(),
    settings: loadSettings(),
    activeTab: "script",
    selectedSceneId: null,
    saveStatus: "saved",
    busy: null,
    toasts: [],

    async init() {
      if (get().hydrated) return;
      set({ settings: loadSettings() });
      useStudio.subscribe((s, prev) => {
        if (s.project !== prev.project && s.hydrated) {
          set({ saveStatus: "saving" });
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => void get().saveNow(), 600);
        }
      });
      try {
        const lastId = getLastProjectId();
        const existing = lastId ? await getProject(lastId) : null;
        if (existing) {
          activate(existing);
          set({ hydrated: true });
          return;
        }
        set({ hydrated: true });
        await get().loadDemo();
      } catch (e) {
        console.error(e);
        set({ hydrated: true });
        get().toast("error", "Không truy cập được IndexedDB – dữ liệu sẽ không được lưu.");
      }
    },

    async saveNow() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!projectActivated) return;
      try {
        await putProject(get().project);
        set({ saveStatus: "saved" });
      } catch (e) {
        console.error(e);
        set({ saveStatus: "error" });
      }
    },

    setTab: (t) => set({ activeTab: t }),
    selectScene: (id) => set({ selectedSceneId: id }),
    setBusy: (msg) => set({ busy: msg }),

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      saveSettings(settings);
      set({ settings });
    },

    toast(type, text) {
      const id = toastSeq++;
      set({ toasts: [...get().toasts, { id, type, text }] });
      setTimeout(() => get().dismissToast(id), type === "error" ? 7000 : 3500);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    renameProject: (name) => mutateProject((p) => ({ ...p, name })),

    setScript(script, opts = {}) {
      const p = get().project;
      const keepAssets = opts.keepAssets ?? true;
      const keep = new Set(keepAssets ? script.scenes.map((s) => String(s.id)) : []);
      const removed = Object.entries(p.sceneAssets).filter(([k]) => !keep.has(k));
      removed.forEach(([, ref]) => void dropKey(ref));
      const sceneAssets = Object.fromEntries(Object.entries(p.sceneAssets).filter(([k]) => keep.has(k)));
      // a brand-new script no longer matches the old voice track
      if (!keepAssets && p.voiceover) void dropKey(p.voiceover);
      mutateProject((pp) => ({
        ...pp,
        name: script.title || pp.name,
        script,
        sceneAssets,
        voiceover: keepAssets ? pp.voiceover : null,
      }));
      set({ selectedSceneId: script.scenes[0]?.id ?? null });
    },

    patchScript: (patch) => mutateProject((p) => ({ ...p, script: { ...p.script, ...patch } })),

    updateScene: (id, patch) =>
      mutateScenes((scenes) =>
        scenes.map((s) =>
          s.id === id
            ? {
                ...s,
                ...patch,
                duration: patch.duration !== undefined ? Math.max(MIN_SCENE_DURATION, round1(patch.duration)) : s.duration,
              }
            : s,
        ),
      ),

    addScene(afterId) {
      const scenes = get().project.script.scenes;
      const id = scenes.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      const scene: Scene = {
        id,
        duration: 3,
        narration: "",
        shotType: "medium",
        cameraEffect: "static",
        sfx: "none",
        imagePrompt: `New scene, ${STYLE_LOCK}`,
      };
      mutateScenes((list) => {
        const idx = afterId === undefined ? list.length - 1 : list.findIndex((s) => s.id === afterId);
        const copy = [...list];
        copy.splice(idx + 1, 0, scene);
        return copy;
      });
      set({ selectedSceneId: id });
    },

    removeScene(id) {
      const ref = get().project.sceneAssets[String(id)];
      void dropKey(ref);
      mutateProject((p) => {
        const sceneAssets = { ...p.sceneAssets };
        delete sceneAssets[String(id)];
        return { ...p, sceneAssets, script: { ...p.script, scenes: p.script.scenes.filter((s) => s.id !== id) } };
      });
    },

    moveScene(id, dir) {
      mutateScenes((list) => {
        const i = list.findIndex((s) => s.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return list;
        const copy = [...list];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        return copy;
      });
    },

    setDurations(durations) {
      mutateScenes((list) =>
        list.map((s, i) => (durations[i] !== undefined ? { ...s, duration: Math.max(MIN_SCENE_DURATION, round1(durations[i])) } : s)),
      );
    },

    setCaptions: (patch) => mutateProject((p) => ({ ...p, captions: { ...p.captions, ...patch } })),

    async storeAsset(blob, kind, name) {
      const key = uid("a_");
      await putBlob(key, blob);
      primeBlob(key, blob);
      return { key, kind, mime: blob.type || (kind === "audio" ? "audio/wav" : "image/png"), name };
    },

    async setSceneAsset(sceneId, blob, kind, name) {
      const ref = await get().storeAsset(blob, kind, name);
      const old = get().project.sceneAssets[String(sceneId)];
      mutateProject((p) => ({ ...p, sceneAssets: { ...p.sceneAssets, [String(sceneId)]: ref } }));
      await dropKey(old);
    },

    async removeSceneAsset(sceneId) {
      const old = get().project.sceneAssets[String(sceneId)];
      mutateProject((p) => {
        const sceneAssets = { ...p.sceneAssets };
        delete sceneAssets[String(sceneId)];
        return { ...p, sceneAssets };
      });
      await dropKey(old);
    },

    async addCharacterRef(blob, name) {
      if (get().project.characterRefs.length >= 4) {
        get().toast("error", "Tối đa 4 ảnh tham chiếu nhân vật.");
        return;
      }
      const ref = await get().storeAsset(blob, "image", name);
      mutateProject((p) => ({ ...p, characterRefs: [...p.characterRefs, ref].slice(0, 4) }));
    },

    async removeCharacterRef(key) {
      const old = get().project.characterRefs.find((r) => r.key === key);
      mutateProject((p) => ({ ...p, characterRefs: p.characterRefs.filter((r) => r.key !== key) }));
      await dropKey(old);
    },

    async setVoiceover(blob, name) {
      const ref = await get().storeAsset(blob, "audio", name);
      const old = get().project.voiceover;
      mutateProject((p) => ({ ...p, voiceover: ref }));
      await dropKey(old);
    },

    async removeVoiceover() {
      const old = get().project.voiceover;
      mutateProject((p) => ({ ...p, voiceover: null }));
      await dropKey(old);
    },

    async setCustomSfx(type, blob, name) {
      const ref = await get().storeAsset(blob, "audio", name);
      const old = get().project.customSfx[type];
      mutateProject((p) => ({ ...p, customSfx: { ...p.customSfx, [type]: ref } }));
      await dropKey(old);
    },

    async removeCustomSfx(type) {
      const old = get().project.customSfx[type];
      mutateProject((p) => {
        const customSfx = { ...p.customSfx };
        delete customSfx[type];
        return { ...p, customSfx };
      });
      await dropKey(old);
    },

    async newProject() {
      await get().saveNow();
      const p = emptyProject();
      await putProject(p);
      activate(p);
      set({ activeTab: "script" });
    },

    async loadDemo(which = "plane") {
      set({ busy: "Đang vẽ project demo (stickman)…" });
      try {
        await get().saveNow();
        const { project, blobs } =
          which === "parachute"
            ? await (await import("@/lib/demoParachute")).buildParachuteProject()
            : await (await import("@/lib/demo")).buildDemoProject();
        for (const [k, b] of Object.entries(blobs)) {
          await putBlob(k, b);
          primeBlob(k, b);
        }
        await putProject(project);
        activate(project);
        get().toast(
          "success",
          which === "parachute"
            ? "Đã nạp demo “Three Parachutes”. Vào Tab 3 bấm “Đọc từng cảnh” để tạo giọng Anh."
            : "Đã nạp project demo “Chuyến bay định mệnh”. Bấm Play để xem!",
        );
      } catch (e) {
        console.error(e);
        get().toast("error", `Không tạo được demo: ${(e as Error).message}`);
      } finally {
        set({ busy: null });
      }
    },

    async openProject(id) {
      await get().saveNow();
      const p = await getProject(id);
      if (!p) {
        get().toast("error", "Không tìm thấy project.");
        return;
      }
      activate(p);
    },

    async deleteProject(id) {
      const p = await getProject(id);
      if (!p) return;
      await deleteProjectDeep(p);
      if (get().project.id === id) {
        const rest = await listProjects();
        if (rest[0]) activate(rest[0]);
        else {
          const fresh = emptyProject();
          await putProject(fresh);
          activate(fresh);
        }
      }
    },

    async importProject(project, blobs) {
      await get().saveNow();
      for (const [k, b] of Object.entries(blobs)) {
        await putBlob(k, b);
        primeBlob(k, b);
      }
      const p = { ...project, updatedAt: Date.now() };
      await putProject(p);
      activate(p);
    },

    listProjects: () => listProjects(),
  };
});
