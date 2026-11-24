"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { getObjectUrl, getCachedUrl } from "@/lib/media";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading,
  className,
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: "bg-accent text-ink-950 hover:bg-accent-600 font-semibold",
    secondary: "bg-ink-700 text-gray-100 hover:bg-ink-600 border border-ink-600",
    ghost: "text-gray-300 hover:bg-ink-700 hover:text-white",
    danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Panel({ title, icon, actions, children, className }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-ink-700 bg-ink-850", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
            {icon}
            {title}
          </h3>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-400">
      <span>{children}</span>
      {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-accent/70 focus:ring-1 focus:ring-accent/40";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "resize-y leading-relaxed", props.className)} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cx(inputCls, "pr-6", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm text-gray-200">
      <span className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-accent" : "bg-ink-600")}>
        <span
          className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")}
        />
      </span>
      {label}
    </button>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: ReactNode }) {
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-gray-400">{label}</div>}
      <div className="h-2 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </div>
    </div>
  );
}

export function useObjectUrl(key: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (key ? getCachedUrl(key) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!key) {
      setUrl(null);
      return;
    }
    const cached = getCachedUrl(key);
    if (cached) setUrl(cached);
    else
      getObjectUrl(key).then((u) => {
        if (alive) setUrl(u);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  return url;
}

export function DropZone({
  accept,
  onFiles,
  children,
  className,
  multiple,
  disabled,
}: {
  accept: string;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
  className?: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cx(
        "cursor-pointer rounded-lg border border-dashed transition-colors",
        over ? "border-accent bg-accent/10" : "border-ink-600 hover:border-ink-500",
        className,
      )}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      {children ?? (
        <div className="flex flex-col items-center justify-center gap-1 p-4 text-xs text-gray-400">
          <UploadCloud className="h-5 w-5" />
          Kéo-thả hoặc bấm để chọn file
        </div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={cx("mt-10 w-full rounded-xl border border-ink-600 bg-ink-850 shadow-2xl", wide ? "max-w-3xl" : "max-w-xl")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-ink-700 hover:text-white" aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function fmtTime(t: number, precise = true): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${precise ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0")}`;
}

/** Numeric input that keeps a free-typing draft and commits on blur / Enter. */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 0.1,
  className,
  title,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    if (Number.isFinite(n)) {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onCommit(Math.round(v * 10) / 10);
    }
    setDraft(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = draft !== null ? Number(draft) || value : value;
          let v = Math.round((base + (e.key === "ArrowUp" ? step : -step)) * 10) / 10;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          setDraft(null);
          onCommit(v);
        }
      }}
      className={cx(inputCls, "font-mono", className)}
    />
  );
}
