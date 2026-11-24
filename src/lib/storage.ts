import { DEFAULT_SETTINGS } from "./constants";
import type { Project, Settings } from "./types";

/* ---------------- localStorage: settings & API key ---------------- */

const SETTINGS_KEY = "sticktoon.settings.v1";
const LAST_PROJECT_KEY = "sticktoon.lastProject.v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked – settings remain in memory */
  }
}

export function getLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    /* ignore */
  }
}

/* ---------------- IndexedDB: projects & binary assets ---------------- */

const DB_NAME = "sticktoon-studio";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_BLOBS = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Không mở được IndexedDB"));
    };
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  const t = db.transaction(store, mode);
  const result = await reqToPromise(fn(t.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
  });
  return result;
}

export function putBlob(key: string, blob: Blob): Promise<IDBValidKey> {
  return tx(STORE_BLOBS, "readwrite", (s) => s.put(blob, key));
}

export async function getBlob(key: string): Promise<Blob | null> {
  const v = await tx<unknown>(STORE_BLOBS, "readonly", (s) => s.get(key));
  return v instanceof Blob ? v : null;
}

export async function deleteBlob(key: string): Promise<void> {
  await tx(STORE_BLOBS, "readwrite", (s) => s.delete(key));
}

export function putProject(p: Project): Promise<IDBValidKey> {
  return tx(STORE_PROJECTS, "readwrite", (s) => s.put(p));
}

export async function getProject(id: string): Promise<Project | null> {
  const v = await tx<unknown>(STORE_PROJECTS, "readonly", (s) => s.get(id));
  return (v as Project) ?? null;
}

export async function listProjects(): Promise<Project[]> {
  const all = await tx<unknown[]>(STORE_PROJECTS, "readonly", (s) => s.getAll());
  return (all as Project[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProjectDeep(p: Project): Promise<void> {
  const keys = collectAssetKeys(p);
  for (const k of keys) await deleteBlob(k);
  await tx(STORE_PROJECTS, "readwrite", (s) => s.delete(p.id));
}

export function collectAssetKeys(p: Project): string[] {
  const keys: string[] = [];
  Object.values(p.sceneAssets).forEach((a) => keys.push(a.key));
  p.characterRefs.forEach((a) => keys.push(a.key));
  if (p.voiceover) keys.push(p.voiceover.key);
  Object.values(p.customSfx).forEach((a) => a && keys.push(a.key));
  return keys;
}

export function uid(prefix = ""): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return prefix + rnd;
}
