"use client";

import { useEffect, useState } from "react";
import {
  AudioWaveform,
  Clapperboard,
  CheckCircle2,
  CloudOff,
  FilePlus2,
  FolderOpen,
  Images,
  Loader2,
  Plane,
  ScrollText,
  Settings as SettingsIcon,
  XCircle,
  Info,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import { getPlayer } from "@/lib/player";
import type { TabId } from "@/lib/types";
import { cx } from "./ui";
import ScriptTab from "./tabs/ScriptTab";
import VisualTab from "./tabs/VisualTab";
import AudioTab from "./tabs/AudioTab";
import ExportTab from "./tabs/ExportTab";
import PreviewPanel from "./PreviewPanel";
import Timeline from "./Timeline";
import SettingsModal from "./SettingsModal";
import ProjectsModal from "./ProjectsModal";

const TABS: { id: TabId; label: string; sub: string; icon: typeof ScrollText }[] = [
  { id: "script", label: "Script & JSON", sub: "Đạo diễn kịch bản", icon: ScrollText },
  { id: "visual", label: "Visual Studio", sub: "Hình ảnh & nhân vật", icon: Images },
  { id: "audio", label: "Audio & Timeline", sub: "Giọng đọc, SFX, sync", icon: AudioWaveform },
  { id: "export", label: "Engine & Export", sub: "Phụ đề, xuất 9:16", icon: Clapperboard },
];

export default function Studio() {
  const init = useStudio((s) => s.init);
  const hydrated = useStudio((s) => s.hydrated);
  const activeTab = useStudio((s) => s.activeTab);
  const setTab = useStudio((s) => s.setTab);
  const busy = useStudio((s) => s.busy);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        getPlayer().toggle();
      }
    };
    const onUnload = () => void useStudio.getState().saveNow();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 lg:h-screen lg:overflow-hidden">
      <Header onSettings={() => setSettingsOpen(true)} onProjects={() => setProjectsOpen(true)} />
      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <nav className="order-1 flex shrink-0 gap-1 overflow-x-auto border-b border-ink-700 bg-ink-900 p-2 lg:w-52 lg:flex-col lg:border-r lg:border-b-0">
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "group flex min-w-[150px] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors lg:min-w-0",
                  active ? "bg-accent/15 text-white ring-1 ring-accent/40" : "text-gray-400 hover:bg-ink-800 hover:text-gray-100",
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                    active ? "bg-accent text-ink-950" : "bg-ink-700 text-gray-300",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">{t.sub}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-auto hidden rounded-lg border border-ink-700 bg-ink-850 p-3 text-[11px] leading-relaxed text-gray-500 lg:block">
            <b className="text-gray-300">Phím tắt</b>
            <br />
            Space: Play / Pause
            <br />
            Click timeline: tua
            <br />
            Kéo vạch giữa cảnh: căn nhịp 0.1s
          </div>
        </nav>
        <main className="order-3 min-w-0 p-4 lg:order-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {!hydrated ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải dữ liệu…
            </div>
          ) : activeTab === "script" ? (
            <ScriptTab onOpenSettings={() => setSettingsOpen(true)} />
          ) : activeTab === "visual" ? (
            <VisualTab onOpenSettings={() => setSettingsOpen(true)} />
          ) : activeTab === "audio" ? (
            <AudioTab />
          ) : (
            <ExportTab />
          )}
        </main>
        <aside className="order-2 shrink-0 border-b lg:order-3 lg:border-b-0 border-t border-ink-700 bg-ink-900 lg:w-[360px] lg:border-t-0 lg:border-l xl:w-[420px]">
          <PreviewPanel />
        </aside>
      </div>
      <Timeline />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <Toasts />
      {busy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 px-5 py-4 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-accent" /> {busy}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ onSettings, onProjects }: { onSettings: () => void; onProjects: () => void }) {
  const name = useStudio((s) => s.project.name);
  const rename = useStudio((s) => s.renameProject);
  const saveStatus = useStudio((s) => s.saveStatus);
  const newProject = useStudio((s) => s.newProject);
  const loadDemo = useStudio((s) => s.loadDemo);
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-900 px-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-black bg-white text-[13px] font-black text-black shadow-[0_0_0_2px_#f5b301]">
          ◕‿◕
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-extrabold tracking-tight">
            StickToon <span className="text-accent">Studio</span>
          </div>
          <div className="text-[10px] text-gray-500">9:16 comedy cartoon maker</div>
        </div>
      </div>
      <div className="mx-2 h-6 w-px bg-ink-700" />
      <input
        value={name}
        onChange={(e) => rename(e.target.value)}
        className="w-40 min-w-0 rounded bg-transparent px-2 py-1 text-sm font-medium text-gray-100 outline-none hover:bg-ink-800 focus:bg-ink-800 sm:w-64"
        aria-label="Tên project"
      />
      <span className="hidden items-center gap-1 text-[11px] text-gray-500 md:flex">
        {saveStatus === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu…
          </>
        ) : saveStatus === "error" ? (
          <>
            <CloudOff className="h-3 w-3 text-red-400" /> Lỗi lưu
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Đã lưu (IndexedDB)
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <HeaderBtn icon={<FolderOpen className="h-4 w-4" />} label="Projects" onClick={onProjects} />
        <HeaderBtn icon={<FilePlus2 className="h-4 w-4" />} label="Mới" onClick={() => void newProject()} />
        <div className="relative">
          <HeaderBtn icon={<Plane className="h-4 w-4" />} label="Demo" onClick={() => setDemoOpen((o) => !o)} />
          {demoOpen && (
            <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-ink-600 bg-ink-850 p-1 shadow-xl" onMouseLeave={() => setDemoOpen(false)}>
              {(
                [
                  ["plane", "Chuyến bay định mệnh", "5 cảnh · tiếng Việt"],
                  ["parachute", "Three Parachutes", "10 cảnh · tiếng Anh"],
                ] as const
              ).map(([id, title, sub]) => (
                <button
                  key={id}
                  onClick={() => {
                    setDemoOpen(false);
                    void loadDemo(id);
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-ink-700"
                >
                  <span className="block text-sm font-semibold text-gray-100">{title}</span>
                  <span className="block text-[11px] text-gray-500">{sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onSettings}
          className={cx(
            "ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm",
            "text-gray-300 hover:bg-ink-700",
          )}
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Cài đặt</span>
        </button>
      </div>
    </header>
  );
}

function HeaderBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-gray-300 hover:bg-ink-700 hover:text-white">
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function Toasts() {
  const toasts = useStudio((s) => s.toasts);
  const dismiss = useStudio((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            "pointer-events-auto flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-xl",
            t.type === "error"
              ? "border-red-500/40 bg-red-950/90 text-red-100"
              : t.type === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
                : "border-ink-600 bg-ink-800 text-gray-100",
          )}
        >
          {t.type === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : t.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
