"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Trash2, FileArchive } from "lucide-react";
import { useStudio } from "@/store/studio";
import { importProjectZip } from "@/lib/zip";
import type { Project } from "@/lib/types";
import { Button, DropZone, Modal, cx } from "./ui";

export default function ProjectsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useStudio((s) => s.listProjects);
  const openProject = useStudio((s) => s.openProject);
  const deleteProject = useStudio((s) => s.deleteProject);
  const importProject = useStudio((s) => s.importProject);
  const currentId = useStudio((s) => s.project.id);
  const toast = useStudio((s) => s.toast);
  const setBusy = useStudio((s) => s.setBusy);
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(async () => {
    await useStudio.getState().saveNow();
    setProjects(await list());
  }, [list]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onImport = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy("Đang giải nén project ZIP…");
    try {
      const { project, blobs } = await importProjectZip(f);
      await importProject(project, blobs);
      toast("success", `Đã import “${project.name}”.`);
      onClose();
    } catch (e) {
      toast("error", `Import thất bại: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Projects đã lưu (IndexedDB)" wide>
      <div className="space-y-4">
        <DropZone accept=".zip,application/zip" onFiles={onImport}>
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-gray-400">
            <FileArchive className="h-5 w-5" /> Kéo-thả file <b className="text-gray-200">Project ZIP</b> (xuất từ StickToon) để import
          </div>
        </DropZone>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {projects.length === 0 && <p className="text-center text-sm text-gray-500">Chưa có project nào.</p>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={cx("flex items-center gap-3 rounded-lg border px-3 py-2.5", p.id === currentId ? "border-accent/50 bg-accent/5" : "border-ink-700 bg-ink-900")}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-gray-500">
                  {p.script.scenes.length} cảnh · {Object.keys(p.sceneAssets).length} asset · cập nhật {new Date(p.updatedAt).toLocaleString("vi-VN")}
                </div>
              </div>
              {p.id === currentId ? (
                <span className="text-xs text-accent">Đang mở</span>
              ) : (
                <Button
                  size="sm"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await openProject(p.id);
                    onClose();
                  }}
                >
                  Mở
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={async () => {
                  if (!window.confirm(`Xóa vĩnh viễn project “${p.name}” và toàn bộ ảnh/audio của nó?`)) return;
                  await deleteProject(p.id);
                  await refresh();
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
